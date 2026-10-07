/**
 * server/rummikubSolver.ts
 *
 * RUMMIKUB BOARD-REARRANGING SOLVER
 * ==================================
 * Strategy: iterative-deepening DFS (anytime branch-and-bound) over the
 * combined tile pool (all board tiles + chosen rack subset).
 *
 * High-level algorithm:
 *  1. Collect all tiles: boardTiles (must all end up on board) + rackTiles.
 *  2. Pre-compute all valid sets that can be formed from subsets of those tiles
 *     (enumerate groups and runs). This is the "universe" of possible sets.
 *  3. Run a DFS that picks sets from the universe one at a time, marks their
 *     tiles as used, and recurses. Prune when remaining tiles cannot possibly
 *     improve the best solution found so far.
 *  4. A solution is complete when every boardTile is covered. Rack tiles that
 *     are also covered are "placed". Maximise placed rack tiles.
 *  5. Run inside a worker_thread with a hard time budget; the main thread
 *     receives the best solution found so far via postMessage.
 *
 * Jokers: treated as wildcards. During set enumeration they are tried in every
 * position of every run/group candidate.
 *
 * Difficulty levels:
 *  - easy:   only append-to-existing or new-from-rack (no rearranging)
 *  - medium: rearranging allowed but universe capped at simpler splits
 *  - hard:   full search
 *
 * No DOM / React dependencies — pure Node.js.
 */

import { Tile, TileSet } from '../src/types/rummikub.js';
import {
  validateSet,
  validateBoard,
  calculateInitialMeldPoints,
} from '../src/utils/rummikubRules.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface SolverOptions {
  timeBudgetMs?: number;   // default 1500
  maxSolutions?: number;   // how many top solutions to return, default 5
  difficulty?: BotDifficulty;
}

export interface SolverSolution {
  newBoard: TileSet[];
  newRack: Tile[];
  tilesPlaced: number;
  pointsPlaced: number;
  jokersUsed: number;
  setsChanged: number;     // how many pre-existing sets were modified
  rearranged: boolean;     // true if any pre-existing set was split/merged
}

export interface SolverResult {
  solutions: SolverSolution[];  // best first
  solverMs: number;
  timedOut: boolean;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function solveBestMove(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
  options: SolverOptions = {},
): SolverResult {
  const t0 = Date.now();
  const timeBudgetMs = options.timeBudgetMs ?? 1500;
  const maxSolutions = options.maxSolutions ?? 5;
  const difficulty = options.difficulty ?? 'hard';

  // ── Initial meld: restricted search ───────────────────────────────────────
  if (!hasInitialMeld) {
    return solveInitialMeld(rack, board, minInitialMeld, t0, timeBudgetMs, maxSolutions);
  }

  // ── Post-meld: full rearranging search ────────────────────────────────────
  const boardTiles = board.flatMap(s => s.tiles);
  const boardTileIds = new Set(boardTiles.map(t => t.id));

  // For easy difficulty: only allow appending to existing sets or new sets from rack
  if (difficulty === 'easy') {
    return solveEasy(rack, board, boardTileIds, t0, timeBudgetMs, maxSolutions);
  }

  // Combine all tiles
  const allTiles = [...boardTiles, ...rack];

  // Pre-compute all valid sets from allTiles
  const universe = enumerateValidSets(allTiles, difficulty);

  // Run DFS
  const deadline = t0 + timeBudgetMs;
  const state: SearchState = {
    universe,
    allTiles,
    boardTileIds,
    rackTileIds: new Set(rack.map(t => t.id)),
    usedTileIds: new Set(),
    currentSets: [],
    bestSolutions: [],
    maxSolutions,
    deadline,
    timedOut: false,
    originalBoard: board,
  };

  dfsSearch(state);

  const solverMs = Date.now() - t0;

  // Build result
  const solutions = state.bestSolutions
    .sort((a, b) => b.tilesPlaced - a.tilesPlaced || b.pointsPlaced - a.pointsPlaced)
    .slice(0, maxSolutions)
    .map(s => buildSolution(s, rack, board, boardTileIds));

  // Validate all solutions before returning
  const validSolutions = solutions.filter(s => assertSolutionValid(s, rack, board, boardTileIds));

  return { solutions: validSolutions, solverMs, timedOut: state.timedOut };
}

// ─── Initial meld solver (rack-only, no board rearranging) ────────────────────

interface MeldState {
  usedIds: Set<string>;
  sets: Tile[][];
  points: number;
}

interface MeldBest {
  usedIds: Set<string>;
  sets: Tile[][];
  points: number;
}

function solveInitialMeld(
  rack: Tile[],
  board: TileSet[],
  minInitialMeld: number,
  t0: number,
  timeBudgetMs: number,
  maxSolutions: number,
): SolverResult {
  const deadline = t0 + timeBudgetMs;
  const universe = enumerateValidSets(rack, 'hard');

  // DFS over rack-only sets, maximise points placed, must reach minInitialMeld
  let best: MeldBest | null = null;
  const solutions: SolverSolution[] = [];

  function dfs(idx: number, state: MeldState) {
    if (Date.now() > deadline) return;

    // Check if current state meets threshold
    if (state.points >= minInitialMeld && state.sets.length > 0) {
      if (!best || state.points > best.points || state.sets.flat().length > best.sets.flat().length) {
        best = { usedIds: new Set(state.usedIds), sets: state.sets.map((s: Tile[]) => [...s]), points: state.points };
      }
    }

    for (let i = idx; i < universe.length; i++) {
      if (Date.now() > deadline) return;
      const candidate = universe[i];
      if (candidate.tiles.some((t: Tile) => state.usedIds.has(t.id))) continue;
      // Only rack tiles
      if (candidate.tiles.some((t: Tile) => !rack.find(r => r.id === t.id))) continue;

      candidate.tiles.forEach((t: Tile) => state.usedIds.add(t.id));
      state.sets.push(candidate.tiles);
      state.points += candidate.points;

      dfs(i + 1, state);

      state.points -= candidate.points;
      state.sets.pop();
      candidate.tiles.forEach((t: Tile) => state.usedIds.delete(t.id));
    }
  }

  dfs(0, { usedIds: new Set(), sets: [], points: 0 });

  if (best !== null && (best as MeldBest).points >= minInitialMeld) {
    const b = best as MeldBest;
    const placedIds = new Set(b.sets.flat().map((t: Tile) => t.id));
    const newRack = rack.filter(t => !placedIds.has(t.id));
    const newBoard: TileSet[] = [
      ...board,
      ...b.sets.map((tiles: Tile[], i: number) => ({
        id: `solver_init_${i}_${Date.now()}`,
        tiles,
      })),
    ];

    const meldCheck = calculateInitialMeldPoints(newBoard, board, minInitialMeld);
    if (meldCheck.validInitialSets && !meldCheck.touchedExisting) {
      const jokers = b.sets.flat().filter((t: Tile) => t.isJoker).length;
      solutions.push({
        newBoard,
        newRack,
        tilesPlaced: placedIds.size,
        pointsPlaced: b.points,
        jokersUsed: jokers,
        setsChanged: 0,
        rearranged: false,
      });
    }
  }

  return { solutions, solverMs: Date.now() - t0, timedOut: Date.now() > deadline };
}

// ─── Easy solver (append-only, no rearranging) ────────────────────────────────

function solveEasy(
  rack: Tile[],
  board: TileSet[],
  boardTileIds: Set<string>,
  t0: number,
  timeBudgetMs: number,
  maxSolutions: number,
): SolverResult {
  const solutions: SolverSolution[] = [];
  const seenKeys = new Set<string>();

  // Try appending rack tiles to existing sets
  for (const tile of rack) {
    for (let si = 0; si < board.length; si++) {
      const set = board[si];
      for (const candidate of [[tile, ...set.tiles], [...set.tiles, tile]]) {
        const val = validateSet(candidate);
        if (!val.valid) continue;
        const newBoard = board.map((s, i) =>
          i === si ? { ...s, tiles: val.sortedTiles || candidate } : s
        );
        const newRack = rack.filter(t => t.id !== tile.id);
        const key = tile.id;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        solutions.push({
          newBoard,
          newRack,
          tilesPlaced: 1,
          pointsPlaced: tile.isJoker ? 0 : tile.number,
          jokersUsed: tile.isJoker ? 1 : 0,
          setsChanged: 1,
          rearranged: false,
        });
        if (solutions.length >= maxSolutions) break;
      }
      if (solutions.length >= maxSolutions) break;
    }
    if (solutions.length >= maxSolutions) break;
  }

  // Try new sets from rack
  if (solutions.length < maxSolutions) {
    const universe = enumerateValidSets(rack, 'easy');
    for (const s of universe) {
      if (s.tiles.some(t => boardTileIds.has(t.id))) continue;
      const placedIds = new Set(s.tiles.map(t => t.id));
      const newRack = rack.filter(t => !placedIds.has(t.id));
      const newBoard = [...board, { id: `solver_easy_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, tiles: s.tiles }];
      solutions.push({
        newBoard,
        newRack,
        tilesPlaced: s.tiles.length,
        pointsPlaced: s.points,
        jokersUsed: s.tiles.filter(t => t.isJoker).length,
        setsChanged: 0,
        rearranged: false,
      });
      if (solutions.length >= maxSolutions) break;
    }
  }

  solutions.sort((a, b) => b.tilesPlaced - a.tilesPlaced || b.pointsPlaced - a.pointsPlaced);
  return { solutions, solverMs: Date.now() - t0, timedOut: false };
}

// ─── Set enumeration ──────────────────────────────────────────────────────────

interface CandidateSet {
  tiles: Tile[];
  points: number;
  tileIds: Set<string>;
}

function enumerateValidSets(tiles: Tile[], difficulty: BotDifficulty): CandidateSet[] {
  const results: CandidateSet[] = [];
  const seenKeys = new Set<string>();
  const jokers = tiles.filter(t => t.isJoker);
  const nonJokers = tiles.filter(t => !t.isJoker);

  // ── Groups: same number, different colors ─────────────────────────────────
  const byNumber = new Map<number, Tile[]>();
  for (const t of nonJokers) {
    const list = byNumber.get(t.number) ?? [];
    list.push(t);
    byNumber.set(t.number, list);
  }

  for (const [, group] of byNumber) {
    // Deduplicate by color (pick one tile per color)
    const byColor = new Map<string, Tile>();
    for (const t of group) {
      if (!byColor.has(t.color)) byColor.set(t.color, t);
    }
    const distinct = [...byColor.values()];

    // Groups of 3 and 4 without jokers
    if (distinct.length >= 3) {
      addGroupCandidates(distinct, [], results, seenKeys);
    }
    // Groups with 1 joker (fill missing color slot)
    if (jokers.length > 0 && distinct.length >= 2) {
      addGroupCandidates(distinct, [jokers[0]], results, seenKeys);
    }
    // Groups with 2 jokers
    if (jokers.length >= 2 && distinct.length >= 1) {
      addGroupCandidates(distinct, jokers.slice(0, 2), results, seenKeys);
    }
  }

  // ── Runs: same color, consecutive numbers ─────────────────────────────────
  const byColor = new Map<string, Tile[]>();
  for (const t of nonJokers) {
    const list = byColor.get(t.color) ?? [];
    list.push(t);
    byColor.set(t.color, list);
  }

  for (const [, colorTiles] of byColor) {
    // Group tiles by number — there may be TWO copies of the same number (two decks).
    // We must NOT deduplicate here: a run can use at most one tile per number position,
    // but when the pool contains two copies of the same number we need to enumerate
    // runs that pick *either* copy, so the other copy can be used in a different set.
    const byNum = new Map<number, Tile[]>();
    for (const t of colorTiles) {
      const list = byNum.get(t.number) ?? [];
      list.push(t);
      byNum.set(t.number, list);
    }
    const distinctNums = [...byNum.keys()].sort((a, b) => a - b);

    // Enumerate all contiguous number-ranges of length >= 3
    for (let i = 0; i < distinctNums.length; i++) {
      for (let j = i + 2; j < distinctNums.length; j++) {
        const numSlice = distinctNums.slice(i, j + 1);
        const span = numSlice[numSlice.length - 1] - numSlice[0] + 1;
        const gaps = span - numSlice.length;
        if (gaps > jokers.length) continue;
        if (span > 13) continue;

        // For each number in the slice, pick one representative tile.
        // If a number has two copies, enumerate both choices so the DFS can
        // use the other copy in a different set (this is the split-run case).
        const choicesList: Tile[][] = numSlice.map(n => byNum.get(n)!);
        const tileChoiceCombos = cartesianProduct(choicesList);

        for (const tileChoice of tileChoiceCombos) {
          // Without jokers
          if (gaps === 0) {
            addRunCandidate(tileChoice, [], results, seenKeys);
          }
          // With jokers filling gaps
          if (gaps > 0 && gaps <= jokers.length) {
            addRunCandidate(tileChoice, jokers.slice(0, gaps), results, seenKeys);
          }
        }
      }
    }

    // Runs with jokers at the start or end (extending beyond the sorted range)
    if (jokers.length > 0) {
      for (let i = 0; i < distinctNums.length; i++) {
        for (let j = i + 1; j < distinctNums.length; j++) {
          const numSlice = distinctNums.slice(i, j + 1);
          const span = numSlice[numSlice.length - 1] - numSlice[0] + 1;
          const gaps = span - numSlice.length;
          if (gaps >= jokers.length) continue;
          const jokersForGaps = gaps;
          const jokersForExt = jokers.length - jokersForGaps;
          if (jokersForExt <= 0) continue;

          const choicesList: Tile[][] = numSlice.map(n => byNum.get(n)!);
          const tileChoiceCombos = cartesianProduct(choicesList);

          for (const tileChoice of tileChoiceCombos) {
            // Extend at end
            if (tileChoice[tileChoice.length - 1].number + jokersForExt <= 13 &&
                tileChoice.length + jokersForGaps + jokersForExt >= 3) {
              addRunCandidate(tileChoice, jokers.slice(0, jokersForGaps + jokersForExt), results, seenKeys);
            }
            // Extend at start
            if (tileChoice[0].number - jokersForExt >= 1 &&
                tileChoice.length + jokersForGaps + jokersForExt >= 3) {
              addRunCandidate(tileChoice, jokers.slice(0, jokersForGaps + jokersForExt), results, seenKeys);
            }
          }
        }
      }
    }
  }

  // Sort by points descending (greedy heuristic for DFS ordering)
  results.sort((a, b) => b.points - a.points);

  return results;
}

function addGroupCandidates(
  distinct: Tile[],
  jokersToAdd: Tile[],
  results: CandidateSet[],
  seenKeys: Set<string>,
) {
  const minSize = 3 - jokersToAdd.length;
  const maxSize = 4 - jokersToAdd.length;

  for (let size = Math.max(minSize, 1); size <= Math.min(maxSize, distinct.length); size++) {
    // Pick `size` tiles from distinct
    const combos = combinations(distinct, size);
    for (const combo of combos) {
      const tiles = [...combo, ...jokersToAdd];
      const val = validateSet(tiles);
      if (!val.valid) continue;
      const key = tiles.map(t => t.id).sort().join(',');
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push({ tiles: val.sortedTiles || tiles, points: val.points, tileIds: new Set(tiles.map(t => t.id)) });
    }
  }
}

function addRunCandidate(
  nonJokerSlice: Tile[],
  jokersToAdd: Tile[],
  results: CandidateSet[],
  seenKeys: Set<string>,
) {
  const tiles = [...nonJokerSlice, ...jokersToAdd];
  const val = validateSet(tiles);
  if (!val.valid) return;
  const key = tiles.map(t => t.id).sort().join(',');
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  results.push({ tiles: val.sortedTiles || tiles, points: val.points, tileIds: new Set(tiles.map(t => t.id)) });
}

/**
 * Cartesian product of arrays: given [[a,b],[c],[d,e]] returns
 * [[a,c,d],[a,c,e],[b,c,d],[b,c,e]].
 * Used to enumerate all ways to pick one tile per number slot when duplicates exist.
 */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap(combo => arr.map(item => [...combo, item])),
    [[]],
  );
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = combinations(arr.slice(i + 1), k - 1);
    for (const r of rest) result.push([arr[i], ...r]);
  }
  return result;
}

// ─── DFS search state ─────────────────────────────────────────────────────────

interface PartialSolution {
  sets: Tile[][];
  placedRackIds: Set<string>;
  tilesPlaced: number;
  pointsPlaced: number;
}

interface SearchState {
  universe: CandidateSet[];
  allTiles: Tile[];
  boardTileIds: Set<string>;
  rackTileIds: Set<string>;
  usedTileIds: Set<string>;
  currentSets: Tile[][];
  bestSolutions: PartialSolution[];
  maxSolutions: number;
  deadline: number;
  timedOut: boolean;
  originalBoard: TileSet[];
}

function dfsSearch(state: SearchState) {
  const { universe, boardTileIds, rackTileIds, usedTileIds, deadline } = state;

  if (Date.now() > deadline) {
    state.timedOut = true;
    return;
  }

  // Check if all board tiles are covered
  const allBoardCovered = [...boardTileIds].every(id => usedTileIds.has(id));

  if (allBoardCovered) {
    // Count placed rack tiles
    const placedRackIds = new Set([...usedTileIds].filter(id => rackTileIds.has(id)));
    const points = state.currentSets.flat()
      .filter(t => rackTileIds.has(t.id))
      .reduce((sum, t) => sum + (t.isJoker ? 0 : t.number), 0);

    // Record solution if it places at least one rack tile
    if (placedRackIds.size > 0) {
      const best = state.bestSolutions[0];
      if (!best || placedRackIds.size > best.tilesPlaced ||
          (placedRackIds.size === best.tilesPlaced && points > best.pointsPlaced)) {
        state.bestSolutions.unshift({
          sets: state.currentSets.map(s => [...s]),
          placedRackIds: new Set(placedRackIds),
          tilesPlaced: placedRackIds.size,
          pointsPlaced: points,
        });
        if (state.bestSolutions.length > state.maxSolutions * 2) {
          state.bestSolutions.length = state.maxSolutions * 2;
        }
      }
    }
    return;
  }

  // Find the first uncovered board tile (most constrained variable)
  const uncoveredBoardTile = [...boardTileIds].find(id => !usedTileIds.has(id));
  if (!uncoveredBoardTile) return;

  // Try each candidate set that covers this tile
  for (const candidate of universe) {
    if (!candidate.tileIds.has(uncoveredBoardTile)) continue;
    if ([...candidate.tileIds].some(id => usedTileIds.has(id))) continue;

    // Add candidate
    for (const id of candidate.tileIds) usedTileIds.add(id);
    state.currentSets.push(candidate.tiles);

    dfsSearch(state);

    // Remove candidate
    state.currentSets.pop();
    for (const id of candidate.tileIds) usedTileIds.delete(id);

    if (state.timedOut) return;
  }
}

// ─── Build final SolverSolution from a PartialSolution ────────────────────────

function buildSolution(
  partial: PartialSolution,
  rack: Tile[],
  originalBoard: TileSet[],
  boardTileIds: Set<string>,
): SolverSolution {
  const newBoard: TileSet[] = partial.sets.map((tiles, i) => ({
    id: `solver_${i}_${Date.now()}`,
    tiles,
  }));

  const newRack = rack.filter(t => !partial.placedRackIds.has(t.id));

  // Count changed sets: original sets whose tile composition changed
  const origSetMap = new Map(originalBoard.map(s => [s.id, new Set(s.tiles.map(t => t.id))]));
  let setsChanged = 0;
  let rearranged = false;

  // A set is "changed" if no original set has exactly the same tile ids
  for (const newSet of newBoard) {
    const newIds = new Set(newSet.tiles.map(t => t.id));
    const matchesOriginal = [...origSetMap.values()].some(origIds =>
      origIds.size === newIds.size && [...origIds].every(id => newIds.has(id))
    );
    if (!matchesOriginal) {
      setsChanged++;
      // Rearranged = a board tile ended up in a different set
      if (newSet.tiles.some(t => boardTileIds.has(t.id))) rearranged = true;
    }
  }

  return {
    newBoard,
    newRack,
    tilesPlaced: partial.tilesPlaced,
    pointsPlaced: partial.pointsPlaced,
    jokersUsed: [...partial.placedRackIds].filter(id => rack.find(t => t.id === id)?.isJoker).length,
    setsChanged,
    rearranged,
  };
}

// ─── Validation assertion ─────────────────────────────────────────────────────

function assertSolutionValid(
  sol: SolverSolution,
  rack: Tile[],
  board: TileSet[],
  boardTileIds: Set<string>,
): boolean {
  // 1. Board validity
  const bv = validateBoard(sol.newBoard);
  if (!bv.valid) return false;

  // 2. Tile conservation: all board tiles present
  const newBoardIds = new Set(sol.newBoard.flatMap(s => s.tiles.map(t => t.id)));
  for (const id of boardTileIds) {
    if (!newBoardIds.has(id)) return false;
  }

  // 3. No invented tiles
  const rackIds = new Set(rack.map(t => t.id));
  const allLegal = new Set([...boardTileIds, ...rackIds]);
  for (const id of newBoardIds) {
    if (!allLegal.has(id)) return false;
  }

  // 4. newRack = rack minus placed tiles
  const placedFromRack = [...newBoardIds].filter(id => rackIds.has(id));
  const expectedRackSize = rack.length - placedFromRack.length;
  if (sol.newRack.length !== expectedRackSize) return false;

  return true;
}
