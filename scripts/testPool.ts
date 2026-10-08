/**
 * npm run test:pool
 * Investigates the tile pool: composition, shuffle quality, and draw behaviour.
 */

import { createFullDeck, shuffleDeck } from '../src/utils/rummikubRules.js';
import type { Tile } from '../src/types/rummikub.js';

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── 1. Pool composition ──────────────────────────────────────────────────────
console.log('\n=== Pool composition ===');
const deck = createFullDeck();
console.log(`  Total tiles: ${deck.length}`);

const jokers = deck.filter(t => t.isJoker);
const nonJokers = deck.filter(t => !t.isJoker);
console.log(`  Jokers: ${jokers.length}`);
console.log(`  Non-jokers: ${nonJokers.length}`);

assert('Total = 106', deck.length === 106, `got ${deck.length}`);
assert('Jokers = 2', jokers.length === 2, `got ${jokers.length}`);
assert('Non-jokers = 104', nonJokers.length === 104, `got ${nonJokers.length}`);

// Every joker has number 0
for (const j of jokers) {
  assert(`Joker ${j.id} has number 0`, j.number === 0 && j.isJoker === true);
}

// Each number 1-13 appears exactly 8 times (4 colors × 2 copies)
const numCount: Record<number, number> = {};
for (const t of nonJokers) {
  numCount[t.number] = (numCount[t.number] ?? 0) + 1;
}
console.log('  Number distribution:', numCount);
for (let n = 1; n <= 13; n++) {
  assert(`Number ${n} appears 8 times`, numCount[n] === 8, `got ${numCount[n]}`);
}

// All IDs unique
const ids = new Set(deck.map(t => t.id));
assert('All IDs unique', ids.size === 106, `got ${ids.size} unique`);

// No number 0 among non-jokers
const zeroNonJoker = nonJokers.filter(t => t.number === 0);
assert('No non-joker with number 0', zeroNonJoker.length === 0, `got ${zeroNonJoker.length}`);

// ─── 2. Shuffle uniformity (joker position across 1000 shuffles) ───────────────
console.log('\n=== Shuffle uniformity (1000 shuffles) ===');
const RUNS = 1000;
const jokerPositions: number[] = [];

for (let i = 0; i < RUNS; i++) {
  const d = createFullDeck();
  const firstJokerIdx = d.findIndex(t => t.isJoker);
  jokerPositions.push(firstJokerIdx);
}

const posMin = Math.min(...jokerPositions);
const posMax = Math.max(...jokerPositions);
const posAvg = jokerPositions.reduce((a, b) => a + b, 0) / RUNS;
console.log(`  Joker first-position: min=${posMin} max=${posMax} avg=${posAvg.toFixed(1)}`);

// A good shuffle should have the joker appearing across a wide range
assert('Joker appears at position 0 at least once', posMin === 0, `min=${posMin}`);
assert('Joker appears near the end (pos >= 100) at least once', posMax >= 100, `max=${posMax}`);
assert('Average joker position near middle (30-75)', posAvg >= 30 && posAvg <= 75, `avg=${posAvg.toFixed(1)}`);

// ─── 3. Draw from end (pop) ────────────────────────────────────────────────────
console.log('\n=== First 20 tiles drawn via pop() ===');
// Simulate: deal 14 tiles to 2 players (splice from front, as server does)
const pool = createFullDeck();
const rack1 = pool.splice(0, 14);
const rack2 = pool.splice(0, 14);
console.log(`  Pool size after deal: ${pool.length} (expected 78)`);
assert('Pool = 78 after 2-player deal', pool.length === 78);

const drawn: Tile[] = [];
for (let i = 0; i < 20 && pool.length > 0; i++) {
  drawn.push(pool.pop()!);
}

console.log('  First 20 drawn tiles:');
for (const t of drawn) {
  const valid = t.isJoker
    ? t.number === 0
    : t.number >= 1 && t.number <= 13 && ['black','blue','red','yellow'].includes(t.color);
  console.log(`    id=${t.id.padEnd(25)} color=${t.color.padEnd(6)} number=${t.number} isJoker=${t.isJoker} valid=${valid}`);
  assert(`Drawn tile ${t.id} is valid`, valid, `number=${t.number} color=${t.color}`);
}

// ─── 4. Exhaustion test ────────────────────────────────────────────────────────
console.log('\n=== Pool exhaustion (draw all remaining tiles) ===');
let invalidCount = 0;
while (pool.length > 0) {
  const t = pool.pop()!;
  const valid = t.isJoker
    ? t.number === 0
    : t.number >= 1 && t.number <= 13 && ['black','blue','red','yellow'].includes(t.color);
  if (!valid) {
    invalidCount++;
    console.error(`  INVALID tile drawn: ${JSON.stringify(t)}`);
  }
}
assert('No invalid tiles in entire pool after deal', invalidCount === 0, `${invalidCount} invalid`);

// ─── 5. Simulate "zeros" scenario ─────────────────────────────────────────────
console.log('\n=== Simulate zeros scenario: draw tiles one by one and detect issues ===');
const simPool = createFullDeck();
// Deal 14 each to 4 players
for (let p = 0; p < 4; p++) simPool.splice(0, 14);
console.log(`  Pool after 4-player deal: ${simPool.length} tiles (expected 50)`);
assert('Pool = 50 after 4-player deal', simPool.length === 50);

let drawNum = 0;
let firstZeroNonJoker = -1;
while (simPool.length > 0) {
  drawNum++;
  const t = simPool.pop()!;
  if (!t.isJoker && t.number === 0 && firstZeroNonJoker === -1) {
    firstZeroNonJoker = drawNum;
    console.error(`  !! Non-joker zero at draw #${drawNum}: ${JSON.stringify(t)}`);
  }
}

if (firstZeroNonJoker === -1) {
  console.log('  No non-joker zeros found across all draws — pool data is clean.');
  passed++;
} else {
  console.error(`  FIRST non-joker zero at draw #${firstZeroNonJoker}`);
  failed++;
}

// ─── 6. Safety validation ─────────────────────────────────────────────────────
console.log('\n=== Safety validation: all pool tiles pass server check ===');
{
  const safePool = createFullDeck();
  let badTiles = 0;
  for (const t of safePool) {
    const valid =
      typeof t.number === 'number' &&
      t.number >= 0 && t.number <= 13 &&
      typeof t.id === 'string' && t.id.length > 0 &&
      typeof t.color === 'string' && ['black','blue','red','yellow'].includes(t.color);
    if (!valid) { badTiles++; console.error('Bad tile:', t); }
  }
  assert('All pool tiles pass server safety check', badTiles === 0, `${badTiles} bad`);
}
console.log(`\n${'─'.repeat(55)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
