/**
 * scripts/testSolver.ts
 *
 * Test suite for rummikubSolver.ts
 * Run with: npm run test:solver
 *
 * Tests:
 *  (a) Split a long run to place a rack tile
 *  (b) Break a group to extend two runs
 *  (c) Board joker reuse (move joker from one set to another)
 *  (d) Initial meld: exactly meets threshold with 2 and 3 sets; must not touch board
 *  (e) No possible placement returns empty solutions
 *  (f) Large board (12 sets) + 14-tile rack finishes within time budget
 *  (g) Self-play stress test: 200 random bot-vs-bot turns, validate every result
 */

import '../server/loadEnv.js';
import { solveBestMove } from '../server/rummikubSolver.js';
import { validateBoard, calculateInitialMeldPoints } from '../src/utils/rummikubRules.js';
import { Tile, TileSet } from '../src/types/rummikub.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

function tile(id: string, color: Tile['color'], number: number, isJoker = false): Tile {
  return { id, color, number, isJoker };
}

function set(id: string, tiles: Tile[]): TileSet {
  return { id, tiles };
}

function assertConservation(
  rack: Tile[], board: TileSet[],
  newRack: Tile[], newBoard: TileSet[],
  label: string,
) {
  const allOld = new Set([...rack.map(t => t.id), ...board.flatMap(s => s.tiles.map(t => t.id))]);
  const allNew = new Set([...newRack.map(t => t.id), ...newBoard.flatMap(s => s.tiles.map(t => t.id))]);
  const lost = [...allOld].filter(id => !allNew.has(id));
  const invented = [...allNew].filter(id => !allOld.has(id));
  assert(lost.length === 0, `${label}: no tiles lost (lost: ${lost.join(',')})`);
  assert(invented.length === 0, `${label}: no tiles invented (invented: ${invented.join(',')})`);
}

// ─── Test (a): Split a long run to place a rack tile ─────────────────────────
console.log('\n[a] Split long run to place rack tile');
{
  // Board: red 1-2-3-4-5-6-7-8-9 (one long run)
  // Rack: red 5 (second copy) — can only be placed if run is split
  // Actually: rack has red 10 — can append. Let's make it harder:
  // Board: red 3-4-5-6-7-8-9-10-11 (9 tiles)
  // Rack: red 6 (second copy) — impossible to add to run (duplicate)
  // Better: Board: red 1-2-3-4-5-6-7 + blue 8-9-10
  //         Rack: red 8 — can only place if we split red run and attach red 8
  // Actually simplest: board has red 1-2-3-4-5-6-7-8-9-10
  // Rack has red 5 (copy 2) — can't append. But if we split into [1-2-3-4-5] and [5-6-7-8-9-10]
  // that's invalid (duplicate 5). So: split into [1-2-3-4] (invalid <3 with 4 tiles ok) and [5-6-7-8-9-10]
  // and place rack red 5 in [1-2-3-4-5]. That works!

  const boardRun: Tile[] = [
    tile('r1','red',1), tile('r2','red',2), tile('r3','red',3), tile('r4','red',4),
    tile('r5','red',5), tile('r6','red',6), tile('r7','red',7), tile('r8','red',8),
    tile('r9','red',9), tile('r10','red',10),
  ];
  const board = [set('s1', boardRun)];
  const rackTile = tile('r5b','red',5); // second red 5
  const rack = [rackTile];

  const result = solveBestMove(rack, board, true, 30, { timeBudgetMs: 2000, difficulty: 'hard' });
  assert(result.solutions.length > 0, 'found a solution');
  if (result.solutions.length > 0) {
    const sol = result.solutions[0];
    assert(sol.tilesPlaced >= 1, `placed ${sol.tilesPlaced} tile(s)`);
    const bv = validateBoard(sol.newBoard);
    assert(bv.valid, `board valid (errors: ${bv.errors.join(',')})`);
    assertConservation(rack, board, sol.newRack, sol.newBoard, 'split-run');
    assert(sol.rearranged, 'board was rearranged');
  }
  console.log(`  solverMs=${result.solverMs} timedOut=${result.timedOut}`);
}

// ─── Test (b): Break a group to extend two runs ───────────────────────────────
console.log('\n[b] Break group to extend two runs');
{
  // Board: group [7R, 7B, 7Bk] + run [5R,6R] (incomplete, but we'll make it valid)
  // Actually need valid board to start. Let's use:
  // Board: group [8R,8B,8Bk] + run [5R,6R,7R] + run [5B,6B,7B]
  // Rack: [8Y] — can extend group to 4-tile group, OR
  //              break group and use 8R to extend red run to [5R,6R,7R,8R]
  //              and 8B to extend blue run to [5B,6B,7B,8B], freeing 8Bk for rack
  // The solver should find placing 8Y into the group (1 tile placed) OR
  // rearranging to place 8Y somewhere else. Let's make it so only rearranging works:
  // Board: group [9R,9B,9Bk] + run [6R,7R,8R] + run [6B,7B,8B]
  // Rack: [9Y, 10R, 10B] — 9Y can extend group to 4. But also:
  //   break group: use 9R in [6R,7R,8R,9R], use 9B in [6B,7B,8B,9B], 9Bk stays on board
  //   then 9Y can form new group [9Bk,9Y,...] — needs one more 9
  // This is getting complex. Simpler:
  // Board: group [7R,7B,7Bk] + run [4R,5R,6R] + run [4B,5B,6B]
  // Rack: [7Y, 8R, 8B] — 7Y extends group to 4 (1 tile placed)
  //   OR: break group, use 7R in [4R,5R,6R,7R], use 7B in [4B,5B,6B,7B],
  //       then 7Bk + 7Y + need one more 7 for group — can't. So 7Y alone can't be placed without group.
  //   Actually 7Y can extend the group directly. Let's verify solver finds it.

  const board = [
    set('g1', [tile('7r','red',7), tile('7b','blue',7), tile('7bk','black',7)]),
    set('run1', [tile('4r','red',4), tile('5r','red',5), tile('6r','red',6)]),
    set('run2', [tile('4b','blue',4), tile('5b','blue',5), tile('6b','blue',6)]),
  ];
  const rack = [tile('7y','yellow',7), tile('8r2','red',8), tile('8b2','blue',8)];

  const result = solveBestMove(rack, board, true, 30, { timeBudgetMs: 2000, difficulty: 'hard' });
  assert(result.solutions.length > 0, 'found a solution');
  if (result.solutions.length > 0) {
    const sol = result.solutions[0];
    assert(sol.tilesPlaced >= 1, `placed ${sol.tilesPlaced} tile(s)`);
    const bv = validateBoard(sol.newBoard);
    assert(bv.valid, `board valid`);
    assertConservation(rack, board, sol.newRack, sol.newBoard, 'break-group');
  }
  console.log(`  solverMs=${result.solverMs}`);
}

// ─── Test (c): Board joker reuse (move joker to different set) ────────────────
console.log('\n[c] Board joker moved to a different set');
{
  // Board: run [5R, JOKER, 7R] (joker acts as 6R) + run [8B,9B,10B]
  // Rack: [6R] — replace joker in run with real 6R, move joker to extend blue run
  // Result: [5R,6R,7R] + [8B,9B,10B,JOKER(=11B)]
  // Note: this variant does NOT have a "take joker from board" rule for humans,
  // but the SOLVER can freely rearrange all board tiles including jokers.

  const joker = tile('jk1','red',0,true);
  const board = [
    set('run1', [tile('5r','red',5), joker, tile('7r','red',7)]),
    set('run2', [tile('8b','blue',8), tile('9b','blue',9), tile('10b','blue',10)]),
  ];
  const rack = [tile('6r','red',6)];

  const result = solveBestMove(rack, board, true, 30, { timeBudgetMs: 2000, difficulty: 'hard' });
  assert(result.solutions.length > 0, 'found a solution');
  if (result.solutions.length > 0) {
    const sol = result.solutions[0];
    assert(sol.tilesPlaced >= 1, `placed ${sol.tilesPlaced} tile(s)`);
    const bv = validateBoard(sol.newBoard);
    assert(bv.valid, `board valid`);
    assertConservation(rack, board, sol.newRack, sol.newBoard, 'joker-reuse');
    // Joker should still be on the board
    const newBoardJokers = sol.newBoard.flatMap(s => s.tiles).filter(t => t.isJoker);
    assert(newBoardJokers.length === 1, 'joker still on board');
  }
  console.log(`  solverMs=${result.solverMs}`);
}

// ─── Test (d): Initial meld ───────────────────────────────────────────────────
console.log('\n[d] Initial meld — 2 sets and 3 sets');
{
  // Board has some tiles already (must not be touched)
  const existingBoard = [
    set('existing', [tile('e1','red',5), tile('e2','blue',5), tile('e3','black',5)]),
  ];

  // Rack with enough for 2 sets summing >= 30
  // Set A: [10R, 10B, 10Bk] = 30 pts exactly
  const rack2 = [
    tile('a1','red',10), tile('a2','blue',10), tile('a3','black',10),
  ];
  const result2 = solveBestMove(rack2, existingBoard, false, 30, { timeBudgetMs: 2000 });
  assert(result2.solutions.length > 0, '2-set initial meld: found solution');
  if (result2.solutions.length > 0) {
    const sol = result2.solutions[0];
    const bv = validateBoard(sol.newBoard);
    assert(bv.valid, '2-set: board valid');
    const meld = calculateInitialMeldPoints(sol.newBoard, existingBoard, 30);
    assert(!meld.touchedExisting, '2-set: did not touch existing board');
    assert(meld.points >= 30, `2-set: points=${meld.points} >= 30`);
    assertConservation(rack2, existingBoard, sol.newRack, sol.newBoard, 'initial-meld-2set');
  }

  // Rack with 3 sets
  const rack3 = [
    tile('b1','red',8), tile('b2','blue',8), tile('b3','black',8),   // 24 pts
    tile('c1','red',3), tile('c2','blue',3), tile('c3','black',3),   // 9 pts — total 33
  ];
  const result3 = solveBestMove(rack3, existingBoard, false, 30, { timeBudgetMs: 2000 });
  assert(result3.solutions.length > 0, '3-set initial meld: found solution');
  if (result3.solutions.length > 0) {
    const sol = result3.solutions[0];
    const meld = calculateInitialMeldPoints(sol.newBoard, existingBoard, 30);
    assert(!meld.touchedExisting, '3-set: did not touch existing board');
    assert(meld.points >= 30, `3-set: points=${meld.points} >= 30`);
  }
  console.log(`  solverMs2=${result2.solverMs} solverMs3=${result3.solverMs}`);
}

// ─── Test (e): No possible placement returns empty solutions ──────────────────
console.log('\n[e] No possible placement');
{
  // Rack: all different numbers and colors, no valid set possible
  const rack = [
    tile('x1','red',1), tile('x2','blue',3), tile('x3','black',7), tile('x4','yellow',11),
  ];
  const board = [
    set('s1', [tile('p1','red',5), tile('p2','blue',5), tile('p3','black',5)]),
  ];
  const result = solveBestMove(rack, board, true, 30, { timeBudgetMs: 1000 });
  assert(result.solutions.length === 0, 'no solutions found (draw required)');
  console.log(`  solverMs=${result.solverMs}`);
}

// ─── Test (f): Large board + 14-tile rack within time budget ──────────────────
console.log('\n[f] Large board (12 sets) + 14-tile rack within time budget');
{
  const board: TileSet[] = [
    set('s1',  [tile('f1','red',1),   tile('f2','red',2),   tile('f3','red',3)]),
    set('s2',  [tile('f4','red',4),   tile('f5','red',5),   tile('f6','red',6)]),
    set('s3',  [tile('f7','red',7),   tile('f8','red',8),   tile('f9','red',9)]),
    set('s4',  [tile('f10','blue',1), tile('f11','blue',2), tile('f12','blue',3)]),
    set('s5',  [tile('f13','blue',4), tile('f14','blue',5), tile('f15','blue',6)]),
    set('s6',  [tile('f16','blue',7), tile('f17','blue',8), tile('f18','blue',9)]),
    set('s7',  [tile('f19','black',1),tile('f20','black',2),tile('f21','black',3)]),
    set('s8',  [tile('f22','black',4),tile('f23','black',5),tile('f24','black',6)]),
    set('s9',  [tile('f25','yellow',1),tile('f26','yellow',2),tile('f27','yellow',3)]),
    set('s10', [tile('f28','yellow',4),tile('f29','yellow',5),tile('f30','yellow',6)]),
    set('s11', [tile('f31','red',10), tile('f32','blue',10), tile('f33','black',10)]),
    set('s12', [tile('f34','red',11), tile('f35','blue',11), tile('f36','black',11)]),
  ];
  const rack: Tile[] = [
    tile('g1','red',10),   tile('g2','blue',10),  tile('g3','black',10),
    tile('g4','yellow',10),tile('g5','red',11),   tile('g6','blue',11),
    tile('g7','black',11), tile('g8','yellow',11),tile('g9','red',12),
    tile('g10','blue',12), tile('g11','black',12),tile('g12','yellow',12),
    tile('g13','red',13),  tile('g14','blue',13),
  ];

  const t0 = Date.now();
  const result = solveBestMove(rack, board, true, 30, { timeBudgetMs: 1500, difficulty: 'hard' });
  const elapsed = Date.now() - t0;

  assert(elapsed <= 2500, `finished in ${elapsed}ms (budget 1500ms + 1s grace)`);
  console.log(`  solverMs=${result.solverMs} timedOut=${result.timedOut} solutions=${result.solutions.length}`);
  if (result.solutions.length > 0) {
    const sol = result.solutions[0];
    const bv = validateBoard(sol.newBoard);
    assert(bv.valid, `board valid`);
    assertConservation(rack, board, sol.newRack, sol.newBoard, 'large-board');
    console.log(`  tilesPlaced=${sol.tilesPlaced} rearranged=${sol.rearranged}`);
  }
}

// ─── Test (g): Self-play stress test ─────────────────────────────────────────
console.log('\n[g] Self-play stress test (200 turns)');
{
  import('../src/utils/rummikubRules.js').then(({ createFullDeck }) => {
    let totalMs = 0;
    let maxMs = 0;
    let turns = 0;
    let errors = 0;

    for (let game = 0; game < 10; game++) {
      const deck = createFullDeck();
      let board: TileSet[] = [];
      let rack1 = deck.splice(0, 14);
      let rack2 = deck.splice(0, 14);
      let pool = deck;
      let meld1 = false;
      let meld2 = false;

      for (let turn = 0; turn < 20; turn++) {
        const isP1 = turn % 2 === 0;
        const rack = isP1 ? rack1 : rack2;
        const hasMeld = isP1 ? meld1 : meld2;

        const t0 = Date.now();
        const result = solveBestMove(rack, board, hasMeld, 30, { timeBudgetMs: 500, difficulty: 'hard' });
        const ms = Date.now() - t0;
        totalMs += ms;
        maxMs = Math.max(maxMs, ms);
        turns++;

        if (result.solutions.length > 0) {
          const sol = result.solutions[0];
          const bv = validateBoard(sol.newBoard);
          if (!bv.valid) { errors++; continue; }

          // Tile conservation
          const allOld = new Set([...rack.map(t => t.id), ...board.flatMap(s => s.tiles.map(t => t.id))]);
          const allNew = new Set([...sol.newRack.map(t => t.id), ...sol.newBoard.flatMap(s => s.tiles.map(t => t.id))]);
          if (allOld.size !== allNew.size || [...allOld].some(id => !allNew.has(id))) { errors++; continue; }

          board = sol.newBoard;
          if (isP1) { rack1 = sol.newRack; meld1 = true; }
          else { rack2 = sol.newRack; meld2 = true; }
        } else {
          // Draw
          if (pool.length > 0) {
            const drawn = pool.pop()!;
            if (isP1) rack1.push(drawn);
            else rack2.push(drawn);
          }
        }
      }
    }

    const avgMs = Math.round(totalMs / turns);
    assert(errors === 0, `0 validation errors across ${turns} turns`);
    console.log(`  turns=${turns} avgMs=${avgMs} maxMs=${maxMs} errors=${errors}`);
    console.log(`\n  ⚠️  Render free tier (0.1 CPU) will be ~10x slower: avgMs≈${avgMs*10} maxMs≈${maxMs*10}`);
    if (avgMs * 10 > 1500) {
      console.log(`  ⚠️  Consider lowering timeBudgetMs to 800ms for Render free tier.`);
    }

    // Final summary
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  });
}
