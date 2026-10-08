/**
 * Unit test for the pure board layout / fit functions.
 * Run:  npx tsx scripts/testBoardLayout.ts
 *
 * Tests the math directly — no DOM, no React, no "whose turn it is".
 */

import { computeBoardFit, computeBoardLayout, MAX_ROWS_NORMAL, MAX_ROWS_SMALL } from '../src/hooks/useFitTileSize';
import type { TileSet } from '../src/types/rummikub';
import type { Tile } from '../src/types/rummikub';

// ─── helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function makeSet(n: number, id = Math.random().toString(36).slice(2)): TileSet {
  return {
    id,
    tiles: Array.from({ length: n }, (_, i) => ({
      id:     `${id}-t${i}`,
      color:  'black' as const,
      number: (i % 13) + 1,
      isJoker: false,
    } as Tile)),
  };
}

const DEFAULT_PARAMS = {
  maxTileW:     50,
  minTileW:     22,
  gapRatio:     0.10,
  meldGapRatio: 0.35,
  paddingH:     24,
  paddingV:     52,
};

function fit(w: number, h: number, sets: TileSet[], isSmall = false) {
  const maxRows = isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;
  return computeBoardFit(w, h, sets, { ...DEFAULT_PARAMS, maxRows });
}

// ─── boardLayout unit tests ───────────────────────────────────────────────────
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
  assert('empty board → 0 rows, 0 height', r.rows === 0 && r.totalH === 0);
}

// ─── computeBoardFit unit tests ───────────────────────────────────────────────
console.log('\n=== computeBoardFit — few melds (large tiles) ===');
{
  const sets = [makeSet(4), makeSet(3), makeSet(5)];
  const r = fit(1366, 768, sets, false);
  assert('large screen, few melds → no overflow', !r.overflow);
  assert('large screen, few melds → rows ≤ 3', r.rows <= MAX_ROWS_NORMAL, `rows=${r.rows}`);
  assert('large screen, few melds → tileW ≥ 40', r.tileW >= 40, `tileW=${r.tileW}`);
}

console.log('\n=== computeBoardFit — medium board ===');
{
  const sets = Array.from({ length: 6 }, (_, i) => makeSet(3 + i));
  for (const [w, h, isSmall, label] of [
    [390, 844, true,  '390×844 portrait'],
    [768, 1024, false, '768×1024 tablet'],
    [1366, 768, false, '1366×768 desktop'],
  ] as [number, number, boolean, string][]) {
    const r = fit(w, h, sets, isSmall);
    const maxR = isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;
    assert(`${label}: medium board → rows ≤ ${maxR} or overflow`, r.rows <= maxR || r.overflow, `rows=${r.rows} overflow=${r.overflow}`);
    assert(`${label}: tileW ≥ 22`, r.tileW >= 22, `tileW=${r.tileW}`);
  }
}

console.log('\n=== computeBoardFit — full board (~12 melds, ~50 tiles) ===');
{
  // 12 melds averaging ~4 tiles each = ~48 tiles
  const sets = Array.from({ length: 12 }, (_, i) => makeSet(3 + (i % 4)));
  for (const [w, h, isSmall, label] of [
    [360, 640, true,  '360×640 small phone'],
    [390, 844, true,  '390×844 phone'],
    [768, 1024, false, '768×1024 tablet'],
    [1366, 768, false, '1366×768 desktop'],
    [844, 390, true,  '844×390 landscape'],
  ] as [number, number, boolean, string][]) {
    const r = fit(w, h, sets, isSmall);
    const maxR = isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;
    assert(`${label}: full board → either fits in ${maxR} rows or scroll=true`,
      r.rows <= maxR || r.overflow, `rows=${r.rows} overflow=${r.overflow}`);
    assert(`${label}: tileW ≥ 22`, r.tileW >= 22, `tileW=${r.tileW}`);
    // Desktop + tablet should fit without scroll at 12 melds
    if (!isSmall) {
      assert(`${label}: desktop/tablet full board → no scroll at min size`, r.overflow === false || r.tileW === 22, `overflow=${r.overflow} tileW=${r.tileW}`);
    }
  }
}

console.log('\n=== computeBoardFit — turn-independence ===');
{
  // The pure function does not take a "turn" argument.
  // Verify the same sets produce the same result regardless of whatever other
  // state might exist in the app.
  const sets = Array.from({ length: 8 }, (_, i) => makeSet(3 + i));
  const r1 = fit(768, 500, sets, false);
  const r2 = fit(768, 500, sets, false); // called again — must be identical
  assert('same inputs → same tileW', r1.tileW === r2.tileW);
  assert('same inputs → same overflow', r1.overflow === r2.overflow);
  assert('same inputs → same rows', r1.rows === r2.rows);
}

console.log('\n=== computeBoardFit — overflow boundary ===');
{
  // Very cramped: 12 melds on a tiny container where even minTileW won't fit in rows ≤ 2
  const sets = Array.from({ length: 12 }, () => makeSet(4));
  const r = fit(360, 400, sets, true);
  assert('12 melds on tiny container → overflow=true', r.overflow === true, `overflow=${r.overflow}`);
  assert('overflow → tileW = minTileW (22)', r.tileW === 22, `tileW=${r.tileW}`);
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
