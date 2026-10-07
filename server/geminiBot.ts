/**
 * server/geminiBot.ts
 *
 * All Gemini API logic for bot moves. Never imported by any client-side file.
 * The API key is read lazily from process.env at call time (not at import time),
 * so loadEnv.ts has already populated process.env before this module is used.
 *
 * Strategy (candidate-list approach):
 *   1. Enumerate legal candidate moves with the existing heuristic rule code.
 *   2. Send the candidates as a numbered list to Gemini; ask it to pick the best index.
 *   3. If no candidates exist (initial meld from scratch), use free-form mode and
 *      validate the result with the rule functions.
 *   4. On any error / timeout / bad output → fall back to heuristic immediately.
 */

import { GoogleGenAI } from '@google/genai';
import { Tile, TileSet } from '../src/types/rummikub.js';
import {
  botFindMove,
  validateBoard,
  calculateInitialMeldPoints,
  findCandidateMoves,
} from '../src/utils/rummikubRules.js';

type CandidateMove = { action: 'play' | 'draw'; newBoard?: TileSet[]; newRack?: Tile[] };

const TIMEOUT_MS = 9_000;

// ─── Lazy config (read at call time, not at import time) ──────────────────────

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

/** Called once at server startup to log config status and return health fields. */
export function getGeminiConfig(): { geminiConfigured: boolean; geminiModel: string } {
  const { apiKey, model } = getConfig();
  const configured = Boolean(apiKey);
  if (!configured && !_warnedMissingKey) {
    _warnedMissingKey = true;
    console.warn('[geminiBot] GEMINI_API_KEY is not set — bot will always use heuristic fallback.');
  }
  console.log(`[geminiBot] configured=${configured} model=${model}`);
  return { geminiConfigured: configured, geminiModel: model };
}

// ─── Per-room concurrency guard ───────────────────────────────────────────────
// Prevents two rooms from blocking each other on the free-tier rate limit.

const _inFlight = new Map<string, boolean>();

function acquireLock(roomId: string): boolean {
  if (_inFlight.get(roomId)) return false;
  _inFlight.set(roomId, true);
  return true;
}

function releaseLock(roomId: string): void {
  _inFlight.delete(roomId);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type FallbackReason =
  | 'missing-key'
  | 'concurrent-call'
  | 'timeout'
  | 'rate-limited'
  | 'model-not-found'
  | 'api-error'
  | 'invalid-json'
  | 'invalid-index'
  | 'invalid-move'
  | 'none';

export interface BotMoveResult {
  action: 'play' | 'draw';
  newBoard?: TileSet[];
  newRack?: Tile[];
  source: 'gemini' | 'gemini-retry' | 'fallback';
  fallbackReason: FallbackReason;
  latencyMs: number;
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
): Promise<BotMoveResult> {
  const t0 = Date.now();

  const client = getClient();
  if (!client) {
    if (!_warnedMissingKey) {
      _warnedMissingKey = true;
      console.warn('[geminiBot] GEMINI_API_KEY is not set — bot will always use heuristic fallback.');
    }
    return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), latencyMs: Date.now() - t0, fallbackReason: 'missing-key' };
  }

  if (!acquireLock(roomId)) {
    return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), latencyMs: Date.now() - t0, fallbackReason: 'concurrent-call' };
  }

  try {
    return await callGemini(client, rack, board, hasInitialMeld, minInitialMeld, poolCount, botName, roomId, false, t0);
  } finally {
    releaseLock(roomId);
  }
}

// ─── Core Gemini call ─────────────────────────────────────────────────────────

async function callGemini(
  client: GoogleGenAI,
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
  roomId: string,
  isRetry: boolean,
  t0: number,
  retryHint?: string,
): Promise<BotMoveResult> {
  const source = isRetry ? 'gemini-retry' : 'gemini';
  const { model } = getConfig();

  const candidates: CandidateMove[] = findCandidateMoves(rack, board, hasInitialMeld, minInitialMeld);

  // AbortController so a late response is never applied after timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let prompt: string;
    let schema: object;

    if (candidates.length > 0) {
      prompt = buildCandidatePrompt(rack, board, hasInitialMeld, minInitialMeld, poolCount, candidates, retryHint);
      schema = {
        type: 'object',
        properties: {
          chosenIndex: { type: 'integer', description: 'Index of the chosen candidate (0-based)' },
          reasoning:   { type: 'string' },
        },
        required: ['chosenIndex'],
      };
    } else {
      prompt = buildFreeFormPrompt(rack, board, hasInitialMeld, minInitialMeld, poolCount, retryHint);
      schema = buildFreeFormSchema();
    }

    const responseText = await doApiCall(client, model, prompt, schema, controller.signal);
    clearTimeout(timeoutHandle);

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), source: 'fallback', latencyMs: Date.now() - t0, fallbackReason: 'invalid-json' };
    }

    if (candidates.length > 0) {
      const idx = typeof parsed.chosenIndex === 'number' ? parsed.chosenIndex : -1;
      if (idx >= 0 && idx < candidates.length) {
        const chosen = candidates[idx];
        return { action: chosen.action, newBoard: chosen.newBoard, newRack: chosen.newRack, source, latencyMs: Date.now() - t0, fallbackReason: 'none' };
      }
      return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), source: 'fallback', latencyMs: Date.now() - t0, fallbackReason: 'invalid-index' };
    } else {
      const validationError = validateFreeFormMove(parsed, rack, board, hasInitialMeld, minInitialMeld);
      if (!validationError) {
        const result: BotMoveResult = { action: parsed.action, source, latencyMs: Date.now() - t0, fallbackReason: 'none' };
        if (parsed.action === 'play') {
          result.newBoard = parsed.board as TileSet[];
          result.newRack  = parsed.tilesFromRack
            ? rack.filter(t => !(parsed.tilesFromRack as string[]).includes(t.id))
            : rack;
        }
        return result;
      }

      if (!isRetry) {
        // Release lock temporarily so the retry can acquire it
        releaseLock(roomId);
        const retryResult = await callGemini(client, rack, board, hasInitialMeld, minInitialMeld, poolCount, botName, roomId, true, t0, validationError);
        // Re-acquire is handled by the outer try/finally in geminiBotMove — we just return
        return retryResult;
      }
      return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), source: 'fallback', latencyMs: Date.now() - t0, fallbackReason: 'invalid-move' };
    }
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    const msg: string = err?.message ?? String(err);
    let reason: FallbackReason = 'api-error';

    if (err?.name === 'AbortError' || msg === 'TIMEOUT') {
      reason = 'timeout';
    } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      reason = 'rate-limited';
    } else if (msg.includes('404') || msg.includes('not found') || msg.includes('MODEL_NOT_FOUND')) {
      reason = 'model-not-found';
      console.error(`[geminiBot] model-not-found: GEMINI_MODEL="${getConfig().model}" is probably wrong or retired. Check https://ai.google.dev/gemini-api/docs/models`);
    }

    return { ...fallback(rack, board, hasInitialMeld, minInitialMeld), source: 'fallback', latencyMs: Date.now() - t0, fallbackReason: reason };
  }
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function doApiCall(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  schema: object,
  _signal: AbortSignal, // kept for future SDK support; AbortController.abort() covers timeout
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2,
    },
  });
  return response.text ?? '{}';
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildCandidatePrompt(
  rack: Tile[], board: TileSet[], hasInitialMeld: boolean,
  minInitialMeld: number, poolCount: number,
  candidates: CandidateMove[], retryHint?: string,
): string {
  const summaries = candidates.map((c, i) => {
    if (c.action === 'draw') return `${i}: DRAW a tile from the pool`;
    const placed = rack.filter(t => !c.newRack!.find(r => r.id === t.id));
    return `${i}: PLAY — place ${placed.length} tile(s): ${placed.map(tileStr).join(', ')}`;
  });

  return `You are playing Israeli Rummikub as a smart bot.

GAME STATE:
- Your rack (${rack.length} tiles): ${JSON.stringify(rack.map(compactTile))}
- Board melds (${board.length} sets): ${JSON.stringify(board.map(compactSet))}
- Draw pool: ${poolCount} tiles remaining
- Initial meld done: ${hasInitialMeld} (min points required: ${minInitialMeld})

CANDIDATE MOVES (pre-validated as legal):
${summaries.join('\n')}

Choose the index of the best move. Prefer moves that place more tiles.
${retryHint ? `\nPREVIOUS ATTEMPT ERROR: ${retryHint}` : ''}

Respond with JSON only.`;
}

function buildFreeFormPrompt(
  rack: Tile[], board: TileSet[], hasInitialMeld: boolean,
  minInitialMeld: number, poolCount: number, retryHint?: string,
): string {
  return `You are playing Israeli Rummikub. Decide the bot's move.

RULES SUMMARY:
- A GROUP: 3-4 tiles, same number, all different colors.
- A RUN: 3+ tiles, same color, consecutive numbers (1-13). No wrapping.
- Joker (number=0) can substitute any tile in a set.
- Initial meld: all new sets must come entirely from your rack and sum to >= ${minInitialMeld} points.
- After initial meld: you may rearrange the entire board freely; every set must remain valid and no tiles may be lost.
- If you cannot play, draw one tile (action="draw").

GAME STATE:
- Your rack (${rack.length} tiles): ${JSON.stringify(rack.map(compactTile))}
- Board melds (${board.length} sets): ${JSON.stringify(board.map(compactSet))}
- Draw pool: ${poolCount} tiles remaining
- Initial meld done: ${hasInitialMeld}

INSTRUCTIONS:
- If playing: return action="play", board=<full new board>, tilesFromRack=<array of tile IDs from your rack>.
- If drawing: return action="draw".
- Do NOT invent tiles. Only use tiles from your rack or already on the board.
- Every set on the returned board must be valid (group or run, >= 3 tiles).
${retryHint ? `\nPREVIOUS ATTEMPT WAS REJECTED: ${retryHint}. Fix this.` : ''}

Respond with JSON only.`;
}

function buildFreeFormSchema(): object {
  const tileSchema = {
    type: 'object',
    properties: {
      id:      { type: 'string' },
      color:   { type: 'string' },
      number:  { type: 'integer' },
      isJoker: { type: 'boolean' },
    },
    required: ['id', 'color', 'number'],
  };
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['play', 'draw'] },
      board: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:    { type: 'string' },
            tiles: { type: 'array', items: tileSchema },
          },
          required: ['id', 'tiles'],
        },
      },
      tilesFromRack: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of tiles taken from the rack',
      },
    },
    required: ['action'],
  };
}

// ─── Validation of free-form output ──────────────────────────────────────────

function validateFreeFormMove(
  parsed: any, rack: Tile[], board: TileSet[],
  hasInitialMeld: boolean, minInitialMeld: number,
): string | null {
  if (parsed.action === 'draw') return null;
  if (parsed.action !== 'play') return 'action must be "play" or "draw"';

  const proposedBoard: TileSet[] = parsed.board;
  if (!Array.isArray(proposedBoard)) return 'board must be an array';

  const originalBoardIds = new Set(board.flatMap(s => s.tiles.map(t => t.id)));
  const rackIds          = new Set(rack.map(t => t.id));
  const allLegalIds      = new Set([...originalBoardIds, ...rackIds]);
  const proposedIds      = proposedBoard.flatMap(s => s.tiles.map(t => t.id));

  for (const id of proposedIds) {
    if (!allLegalIds.has(id)) return `tile ${id} does not exist in rack or board`;
  }
  for (const id of originalBoardIds) {
    if (!proposedIds.includes(id)) return `original board tile ${id} is missing from proposed board`;
  }
  if (!proposedIds.some(id => rackIds.has(id))) return 'no tiles were played from the rack';

  const boardVal = validateBoard(proposedBoard);
  if (!boardVal.valid) return boardVal.errors[0] ?? 'invalid set on board';

  if (!hasInitialMeld && minInitialMeld > 0) {
    const meldResult = calculateInitialMeldPoints(proposedBoard, board, minInitialMeld);
    if (meldResult.touchedExisting) return 'initial meld cannot use existing board tiles';
    if (meldResult.points < minInitialMeld)
      return `initial meld only scores ${meldResult.points}, need ${minInitialMeld}`;
  }

  return null;
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

function fallback(
  rack: Tile[], board: TileSet[], hasInitialMeld: boolean, minInitialMeld: number,
): Omit<BotMoveResult, 'latencyMs' | 'fallbackReason'> {
  const result = botFindMove(rack, board, hasInitialMeld, minInitialMeld);
  return { ...result, source: 'fallback' };
}

// ─── Compact serialisers ──────────────────────────────────────────────────────

function tileStr(t: Tile): string {
  return t.isJoker ? 'JOKER' : `${t.number}${t.color[0].toUpperCase()}`;
}

function compactTile(t: Tile) {
  return t.isJoker ? { id: t.id, joker: true } : { id: t.id, c: t.color[0], n: t.number };
}

function compactSet(s: TileSet) {
  return { id: s.id, t: s.tiles.map(compactTile) };
}
