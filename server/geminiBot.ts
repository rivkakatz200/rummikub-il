/**
 * server/geminiBot.ts
 *
 * Bot move pipeline:
 *  1. Run rummikubSolver → get top solutions.
 *  2. If no solution → draw (no Gemini call).
 *  3. If exactly one solution, or Gemini unavailable → play best solution.
 *  4. If multiple solutions → ask Gemini to pick the best index (compact JSON).
 *  5. Validate Gemini's choice; on any error → use solver's best.
 *  6. Heuristic botFindMove is last-resort fallback if solver throws.
 *
 * Log line fields: source, tilesPlaced, solverMs, rearranged.
 */

import { GoogleGenAI } from '@google/genai';
import { Tile, TileSet } from '../src/types/rummikub.js';
import { botFindMove } from '../src/utils/rummikubRules.js';
import { solveBestMove, BotDifficulty, SolverSolution } from './rummikubSolver.js';

const TIMEOUT_MS = 9_000;

// ─── Lazy config ──────────────────────────────────────────────────────────────

interface GeminiConfig { apiKey: string; model: string; }
let _config: GeminiConfig | null = null;
let _client: GoogleGenAI | null = null;
let _warnedMissingKey = false;

function getConfig(): GeminiConfig {
  if (!_config) {
    _config = {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model:  process.env.GEMINI_MODEL  ?? 'gemini-2.0-flash',
    };
  }
  return _config;
}

function getClient(): GoogleGenAI | null {
  const { apiKey } = getConfig();
  if (!apiKey) return null;
  if (!_client) _client = new GoogleGenAI({ apiKey });
  return _client;
}

export function getGeminiConfig(): { geminiConfigured: boolean; geminiModel: string } {
  const { apiKey, model } = getConfig();
  const configured = Boolean(apiKey);
  if (!configured && !_warnedMissingKey) {
    _warnedMissingKey = true;
    console.warn('[geminiBot] GEMINI_API_KEY not set — bot uses solver/heuristic only.');
  }
  console.log(`[geminiBot] configured=${configured} model=${model}`);
  return { geminiConfigured: configured, geminiModel: model };
}

// ─── Per-room concurrency guard ───────────────────────────────────────────────

const _inFlight = new Map<string, boolean>();
function acquireLock(roomId: string): boolean {
  if (_inFlight.get(roomId)) return false;
  _inFlight.set(roomId, true);
  return true;
}
function releaseLock(roomId: string): void { _inFlight.delete(roomId); }

// ─── Public types ─────────────────────────────────────────────────────────────

export type FallbackReason =
  | 'missing-key' | 'concurrent-call' | 'timeout' | 'rate-limited'
  | 'model-not-found' | 'api-error' | 'invalid-json' | 'invalid-index'
  | 'invalid-move' | 'solver-only' | 'none';

export interface BotMoveResult {
  action: 'play' | 'draw';
  newBoard?: TileSet[];
  newRack?: Tile[];
  source: 'gemini-choice' | 'solver' | 'fallback-heuristic';
  fallbackReason: FallbackReason;
  latencyMs: number;
  tilesPlaced: number;
  solverMs: number;
  rearranged: boolean;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function geminiBotMove(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
  roomId: string,
  difficulty: BotDifficulty = 'hard',
  opponentTileCounts: number[] = [],
): Promise<BotMoveResult> {
  const t0 = Date.now();

  // ── Step 1: Run solver ────────────────────────────────────────────────────
  let solverResult;
  try {
    solverResult = solveBestMove(rack, board, hasInitialMeld, minInitialMeld, {
      timeBudgetMs: 1500,
      maxSolutions: 5,
      difficulty,
    });
  } catch (err) {
    console.error(`[geminiBot] solver threw for room=${roomId}:`, err);
    // Last-resort heuristic fallback
    const heuristic = botFindMove(rack, board, hasInitialMeld, minInitialMeld);
    return {
      ...heuristic,
      source: 'fallback-heuristic',
      fallbackReason: 'api-error',
      latencyMs: Date.now() - t0,
      tilesPlaced: 0,
      solverMs: 0,
      rearranged: false,
    };
  }

  const solverMs = solverResult.solverMs;

  // ── Step 2: No solution → draw ────────────────────────────────────────────
  if (solverResult.solutions.length === 0) {
    return {
      action: 'draw',
      source: 'solver',
      fallbackReason: 'none',
      latencyMs: Date.now() - t0,
      tilesPlaced: 0,
      solverMs,
      rearranged: false,
    };
  }

  const best = solverResult.solutions[0];

  // ── Step 3: Single solution or Gemini unavailable → play best ─────────────
  const client = getClient();
  if (!client || solverResult.solutions.length === 1) {
    if (!client && !_warnedMissingKey) {
      _warnedMissingKey = true;
      console.warn('[geminiBot] GEMINI_API_KEY not set — using solver only.');
    }
    return makeSolverResult(best, t0, solverMs, client ? 'solver-only' : 'missing-key');
  }

  // ── Step 4: Multiple solutions → ask Gemini to pick ───────────────────────
  if (!acquireLock(roomId)) {
    return makeSolverResult(best, t0, solverMs, 'concurrent-call');
  }

  try {
    const chosen = await askGemini(
      client, rack, board, hasInitialMeld, minInitialMeld,
      poolCount, botName, difficulty, opponentTileCounts,
      solverResult.solutions, t0,
    );
    return { ...chosen, solverMs };
  } finally {
    releaseLock(roomId);
  }
}

function makeSolverResult(
  sol: SolverSolution,
  t0: number,
  solverMs: number,
  reason: FallbackReason,
): BotMoveResult {
  return {
    action: 'play',
    newBoard: sol.newBoard,
    newRack: sol.newRack,
    source: 'solver',
    fallbackReason: reason,
    latencyMs: Date.now() - t0,
    tilesPlaced: sol.tilesPlaced,
    solverMs,
    rearranged: sol.rearranged,
  };
}

// ─── Gemini choice call ───────────────────────────────────────────────────────

async function askGemini(
  client: GoogleGenAI,
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
  difficulty: BotDifficulty,
  opponentTileCounts: number[],
  solutions: SolverSolution[],
  t0: number,
): Promise<BotMoveResult> {
  const { model } = getConfig();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const prompt = buildChoicePrompt(
      rack, board, hasInitialMeld, minInitialMeld,
      poolCount, botName, difficulty, opponentTileCounts, solutions,
    );

    const schema = {
      type: 'object',
      properties: {
        choice: { type: 'integer', description: 'Index of chosen solution (0-based)' },
        reason: { type: 'string' },
      },
      required: ['choice'],
    };

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    });

    clearTimeout(timeoutHandle);
    const text = response.text ?? '{}';

    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return makeSolverResult(solutions[0], t0, 0, 'invalid-json');
    }

    const idx = typeof parsed.choice === 'number' ? parsed.choice : -1;
    if (idx < 0 || idx >= solutions.length) {
      return makeSolverResult(solutions[0], t0, 0, 'invalid-index');
    }

    const chosen = solutions[idx];
    return {
      action: 'play',
      newBoard: chosen.newBoard,
      newRack: chosen.newRack,
      source: 'gemini-choice',
      fallbackReason: 'none',
      latencyMs: Date.now() - t0,
      tilesPlaced: chosen.tilesPlaced,
      solverMs: 0,
      rearranged: chosen.rearranged,
    };
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    const msg: string = err?.message ?? String(err);
    let reason: FallbackReason = 'api-error';
    if (err?.name === 'AbortError') reason = 'timeout';
    else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) reason = 'rate-limited';
    else if (msg.includes('404') || msg.includes('MODEL_NOT_FOUND')) {
      reason = 'model-not-found';
      console.error(`[geminiBot] model-not-found: GEMINI_MODEL="${getConfig().model}" may be wrong.`);
    }
    return makeSolverResult(solutions[0], t0, 0, reason);
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildChoicePrompt(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
  difficulty: BotDifficulty,
  opponentTileCounts: number[],
  solutions: SolverSolution[],
): string {
  const diffLabel = difficulty === 'easy' ? 'קל' : difficulty === 'medium' ? 'בינוני' : 'קשה';
  const oppStr = opponentTileCounts.map((c, i) => `יריב ${i + 1}: ${c} אריחים`).join(', ');

  const summaries = solutions.map((s, i) => {
    const rackLeft = s.newRack.map(t => t.isJoker ? 'JOKER' : `${t.number}${t.color[0].toUpperCase()}`).join(' ');
    return `${i}: הורד ${s.tilesPlaced} אריחים (${s.pointsPlaced} נק'), ג'וקרים בשימוש: ${s.jokersUsed}, סדרות שונו: ${s.setsChanged}, סידור מחדש: ${s.rearranged ? 'כן' : 'לא'}, נשאר ביד: [${rackLeft}]`;
  });

  return `אתה בוט רומיקוב ישראלי בשם ${botName} (רמת קושי: ${diffLabel}).

מצב המשחק:
- היד שלך (${rack.length} אריחים): ${rack.map(t => t.isJoker ? 'JOKER' : `${t.number}${t.color[0].toUpperCase()}`).join(' ')}
- לוח: ${board.length} סדרות
- קופה: ${poolCount} אריחים
- פתיחה ראשונית בוצעה: ${hasInitialMeld} (מינימום: ${minInitialMeld} נק')
- יריבים: ${oppStr || 'אין מידע'}

אפשרויות מהלך (כולן חוקיות, מחושבות על ידי הסולבר):
${summaries.join('\n')}

שיקולים אסטרטגיים:
- העדף להוריד כמה שיותר אריחים.
- אל תבזבז ג'וקר אלא אם הוא מאפשר להוריד יותר אריחים או לנצח.
- אם יריב קרוב לניצחון (מעט אריחים), הורד כמה שיותר.
- העדף לשמור ג'וקרים ביד לתורות הבאים אם ההפרש בין האפשרויות קטן.

ענה רק ב-JSON: {"choice": <מספר>, "reason": "<קצר>"}`;
}
