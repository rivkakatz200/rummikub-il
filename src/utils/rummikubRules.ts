import { Tile, TileColor, TileSet } from '../types/rummikub';

export const COLORS: TileColor[] = ['black', 'blue', 'red', 'yellow'];

/**
 * Creates standard 106 Rummikub tiles
 * 4 colors x 13 numbers x 2 sets = 104 tiles
 * + 2 Jokers (1 black, 1 red)
 */
export function createFullDeck(): Tile[] {
  const deck: Tile[] = [];
  let counter = 1;

  for (let copy = 1; copy <= 2; copy++) {
    for (const color of COLORS) {
      for (let num = 1; num <= 13; num++) {
        deck.push({
          id: `t_${color}_${num}_${copy}_${counter++}`,
          color,
          number: num,
          isJoker: false,
        });
      }
    }
  }

  // 2 Jokers
  deck.push({
    id: `t_joker_1_${counter++}`,
    color: 'red',
    number: 0,
    isJoker: true,
  });
  deck.push({
    id: `t_joker_2_${counter++}`,
    color: 'black',
    number: 0,
    isJoker: true,
  });

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Tile[]): Tile[] {
  const array = [...deck];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export interface SetValidationResult {
  valid: boolean;
  type?: 'group' | 'run';
  error?: string;
  points: number;
  sortedTiles?: Tile[];
}

/**
 * Checks if a set of tiles forms a valid group (קבוצה):
 * - 3 or 4 tiles
 * - Same number across all non-jokers
 * - All different colors (no duplicate colors)
 */
export function checkGroup(tiles: Tile[]): { valid: boolean; points: number; error?: string; sortedTiles?: Tile[] } {
  if (tiles.length < 3 || tiles.length > 4) {
    return { valid: false, points: 0, error: 'קבוצה חייבת להכיל 3 או 4 אריחים' };
  }

  const nonJokers = tiles.filter((t) => !t.isJoker);
  if (nonJokers.length === 0) {
    return { valid: false, points: 0, error: 'לא ניתן ליצור קבוצה מג׳וקרים בלבד' };
  }

  const expectedNumber = nonJokers[0].number;
  // All non-jokers must share the exact same number
  for (const t of nonJokers) {
    if (t.number !== expectedNumber) {
      return { valid: false, points: 0, error: 'המספרים בקבוצה חייבים להיות זהים' };
    }
  }

  // All non-jokers must have unique colors
  const colorSet = new Set<TileColor>();
  for (const t of nonJokers) {
    if (colorSet.has(t.color)) {
      return { valid: false, points: 0, error: 'אסור שיהיו שני צבעים זהים בקבוצה' };
    }
    colorSet.add(t.color);
  }

  const totalPoints = tiles.length * expectedNumber;
  return { valid: true, points: totalPoints, sortedTiles: tiles };
}

/**
 * Checks if a set of tiles forms a valid run (רצף):
 * - 3 or more tiles, max 13 tiles
 * - All non-jokers share the exact same color
 * - Tiles can be arranged into consecutive ascending numbers (with Jokers filling gaps)
 * - Numbers stay in 1..13 range (1 is low, cannot follow 13)
 */
export function checkRun(tiles: Tile[]): { valid: boolean; points: number; error?: string; sortedTiles?: Tile[] } {
  if (tiles.length < 3) {
    return { valid: false, points: 0, error: 'רצף חייב להכיל לפחות 3 אריחים' };
  }
  if (tiles.length > 13) {
    return { valid: false, points: 0, error: 'רצף לא יכול להכיל יותר מ-13 אריחים' };
  }

  const nonJokers = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);

  if (nonJokers.length === 0) {
    return { valid: false, points: 0, error: 'לא ניתן ליצור רצף מג׳וקרים בלבד' };
  }

  const runColor = nonJokers[0].color;
  for (const t of nonJokers) {
    if (t.color !== runColor) {
      return { valid: false, points: 0, error: 'כל האריחים ברצף חייבים להיות מאותו הצבע' };
    }
  }

  // Check for duplicate numbers among non-jokers
  const numSet = new Set<number>();
  for (const t of nonJokers) {
    if (numSet.has(t.number)) {
      return { valid: false, points: 0, error: 'ברצף לא יכולים להופיע מספרים כפולים' };
    }
    numSet.add(t.number);
  }

  // Sort non-jokers by number
  const sortedNonJokers = [...nonJokers].sort((a, b) => a.number - b.number);
  const minNum = sortedNonJokers[0].number;
  const maxNum = sortedNonJokers[sortedNonJokers.length - 1].number;

  // The span of numbers between min and max
  const span = maxNum - minNum + 1;
  const missingInSpan = span - sortedNonJokers.length;

  if (missingInSpan > jokers.length) {
    return { valid: false, points: 0, error: 'המספרים אינם עוקבים ואין מספיק ג׳וקרים להשלים את הרצף' };
  }

  // The total length of the run is tiles.length.
  // Find all valid start numbers `s` such that all sortedNonJokers fit into [s, s + tiles.length - 1]
  // and 1 <= s and s + tiles.length - 1 <= 13.
  const N = tiles.length;
  const validStarts: number[] = [];

  for (let s = 1; s <= 14 - N; s++) {
    const end = s + N - 1;
    if (minNum >= s && maxNum <= end) {
      validStarts.push(s);
    }
  }

  if (validStarts.length === 0) {
    return { valid: false, points: 0, error: 'הרצף חורג מטווח המספרים המותר (1 עד 13)' };
  }

  // To choose bestStart:
  // In Rummikub, players can place a Joker at the higher end of a run to maximize points
  // (e.g., [9, 10, Joker] as 9, 10, 11 = 30 points instead of 8, 9, 10 = 27 points).
  // If the user placed the Joker at the start, e.g. [Joker, 10, 11], and start minNum - 1 is valid, respect that.
  // Otherwise, default to the highest valid start to maximize the player's initial meld points!
  let bestStart = validStarts[validStarts.length - 1];
  const firstTile = tiles[0];
  const lastTile = tiles[tiles.length - 1];

  if (firstTile.isJoker && !lastTile.isJoker && validStarts.includes(minNum - 1)) {
    bestStart = minNum - 1;
  }

  // Build sorted sequence
  const resultSortedTiles: Tile[] = [];
  const nonJokerMap = new Map<number, Tile>();
  for (const t of sortedNonJokers) {
    nonJokerMap.set(t.number, t);
  }

  let jokerIdx = 0;
  let totalPoints = 0;

  for (let val = bestStart; val < bestStart + N; val++) {
    totalPoints += val;
    if (nonJokerMap.has(val)) {
      resultSortedTiles.push(nonJokerMap.get(val)!);
    } else if (jokerIdx < jokers.length) {
      resultSortedTiles.push(jokers[jokerIdx++]);
    }
  }

  return { valid: true, points: totalPoints, sortedTiles: resultSortedTiles };
}

/**
 * Validates a single meld/set
 */
export function validateSet(tiles: Tile[]): SetValidationResult {
  if (!tiles || tiles.length === 0) {
    return { valid: false, points: 0, error: 'סדרה ריקה' };
  }

  if (tiles.length < 3) {
    return { valid: false, points: 0, error: 'סדרה חייבת להכיל לפחות 3 אריחים' };
  }

  // Check group
  const groupRes = checkGroup(tiles);
  if (groupRes.valid) {
    return { valid: true, type: 'group', points: groupRes.points, sortedTiles: groupRes.sortedTiles };
  }

  // Check run
  const runRes = checkRun(tiles);
  if (runRes.valid) {
    return { valid: true, type: 'run', points: runRes.points, sortedTiles: runRes.sortedTiles };
  }

  return {
    valid: false,
    points: 0,
    error: groupRes.error || runRes.error || 'סדרה אינה חוקית (לא קבוצה ולא רצף)',
  };
}

/**
 * Validates the entire board.
 * Returns valid true only if all sets on the board are valid and have >= 3 tiles.
 */
export function validateBoard(board: TileSet[]): {
  valid: boolean;
  invalidSetIds: string[];
  totalPoints: number;
  errors: string[];
} {
  const invalidSetIds: string[] = [];
  const errors: string[] = [];
  let totalPoints = 0;

  for (const set of board) {
    if (!set.tiles || set.tiles.length === 0) continue;

    const res = validateSet(set.tiles);
    if (!res.valid) {
      invalidSetIds.push(set.id);
      errors.push(res.error || `סדרה לא חוקית`);
    } else {
      totalPoints += res.points;
    }
  }

  return {
    valid: invalidSetIds.length === 0,
    invalidSetIds,
    totalPoints,
    errors,
  };
}

/**
 * Helper to compute initial meld points:
 * Sums points of all sets on the board that consist ENTIRELY of tiles played from the hand
 * (contain none of the tiles that were previously on the table).
 */
export function calculateInitialMeldPoints(
  currentBoard: TileSet[],
  initialBoardSnapshot: TileSet[] = [],
  minInitialMeld = 30
): {
  validInitialSets: boolean;
  touchedExisting: boolean;
  points: number;
  qualifyingSetsCount: number;
} {
  const initialTableTileIds = new Set(
    (initialBoardSnapshot || []).flatMap((s) => s.tiles.map((t) => t.id))
  );

  let points = 0;
  let touchedExisting = false;
  let qualifyingSetsCount = 0;

  for (const set of currentBoard) {
    if (!set.tiles || set.tiles.length === 0) continue;

    // Check if set contains any tiles that existed on the table prior to this turn
    const hasOldTableTiles = initialTableTileIds.size > 0 && set.tiles.some((t) => initialTableTileIds.has(t.id));

    if (hasOldTableTiles) {
      const allOldTiles = set.tiles.every((t) => initialTableTileIds.has(t.id));
      if (!allOldTiles) {
        // Player mixed tiles from their hand with tiles already on the table during initial meld
        touchedExisting = true;
      }
      // Pre-existing table tiles do not count toward the player's new initial meld
      continue;
    }

    // Set is entirely new from hand
    const val = validateSet(set.tiles);
    if (val.valid) {
      points += val.points;
      qualifyingSetsCount++;
    }
  }

  // Fallback: If table was empty before this turn or snapshot was empty, sum all valid sets
  if (points === 0 && initialTableTileIds.size === 0 && currentBoard.length > 0) {
    for (const set of currentBoard) {
      if (!set.tiles || set.tiles.length === 0) continue;
      const val = validateSet(set.tiles);
      if (val.valid) {
        points += val.points;
        qualifyingSetsCount++;
      }
    }
  }

  const qualifies =
    minInitialMeld === 0
      ? qualifyingSetsCount > 0 && !touchedExisting
      : qualifyingSetsCount > 0 && points >= minInitialMeld && !touchedExisting;

  return {
    validInitialSets: qualifies,
    touchedExisting,
    points,
    qualifyingSetsCount,
  };
}

/**
 * Intelligent helper to auto-merge incomplete or split sets on the board into valid sets.
 * E.g., if a player dropped [10], [10], [10] as 3 separate sets, this combines them into one valid group!
 */
export function autoMergeBoardSets(board: TileSet[]): TileSet[] {
  // Separate already valid sets from incomplete/invalid sets
  const validSets: TileSet[] = [];
  const looseTiles: Tile[] = [];

  for (const set of board) {
    if (!set.tiles || set.tiles.length === 0) continue;
    const val = validateSet(set.tiles);
    if (val.valid) {
      validSets.push(set);
    } else {
      looseTiles.push(...set.tiles);
    }
  }

  if (looseTiles.length === 0) {
    return board;
  }

  const newSets: TileSet[] = [...validSets];
  const usedTileIds = new Set<string>();

  // 1. Try to form groups (same number, different colors) from loose tiles
  const byNumber = new Map<number, Tile[]>();
  for (const t of looseTiles) {
    if (!t.isJoker) {
      const list = byNumber.get(t.number) || [];
      list.push(t);
      byNumber.set(t.number, list);
    }
  }

  for (const [, tiles] of byNumber.entries()) {
    const uniqueColors = new Map<TileColor, Tile>();
    for (const t of tiles) {
      if (!uniqueColors.has(t.color)) {
        uniqueColors.set(t.color, t);
      }
    }
    const distinct = Array.from(uniqueColors.values());
    if (distinct.length >= 3) {
      const setToForm = distinct.slice(0, 4);
      setToForm.forEach((t) => usedTileIds.add(t.id));
      newSets.push({
        id: `set_merged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tiles: setToForm,
      });
    }
  }

  // 2. Try to form runs (consecutive numbers, same color) from remaining loose tiles
  const remainingLoose = looseTiles.filter((t) => !usedTileIds.has(t.id));
  const byColor = new Map<TileColor, Tile[]>();
  for (const t of remainingLoose) {
    if (!t.isJoker) {
      const list = byColor.get(t.color) || [];
      list.push(t);
      byColor.set(t.color, list);
    }
  }

  for (const [, colorTiles] of byColor.entries()) {
    const uniqueNums = new Map<number, Tile>();
    for (const t of colorTiles) {
      if (!uniqueNums.has(t.number)) {
        uniqueNums.set(t.number, t);
      }
    }
    const sorted = Array.from(uniqueNums.values()).sort((a, b) => a.number - b.number);
    let currentRun: Tile[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (currentRun.length === 0) {
        currentRun.push(sorted[i]);
      } else {
        const last = currentRun[currentRun.length - 1];
        if (sorted[i].number === last.number + 1) {
          currentRun.push(sorted[i]);
        } else {
          if (currentRun.length >= 3) {
            currentRun.forEach((t) => usedTileIds.add(t.id));
            newSets.push({
              id: `set_merged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tiles: [...currentRun],
            });
          }
          currentRun = [sorted[i]];
        }
      }
    }

    if (currentRun.length >= 3) {
      currentRun.forEach((t) => usedTileIds.add(t.id));
      newSets.push({
        id: `set_merged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tiles: [...currentRun],
      });
    }
  }

  // 3. Keep any still leftover loose tiles in their individual sets so player can manipulate them
  const leftover = looseTiles.filter((t) => !usedTileIds.has(t.id));
  if (leftover.length > 0) {
    // If all leftover tiles happen to be 3+ and valid together, group them
    const testVal = validateSet(leftover);
    if (testVal.valid) {
      newSets.push({
        id: `set_merged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tiles: leftover,
      });
    } else {
      leftover.forEach((t) => {
        newSets.push({
          id: `set_single_${t.id}`,
          tiles: [t],
        });
      });
    }
  }

  return newSets;
}

/**
 * Sorts rack by Numbers (777 group style)
 */
export function sortRackByNumbers(rack: Tile[]): Tile[] {
  return [...rack].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return 0;
    if (a.number !== b.number) return a.number - b.number;
    return a.color.localeCompare(b.color);
  });
}

/**
 * Sorts rack by Runs (789 run style)
 */
export function sortRackByRuns(rack: Tile[]): Tile[] {
  const colorOrder: Record<TileColor, number> = {
    blue: 0,
    red: 1,
    yellow: 2,
    black: 3,
  };

  return [...rack].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return 0;
    if (colorOrder[a.color] !== colorOrder[b.color]) {
      return colorOrder[a.color] - colorOrder[b.color];
    }
    return a.number - b.number;
  });
}

/**
 * Calculates sum of tile points in player hand at round end
 */
export function calculateHandPenaltyPoints(rack: Tile[]): number {
  return rack.reduce((sum, tile) => sum + (tile.isJoker ? 30 : tile.number), 0);
}

/**
 * Enumerate all distinct legal moves for the bot (used by Gemini candidate-list mode).
 * Returns up to ~10 candidates: all single-tile-to-existing-set plays, all new sets
 * from rack, and a draw option. Each candidate is already validated.
 */
export function findCandidateMoves(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld: number,
): Array<{ action: 'play' | 'draw'; newBoard?: TileSet[]; newRack?: Tile[] }> {
  const candidates: Array<{ action: 'play' | 'draw'; newBoard?: TileSet[]; newRack?: Tile[] }> = [];
  const seenKeys = new Set<string>();

  function addPlay(newBoard: TileSet[], newRack: Tile[]) {
    // Deduplicate by the set of played tile IDs
    const key = rack.filter(t => !newRack.find(r => r.id === t.id)).map(t => t.id).sort().join(',');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    candidates.push({ action: 'play', newBoard, newRack });
  }

  if (hasInitialMeld) {
    // 1. Add single tile to an existing board set
    for (const handTile of rack) {
      for (let si = 0; si < board.length; si++) {
        const set = board[si];
        for (const candidate of [[handTile, ...set.tiles], [...set.tiles, handTile]]) {
          const val = validateSet(candidate);
          if (val.valid) {
            const newBoard = board.map((s, i) =>
              i === si ? { ...s, tiles: val.sortedTiles || candidate } : s
            );
            addPlay(newBoard, rack.filter(t => t.id !== handTile.id));
            break;
          }
        }
      }
    }

    // 2. New sets from rack
    const newSets = findIndependentSetsFromRack(rack);
    for (const s of newSets) {
      const playIds = new Set(s.tiles.map(t => t.id));
      const newRack = rack.filter(t => !playIds.has(t.id));
      const newBoard = [...board, { id: `cand_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, tiles: s.tiles }];
      addPlay(newBoard, newRack);
      if (candidates.length >= 10) break;
    }
  } else {
    // Initial meld: only new sets from rack that meet the point threshold
    const newSets = findIndependentSetsFromRack(rack);
    if (newSets.length > 0) {
      let sum = 0;
      const setsToPlay: Tile[][] = [];
      const usedIds = new Set<string>();
      for (const s of newSets) {
        if (s.tiles.some(t => usedIds.has(t.id))) continue;
        setsToPlay.push(s.tiles);
        sum += s.points;
        s.tiles.forEach(t => usedIds.add(t.id));
        if (sum >= minInitialMeld) break;
      }
      if (sum >= minInitialMeld) {
        const newRack = rack.filter(t => !usedIds.has(t.id));
        const newBoard = [
          ...board,
          ...setsToPlay.map((tiles, i) => ({ id: `cand_init_${i}`, tiles })),
        ];
        addPlay(newBoard, newRack);
      }
    }
  }

  // Always include draw as last option
  candidates.push({ action: 'draw' });
  return candidates;
}

/**
 * Basic AI Bot Turn solver
 */
export function botFindMove(
  rack: Tile[],
  board: TileSet[],
  hasInitialMeld: boolean,
  minInitialMeld = 30
): {
  action: 'play' | 'draw';
  newBoard?: TileSet[];
  newRack?: Tile[];
} {
  // If bot needs initial meld: find sets from rack that sum >= minInitialMeld
  if (!hasInitialMeld) {
    const candidateSets = findIndependentSetsFromRack(rack);
    if (candidateSets.length > 0) {
      let sum = 0;
      const setsToPlay: Tile[][] = [];
      const usedIds = new Set<string>();

      for (const set of candidateSets) {
        const overlaps = set.tiles.some((t) => usedIds.has(t.id));
        if (!overlaps) {
          setsToPlay.push(set.tiles);
          sum += set.points;
          set.tiles.forEach((t) => usedIds.add(t.id));
          if (sum >= minInitialMeld) {
            break;
          }
        }
      }

      if (sum >= minInitialMeld) {
        const remainingRack = rack.filter((t) => !usedIds.has(t.id));
        const newBoard: TileSet[] = [
          ...board,
          ...setsToPlay.map((tiles, idx) => ({
            id: `board_bot_${Date.now()}_${idx}`,
            tiles,
          })),
        ];
        return {
          action: 'play',
          newBoard,
          newRack: remainingRack,
        };
      }
    }
    return { action: 'draw' };
  }

  // Bot already made initial meld:
  // 1. Try adding any tile from hand to an existing set
  for (const handTile of rack) {
    for (let setIdx = 0; setIdx < board.length; setIdx++) {
      const set = board[setIdx];
      const tryPlacements = [
        [handTile, ...set.tiles],
        [...set.tiles, handTile],
      ];

      for (const candidate of tryPlacements) {
        const val = validateSet(candidate);
        if (val.valid) {
          const newBoard = board.map((s, idx) =>
            idx === setIdx ? { ...s, tiles: val.sortedTiles || candidate } : s
          );
          const newRack = rack.filter((t) => t.id !== handTile.id);
          return {
            action: 'play',
            newBoard,
            newRack,
          };
        }
      }
    }
  }

  // 2. Try forming a brand new set from hand
  const newSets = findIndependentSetsFromRack(rack);
  if (newSets.length > 0) {
    const setToPlay = newSets[0].tiles;
    const playIds = new Set(setToPlay.map((t) => t.id));
    const newRack = rack.filter((t) => !playIds.has(t.id));
    const newBoard = [
      ...board,
      { id: `board_bot_${Date.now()}`, tiles: setToPlay },
    ];
    return {
      action: 'play',
      newBoard,
      newRack,
    };
  }

  return { action: 'draw' };
}

function findIndependentSetsFromRack(rack: Tile[]): { tiles: Tile[]; points: number }[] {
  const results: { tiles: Tile[]; points: number }[] = [];

  // Group by numbers
  const byNumber = new Map<number, Tile[]>();
  for (const t of rack) {
    if (!t.isJoker) {
      const list = byNumber.get(t.number) || [];
      list.push(t);
      byNumber.set(t.number, list);
    }
  }

  for (const [, tiles] of byNumber.entries()) {
    const uniqueByColor = new Map<TileColor, Tile>();
    for (const t of tiles) {
      if (!uniqueByColor.has(t.color)) {
        uniqueByColor.set(t.color, t);
      }
    }
    const distinct = Array.from(uniqueByColor.values());
    if (distinct.length >= 3) {
      const group3 = distinct.slice(0, 3);
      results.push({ tiles: group3, points: group3.length * group3[0].number });
      if (distinct.length === 4) {
        results.push({ tiles: distinct, points: distinct.length * distinct[0].number });
      }
    }
  }

  // Group by color for runs
  const byColor = new Map<TileColor, Tile[]>();
  for (const t of rack) {
    if (!t.isJoker) {
      const list = byColor.get(t.color) || [];
      list.push(t);
      byColor.set(t.color, list);
    }
  }

  for (const [, colorTiles] of byColor.entries()) {
    const uniqueNums = new Map<number, Tile>();
    for (const t of colorTiles) {
      if (!uniqueNums.has(t.number)) {
        uniqueNums.set(t.number, t);
      }
    }
    const sorted = Array.from(uniqueNums.values()).sort((a, b) => a.number - b.number);

    for (let i = 0; i < sorted.length; i++) {
      const run: Tile[] = [sorted[i]];
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].number === run[run.length - 1].number + 1) {
          run.push(sorted[j]);
          if (run.length >= 3) {
            const pts = run.reduce((sum, t) => sum + t.number, 0);
            results.push({ tiles: [...run], points: pts });
          }
        } else {
          break;
        }
      }
    }
  }

  return results;
}
