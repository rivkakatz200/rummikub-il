/**
 * server/geminiBot.ts
 *
 * All Gemini API logic for bot moves. Never imported by any client-side file.
 * The API key is read exclusively from process.env.GEMINI_API_KEY.
 *
 * Strategy (requirement #7 — candidate-list approach):
 *   1. Enumerate legal candidate moves with the existing heuristic rule code.
 *   2. Send the candidates as a numbered list to Gemini; ask it to pick the best index.
 *   3. If no candidates exist (e.g. bot must make initial meld from scratch), fall back
 *      to free-form board generation and validate the result with the rule functions.
 *   4. On any error / timeout / bad output → fall back to heuristic immediately.
 */

import { GoogleGenAI } from '@google/genai';
import {
  Tile,
  TileSet,
} from '../src/types/rummikub.js';
import {
  botFindMove,
  validateBoard,
  calculateInitialMeldPoints,
  findCandidateMoves,
} from '../src/utils/rummikubRules.js';

type CandidateMove = { action: 'play' | 'draw'; newBoard?: TileSet[]; newRack?: Tile[] };

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY = process.env.GEMINI_API_KEY ?? '';
const MODEL   = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
const TIMEOUT_MS = 9_000;

// Log a one-time warning if the key is absent
let _warnedMissingKey = false;
function warnMissingKey() {
  if (!_warnedMissingKey) {
    console.warn('[geminiBot] GEMINI_API_KEY is not set — bot will always use heuristic fallback.');
    _warnedMissingKey = true;
  }
}

// One concurrent call guard per server process (not per room) — free tier is tight
let _callInFlight = false;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BotMoveResult {
  action: 'play' | 'draw';
  newBoard?: TileSet[];
  newRack?: Tile[];
  source: 'gemini' | 'gemini-retry' | 'fallback';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Decide the bot's move. Always returns a valid result; never throws.
 */
export async function geminiBotMove(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
): Promise<BotMoveResult> {
  // No key → heuristic immediately
  if (!API_KEY) {
    warnMissingKey();
    return fallback(rack, board, hasInitialMeld, minInitialMeld, 'fallback');
  }

  // Concurrent call guard — free tier allows ~15 RPM; don't queue, just fall back
  if (_callInFlight) {
    console.log(`[geminiBot] call already in flight, using fallback for ${botName}`);
    return fallback(rack, board, hasInitialMeld, minInitialMeld, 'fallback');
  }

  _callInFlight = true;
  try {
    return await callGemini(rack, board, hasInitialMeld, minInitialMeld, poolCount, botName, false);
  } finally {
    _callInFlight = false;
  }
}

// ─── Core Gemini call ─────────────────────────────────────────────────────────

async function callGemini(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  botName: string,
  isRetry: boolean,
  retryHint?: string,
): Promise<BotMoveResult> {
  const source = isRetry ? 'gemini-retry' : 'gemini';

  // Build candidate list with the heuristic rule engine
  const candidates: CandidateMove[] = findCandidateMoves(rack, board, hasInitialMeld, minInitialMeld);

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    let prompt: string;
    let schema: object;

    if (candidates.length > 0) {
      // ── Candidate-selection mode (preferred) ──────────────────────────────
      prompt = buildCandidatePrompt(rack, board, hasInitialMeld, minInitialMeld, poolCount, candidates as CandidateMove[], retryHint);
      schema = {
        type: 'object',
        properties: {
          chosenIndex: { type: 'integer', description: 'Index of the chosen candidate (0-based)' },
          reasoning:   { type: 'string' },
        },
        required: ['chosenIndex'],
      };
    } else {
      // ── Free-form mode (initial meld or no candidates found) ──────────────
      prompt = buildFreeFormPrompt(rack, board, hasInitialMeld, minInitialMeld, poolCount, retryHint);
      schema = buildFreeFormSchema();
    }

    // Race the API call against a timeout
    const responseText = await Promise.race([
      doApiCall(ai, prompt, schema),
      timeout(TIMEOUT_MS),
    ]);

    // Parse and validate
    const parsed = JSON.parse(responseText);

    if (candidates.length > 0) {
      // Candidate-selection: pick by index
      const idx = typeof parsed.chosenIndex === 'number' ? parsed.chosenIndex : -1;
      if (idx >= 0 && idx < candidates.length) {
        const chosen = candidates[idx];
        console.log(`[geminiBot] ${source} chose candidate #${idx} for ${botName}: action=${chosen.action}`);
        return { ...chosen, source };
      }
      // Bad index → fall back
      console.warn(`[geminiBot] ${source} returned invalid index ${idx} (${candidates.length} candidates), using fallback`);
      return fallback(rack, board, hasInitialMeld, minInitialMeld, 'fallback');
    } else {
      // Free-form: validate the proposed board
      const validationError = validateFreeFormMove(parsed, rack, board, hasInitialMeld, minInitialMeld);
      if (!validationError) {
        const result: BotMoveResult = {
          action: parsed.action,
          source,
        };
        if (parsed.action === 'play') {
          result.newBoard = parsed.board as TileSet[];
          result.newRack  = parsed.tilesFromRack
            ? rack.filter(t => !(parsed.tilesFromRack as string[]).includes(t.id))
            : rack;
        }
        console.log(`[geminiBot] ${source} free-form move accepted for ${botName}: action=${parsed.action}`);
        return result;
      }

      // Validation failed
      if (!isRetry) {
        console.warn(`[geminiBot] gemini free-form move invalid (${validationError}), retrying…`);
        _callInFlight = false; // allow the retry
        _callInFlight = true;
        return callGemini(rack, board, hasInitialMeld, minInitialMeld, poolCount, botName, true, validationError);
      }
      console.warn(`[geminiBot] retry also invalid (${validationError}), using fallback`);
      return fallback(rack, board, hasInitialMeld, minInitialMeld, 'fallback');
    }
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    if (msg === 'TIMEOUT') {
      console.warn(`[geminiBot] API call timed out for ${botName}, using fallback`);
    } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      console.warn(`[geminiBot] rate limited (429) for ${botName}, using fallback`);
    } else {
      console.error(`[geminiBot] API error for ${botName}:`, msg);
    }
    return fallback(rack, board, hasInitialMeld, minInitialMeld, 'fallback');
  }
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function doApiCall(ai: GoogleGenAI, prompt: string, schema: object): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2, // low temperature for consistent structured output
    },
  });
  return response.text ?? '{}';
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), ms)
  );
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildCandidatePrompt(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  candidates: CandidateMove[],
  retryHint?: string,
): string {
  const candidateSummaries = candidates.map((c, i) => {
    if (c.action === 'draw') return `${i}: DRAW a tile from the pool`;
    const tilesPlaced = rack.filter(t => !c.newRack!.find(r => r.id === t.id));
    return `${i}: PLAY — place ${tilesPlaced.length} tile(s): ${tilesPlaced.map(tileStr).join(', ')}`;
  });

  return `You are playing Israeli Rummikub as a smart bot named "${rack.length > 0 ? 'Bot' : 'Bot'}".

GAME STATE:
- Your rack (${rack.length} tiles): ${JSON.stringify(rack.map(compactTile))}
- Board melds (${board.length} sets): ${JSON.stringify(board.map(compactSet))}
- Draw pool: ${poolCount} tiles remaining
- Initial meld done: ${hasInitialMeld} (min points required: ${minInitialMeld})

CANDIDATE MOVES (pre-validated as legal):
${candidateSummaries.join('\n')}

Choose the index of the best move. Prefer moves that place more tiles. If drawing is the only option, choose it.
${retryHint ? `\nPREVIOUS ATTEMPT ERROR: ${retryHint}` : ''}

Respond with JSON only.`;
}

function buildFreeFormPrompt(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  poolCount: number,
  retryHint?: string,
): string {
  return `You are playing Israeli Rummikub. Decide the bot's move.

RULES SUMMARY:
- A GROUP: 3-4 tiles, same number, all different colors.
- A RUN: 3+ tiles, same color, consecutive numbers (1-13). No wrapping.
- Joker (number=0) can substitute any tile in a set.
- Initial meld: first time playing, all new sets must come entirely from your rack and sum to >= ${minInitialMeld} points (face value). You cannot use or rearrange existing board tiles.
- After initial meld: you may rearrange the entire board freely, as long as every set remains valid and no tiles are lost.
- If you cannot play, draw one tile (action="draw").

GAME STATE:
- Your rack (${rack.length} tiles): ${JSON.stringify(rack.map(compactTile))}
- Board melds (${board.length} sets): ${JSON.stringify(board.map(compactSet))}
- Draw pool: ${poolCount} tiles remaining
- Initial meld done: ${hasInitialMeld}

INSTRUCTIONS:
- If playing: return action="play", board=<full new board as array of sets>, tilesFromRack=<array of tile IDs you took from your rack>.
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
      id:     { type: 'string' },
      color:  { type: 'string' },
      number: { type: 'integer' },
      isJoker:{ type: 'boolean' },
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
  parsed: any,
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
): string | null {
  if (parsed.action === 'draw') return null;
  if (parsed.action !== 'play') return 'action must be "play" or "draw"';

  const proposedBoard: TileSet[] = parsed.board;
  if (!Array.isArray(proposedBoard)) return 'board must be an array';

  // Build tile ID inventories
  const originalBoardIds = new Set(board.flatMap(s => s.tiles.map(t => t.id)));
  const rackIds          = new Set(rack.map(t => t.id));
  const allLegalIds      = new Set([...originalBoardIds, ...rackIds]);

  const proposedIds = proposedBoard.flatMap(s => s.tiles.map(t => t.id));

  // No invented tiles
  for (const id of proposedIds) {
    if (!allLegalIds.has(id)) return `tile ${id} does not exist in rack or board`;
  }

  // No lost tiles — all original board tiles must still be present
  for (const id of originalBoardIds) {
    if (!proposedIds.includes(id)) return `original board tile ${id} is missing from proposed board`;
  }

  // At least one rack tile was played
  const playedFromRack = proposedIds.filter(id => rackIds.has(id));
  if (playedFromRack.length === 0) return 'no tiles were played from the rack';

  // Every set is valid
  const boardVal = validateBoard(proposedBoard);
  if (!boardVal.valid) return boardVal.errors[0] ?? 'invalid set on board';

  // Initial meld check
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
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  source: BotMoveResult['source'],
): BotMoveResult {
  const result = botFindMove(rack, board, hasInitialMeld, minInitialMeld);
  return { ...result, source };
}

// ─── Compact serialisers (keep prompts small) ─────────────────────────────────

function tileStr(t: Tile): string {
  return t.isJoker ? 'JOKER' : `${t.number}${t.color[0].toUpperCase()}`;
}

function compactTile(t: Tile) {
  return t.isJoker
    ? { id: t.id, joker: true }
    : { id: t.id, c: t.color[0], n: t.number };
}

function compactSet(s: TileSet) {
  return { id: s.id, t: s.tiles.map(compactTile) };
}
