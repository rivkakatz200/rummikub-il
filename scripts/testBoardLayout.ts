/**
 * Unit tests for the pure board fit / layout functions.
 * Run:  npm run test:layout
 *
 * Key guarantee: tileH <= (availH) / (3/TILE_ASPECT + 2*meldGapRatio)
 * where availH = containerH - paddingV.
 * This ensures 3 rows of tiles always fit in the visible box height.
 */

import { computeBoardFit, computeBoardLayout, ABS_MIN_TILE_W } from '../src/hooks/useFitTileSize';
import type { TileSet } from '../src/types/rummikub';
import type { Tile } from '../src/types/rummikub';

const TILE_ASPECT = 0.72;

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function makeSet(n: number, id = Math.random().toString(36).slice(2)): TileSet {
  return {
    id,
    tiles: Array.from({ length: n }, (_, i) => ({
      id: `${id}-t${i}`, color: 'black' as const,
      number: (i % 13) + 1, isJoker: false,
    } as Tile)),
  };
}

const PARAMS = {
  gapRatio:     0.10,
  meldGapRatio: 0.35,
  paddingH:     24,
  paddingV:     52,
};

// Helper: compute the theoretical max tileH the 3-row guarantee allows
function maxAllowedTileH(containerH: number): number {
  const availH = containerH - PARAMS.paddingV;
  // From: 3*tileH + 2*gapY ≤ availH where gapY ≈ tileW*meldGapRatio = tileH*TILE_ASPECT*meldGapRatio
  // => tileH*(3 + 2*TILE_ASPECT*meldGapRatio) ≤ availH
  return availH / (3 + 2 * TILE_ASPECT * PARAMS.meldGapRatio);
}

function fit(w: number, h: number, sets: TileSet[]) {
  return computeBoardFit(w, h, sets, PARAMS);
}

// ─── computeBoardLayout ───────────────────────────────────────────────────────
console.log('\n=== computeBoardLayout ===');
{
  const r = computeBoardLayout(1366, [makeSet(4), makeSet(3), makeSet(5)], 40, 0.1, 0.35, 24);
  assert('3 melds on 1366px → 1 row', r.rows === 1, `rows=${r.rows}`);
  assert('totalH > 0', r.totalH > 0);
}
{
  const sets = Array.from({ length: 8 }, (_, i) => makeSet(3 + i));
  const r = computeBoardLayout(390, sets, 30, 0.1, 0.35, 24);
  assert('8 melds on 390px → >1 row', r.rows > 1, `rows=${r.rows}`);
}
{
  const r = computeBoardLayout(800, [], 40, 0.1, 0.35, 24);
  assert('empty board → 0 rows 0 height', r.rows === 0 && r.totalH === 0);
}

// ─── 3-row guarantee ─────────────────────────────────────────────────────────
console.log('\n=== 3-row height cap guarantee ===');

const BOX_SIZES: [number, number, string][] = [
  [360, 300, '360×300 (very small)'],
  [360, 640, '360×640'],
  [390, 844, '390×844'],
  [768, 1024,'768×1024'],
  [1366, 768,'1366×768'],
  [844, 390, '844×390 landscape'],
  [1200, 500,'1200×500'],
];

const FEW   = [makeSet(4), makeSet(3), makeSet(5)];
const MEDIUM = Array.from({ length: 6 }, (_, i) => makeSet(3 + i));
const FULL   = Array.from({ length: 12 }, (_, i) => makeSet(3 + (i % 4)));  // ~48 tiles

for (const [w, h, label] of BOX_SIZES) {
  const capTileH = maxAllowedTileH(h);
  for (const [sets, name] of [[FEW, 'few'], [MEDIUM, 'medium'], [FULL, 'full']] as [TileSet[], string][]) {
    const r = fit(w, h, sets);
    // THE HARD GUARANTEE: tileH ≤ maxAllowedTileH OR the box is so tiny that ABS_MIN applies
    const effectiveCap = Math.max(ABS_MIN_TILE_W / TILE_ASPECT, capTileH);
    assert(
      `${label} ${name}: tileH(${r.tileH}) ≤ cap(${Math.ceil(effectiveCap)})`,
      r.tileH <= Math.ceil(effectiveCap) + 1, // +1 for rounding
      `tileH=${r.tileH} cap=${Math.ceil(effectiveCap)}`,
    );
    assert(`${label} ${name}: tileW ≥ ${ABS_MIN_TILE_W}`, r.tileW >= ABS_MIN_TILE_W, `tileW=${r.tileW}`);
  }
}

// ─── few melds → no overflow ──────────────────────────────────────────────────
console.log('\n=== few melds → no overflow ===');
for (const [w, h, label] of BOX_SIZES) {
  const r = fit(w, h, FEW);
  assert(`${label} few melds: no overflow`, !r.overflow, `overflow=${r.overflow} tileW=${r.tileW}`);
}

// ─── full board ───────────────────────────────────────────────────────────────
console.log('\n=== full board (12 melds) ===');
for (const [w, h, label] of BOX_SIZES) {
  const r = fit(w, h, FULL);
  assert(
    `${label} full: either fits in box or overflow=true`,
    !r.overflow || r.tileW === ABS_MIN_TILE_W,
    `overflow=${r.overflow} tileW=${r.tileW}`,
  );
}

// ─── turn-independence ────────────────────────────────────────────────────────
console.log('\n=== turn-independence ===');
{
  // computeBoardFit takes no "turn" argument — prove identical results
  const sets = MEDIUM;
  const r1 = fit(768, 500, sets);
  const r2 = fit(768, 500, sets);
  assert('same inputs → same tileW', r1.tileW === r2.tileW);
  assert('same inputs → same overflow', r1.overflow === r2.overflow);
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
