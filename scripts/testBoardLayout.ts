/**
 * Pure-function regression test for the boardLayout helper and the
 * useFitTileSize shrink-then-scroll algorithm.
 *
 * Run with: npx ts-node --esm scripts/testBoardLayout.ts
 * (or paste into a browser console after bundling)
 *
 * The test does NOT require a DOM or browser – it exercises the math directly.
 */

// ─── Replicated pure helpers (keep in sync with useFitTileSize.ts) ──────────

const TILE_ASPECT = 0.72;
const MAX_ROWS_NORMAL = 3;
const MAX_ROWS_SMALL  = 2;

function boardLayout(
  containerW: number,
  sets: { tiles: { id: string }[] }[],
  tileW: number,
  gapRatio: number,
  meldGapRatio: number,
  paddingH: number,
): { rows: number; totalH: number } {
  const tileH       = tileW / TILE_ASPECT;
  const tileGap     = Math.max(2, tileW * gapRatio);
  const meldGap     = Math.max(4, tileW * meldGapRatio);
  const meldHeaderH = Math.max(10, tileW * 0.45);
  const meldPadV    = Math.max(4, tileW * 0.18);
  const meldPadH    = Math.max(4, tileW * 0.18);
  const availW      = containerW - paddingH;

  let rowX   = 0;
  let rowH   = 0;
  let rows   = sets.length > 0 ? 1 : 0;
  let totalH = 0;

  for (const set of sets) {
    const n     = Math.max(1, set.tiles.length);
    const meldW = n * tileW + (n - 1) * tileGap + meldPadH * 2 + 4;
    const meldH = tileH + meldHeaderH + meldPadV * 2;

    if (rowX > 0 && rowX + meldGap + meldW > availW) {
      totalH += rowH + meldGap;
      rowX    = 0;
      rowH    = 0;
      rows   += 1;
    }
    rowX += (rowX > 0 ? meldGap : 0) + meldW;
    rowH  = Math.max(rowH, meldH);
  }
  totalH += rowH;

  return { rows, totalH };
}

function fitTileSize(
  containerW: number,
  containerH: number,
  sets: { tiles: { id: string }[] }[],
  maxRows: number,
  opts = { maxTileW: 50, minTileW: 22, gapRatio: 0.10, meldGapRatio: 0.35, paddingH: 20, paddingV: 48 },
): { tileW: number; needsScroll: boolean; rows: number } {
  const { maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV } = opts;
  const availH = containerH - paddingV;

  let lo = minTileW, hi = maxTileW, best = -1;
  let bestRows = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { rows, totalH } = boardLayout(containerW, sets, mid, gapRatio, meldGapRatio, paddingH);
    if (totalH <= availH && rows <= maxRows) { best = mid; bestRows = rows; lo = mid + 1; }
    else                                     { hi = mid - 1; }
  }

  if (best >= minTileW) {
    return { tileW: best, needsScroll: false, rows: bestRows };
  } else {
    const { rows } = boardLayout(containerW, sets, minTileW, gapRatio, meldGapRatio, paddingH);
    return { tileW: minTileW, needsScroll: true, rows };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function makeSet(n: number): { tiles: { id: string }[] } {
  return { tiles: Array.from({ length: n }, (_, i) => ({ id: `t${i}` })) };
}

function assert(
  label: string,
  condition: boolean,
  detail?: string,
) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Test cases ───────────────────────────────────────────────────────────────

console.log('\n=== boardLayout unit tests ===');

{
  // 3 small melds on a wide desktop row — should fit in 1 row
  const result = boardLayout(1366, [makeSet(4), makeSet(3), makeSet(5)], 40, 0.1, 0.35, 20);
  assert('3 melds on 1366px wide — 1 row', result.rows === 1, `got ${result.rows}`);
  assert('3 melds totalH > 0', result.totalH > 0);
}

{
  // Force 2 rows: many melds on narrow container
  const sets = Array.from({ length: 8 }, (_, i) => makeSet(3 + i));
  const result = boardLayout(390, sets, 30, 0.1, 0.35, 20);
  assert('8 melds on 390px — more than 1 row', result.rows > 1, `got ${result.rows}`);
}

console.log('\n=== fitTileSize viewport scenarios ===');

// Helper: human-readable report
function report(
  vpLabel: string,
  w: number, h: number,
  sets: { tiles: { id: string }[] }[],
  isSmall: boolean,
) {
  const maxRows = isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;
  const { tileW, needsScroll, rows } = fitTileSize(w, h, sets, maxRows);
  const tileH = Math.round(tileW / TILE_ASPECT);
  console.log(
    `  ${vpLabel.padEnd(20)} | ${sets.length} melds | tileW=${tileW}px tileH=${tileH}px | rows=${rows} | scroll=${needsScroll}`
  );
  return { tileW, needsScroll, rows };
}

const FEW_MELDS    = [makeSet(4), makeSet(3), makeSet(5)];
const MEDIUM_MELDS = Array.from({ length: 6 }, (_, i) => makeSet(3 + i));
const FULL_MELDS   = Array.from({ length: 12 }, (_, i) => makeSet(3 + (i % 4)));  // ~50 tiles

const VIEWPORTS: [string, number, number, boolean][] = [
  ['360×640',   360,  640, true ],
  ['390×844',   390,  844, true ],
  ['768×1024',  768, 1024, false],
  ['1366×768', 1366,  768, false],
  ['844×390',   844,  390, true ],   // landscape phone
];

for (const [label, w, h, isSmall] of VIEWPORTS) {
  console.log(`\n  ── ${label} (${isSmall ? 'small' : 'normal'} screen, maxRows=${isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL}) ──`);
  const few    = report('(a) few melds',    w, h, FEW_MELDS,    isSmall);
  const medium = report('(b) medium board', w, h, MEDIUM_MELDS, isSmall);
  const full   = report('(c) full board',   w, h, FULL_MELDS,   isSmall);

  assert(
    `${label} few: tileW in [22,50]`,
    few.tileW >= 22 && few.tileW <= 50,
    `got ${few.tileW}`,
  );
  assert(
    `${label} full board: if rows > maxRows then needsScroll=true`,
    full.rows <= (isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL) || full.needsScroll,
  );
  assert(
    `${label} medium: tileW >= 22`,
    medium.tileW >= 22,
    `got ${medium.tileW}`,
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
