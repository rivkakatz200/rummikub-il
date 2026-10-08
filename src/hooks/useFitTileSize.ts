import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TileSet } from '../types/rummikub';

export interface TileSize {
  w: number;
  h: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const MAX_ROWS_NORMAL = 3;   // tablets, desktop, tall phones
export const MAX_ROWS_SMALL  = 2;   // narrow / short / landscape phones
const TILE_ASPECT = 0.72;           // width / height (~w-8 h-11)

// Minimum tile widths
const MIN_TILE_W_BOARD  = 22;
const MIN_TILE_W_RACK   = 24;
// Maximum tile widths
const MAX_TILE_W_BOARD  = 50;
const MAX_TILE_W_RACK   = 46;

// ─── Types ────────────────────────────────────────────────────────────────────
interface BoardOptions {
  mode?: 'board';          // optional for backward compat
  sets: TileSet[];
  maxTileW?: number;
  minTileW?: number;
  gapRatio?: number;       // tile gap / tileW
  meldGapRatio?: number;   // meld gap / tileW
  paddingH?: number;       // horizontal padding consumed by the container chrome
  paddingV?: number;       // vertical  padding consumed by the container chrome
}

interface RackOptions {
  mode: 'rack';
  tileCount: number;
  maxTileW?: number;
  minTileW?: number;
  gapRatio?: number;
  paddingH?: number;
  paddingV?: number;
}

export type FitOptions = BoardOptions | RackOptions;

// ─── Pure layout functions (exported so they can be unit-tested) ───────────────

export interface BoardLayoutResult {
  rows: number;
  totalH: number;
}

export function computeBoardLayout(
  containerW: number,
  sets: TileSet[],
  tileW: number,
  gapRatio: number,
  meldGapRatio: number,
  paddingH: number,
): BoardLayoutResult {
  if (sets.length === 0) return { rows: 0, totalH: 0 };

  const tileH       = tileW / TILE_ASPECT;
  const tileGap     = Math.max(2, tileW * gapRatio);
  const meldGap     = Math.max(4, tileW * meldGapRatio);
  const meldHeaderH = Math.max(10, tileW * 0.45);
  const meldPadV    = Math.max(4, tileW * 0.18);
  const meldPadH    = Math.max(4, tileW * 0.18);
  const availW      = Math.max(1, containerW - paddingH);

  let rowX   = 0;
  let rowH   = 0;
  let rows   = 1;
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

export interface FitResult {
  tileW: number;
  tileH: number;
  rows: number;
  contentH: number;
  overflow: boolean;
}

/**
 * Pure function: find the largest tile width where the board fits in
 * containerH with ≤ maxRows rows, then return whether it overflows.
 *
 * This is the function to unit-test. It does NOT depend on whose turn it is.
 */
export function computeBoardFit(
  containerW: number,
  containerH: number,
  sets: TileSet[],
  params: {
    maxTileW: number;
    minTileW: number;
    gapRatio: number;
    meldGapRatio: number;
    paddingH: number;
    paddingV: number;
    maxRows: number;
  },
): FitResult {
  const { maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV, maxRows } = params;

  if (sets.length === 0) {
    return {
      tileW: maxTileW,
      tileH: Math.round(maxTileW / TILE_ASPECT),
      rows: 0,
      contentH: 0,
      overflow: false,
    };
  }

  const availH = Math.max(0, containerH - paddingV);

  // Binary search: largest tileW where BOTH (rows ≤ maxRows) AND (totalH ≤ availH)
  let lo = minTileW, hi = maxTileW, best = -1;
  let bestRows = 0, bestH = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { rows, totalH } = computeBoardLayout(containerW, sets, mid, gapRatio, meldGapRatio, paddingH);
    if (totalH <= availH && rows <= maxRows) {
      best = mid; bestRows = rows; bestH = totalH;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best >= minTileW) {
    return {
      tileW:    best,
      tileH:    Math.round(best / TILE_ASPECT),
      rows:     bestRows,
      contentH: bestH,
      overflow: false,
    };
  }

  // No fitting size — use minimum and scroll
  const { rows, totalH } = computeBoardLayout(containerW, sets, minTileW, gapRatio, meldGapRatio, paddingH);
  return {
    tileW:    minTileW,
    tileH:    Math.round(minTileW / TILE_ASPECT),
    rows,
    contentH: totalH,
    overflow: true,
  };
}

function computeRackFit(
  containerW: number,
  containerH: number,
  tileCount: number,
  maxTileW: number,
  minTileW: number,
  gapRatio: number,
  paddingH: number,
  paddingV: number,
): { tileW: number; tileH: number } {
  if (tileCount === 0) {
    return { tileW: maxTileW, tileH: Math.round(maxTileW / TILE_ASPECT) };
  }
  const availH = Math.max(0, containerH - paddingV);
  let lo = minTileW, hi = maxTileW, best = minTileW;
  while (lo <= hi) {
    const mid  = Math.floor((lo + hi) / 2);
    const tileH = mid / TILE_ASPECT;
    const gap   = Math.max(2, mid * gapRatio);
    const availW  = containerW - paddingH;
    const perRow  = Math.max(1, Math.floor((availW + gap) / (mid + gap)));
    const rows    = Math.ceil(tileCount / perRow);
    const totalH  = rows * tileH + (rows - 1) * gap;
    if (totalH <= availH) { best = mid; lo = mid + 1; }
    else                  { hi = mid - 1; }
  }
  return { tileW: best, tileH: Math.round(best / TILE_ASPECT) };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Attaches a ResizeObserver to the returned containerRef (which must be placed
 * on the OUTER, fixed-size box).  Returns [ref, tileSize, needsScroll].
 *
 * Key design decisions to prevent the "only shrinks on other player's turn" bug:
 *
 *  1. We do NOT wrap recompute in useCallback.  Instead we store the latest
 *     containerSize in a ref and call a plain function on every render when
 *     opts change, so a board change always triggers a fresh computation.
 *
 *  2. The boardSets key is a full deep-ish fingerprint (id + tile-count for
 *     every set) so even moving tiles within a turn is detected.
 *
 *  3. The ResizeObserver only updates the stored container size and triggers
 *     a setState; the actual fit computation runs synchronously in a
 *     useLayoutEffect that depends on BOTH the container size AND the opts.
 */
export function useFitTileSize(
  opts: FitOptions,
): [React.RefObject<HTMLDivElement | null>, TileSize, boolean] {
  const containerRef  = useRef<HTMLDivElement>(null);
  // Stored latest container dimensions (updated by ResizeObserver)
  const containerSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Trigger re-render when container dimensions change
  const [sizeTick, setSizeTick] = useState(0);

  const isRack = opts.mode === 'rack';

  // ── resolved params ──────────────────────────────────────────────────────
  const maxTileW     = opts.maxTileW     ?? (isRack ? MAX_TILE_W_RACK  : MAX_TILE_W_BOARD);
  const minTileW     = opts.minTileW     ?? (isRack ? MIN_TILE_W_RACK  : MIN_TILE_W_BOARD);
  const gapRatio     = opts.gapRatio     ?? 0.10;
  const meldGapRatio = isRack ? 0 : ((opts as BoardOptions).meldGapRatio ?? 0.35);
  const paddingH     = opts.paddingH     ?? 20;
  const paddingV     = opts.paddingV     ?? (isRack ? 36 : 48);

  // ── ResizeObserver: only updates container size ──────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w !== containerSize.current.w || h !== containerSize.current.h) {
        containerSize.current = { w, h };
        setSizeTick(t => t + 1);
      }
    });
    ro.observe(el);
    // Seed with current size immediately
    containerSize.current = { w: el.clientWidth, h: el.clientHeight };
    setSizeTick(t => t + 1);
    return () => ro.disconnect();
  }, []); // runs once — the ref stays stable

  // ── Compute result synchronously every render ────────────────────────────
  // (useLayoutEffect so the result is ready before paint)
  const [tileSize,    setTileSize]    = useState<TileSize>({ w: maxTileW, h: Math.round(maxTileW / TILE_ASPECT) });
  const [needsScroll, setNeedsScroll] = useState(false);

  // Build a stable-ish serialization of the board for the dep array
  const boardKey = isRack
    ? String((opts as RackOptions).tileCount)
    : (opts as BoardOptions).sets
        ?.map(s => `${s.id}:${s.tiles.length}`)
        .join(',') ?? '';

  useLayoutEffect(() => {
    const { w: cW, h: cH } = containerSize.current;
    if (cW <= 0 || cH <= 0) return;

    if (isRack) {
      const { tileCount } = opts as RackOptions;
      const r = computeRackFit(cW, cH, tileCount, maxTileW, minTileW, gapRatio, paddingH, paddingV);
      setTileSize(prev => (prev.w === r.tileW ? prev : r));
      setNeedsScroll(false);
      return;
    }

    const { sets } = opts as BoardOptions;
    const isSmall  = window.innerWidth < 480 || window.innerHeight < 700;
    const maxRows  = isSmall ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;

    const r = computeBoardFit(cW, cH, sets ?? [], {
      maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV, maxRows,
    });

    setTileSize(prev => (prev.w === r.tileW ? prev : { w: r.tileW, h: r.tileH }));
    setNeedsScroll(prev => (prev === r.overflow ? prev : r.overflow));
  // sizeTick ensures we re-run when the container resizes
  // boardKey ensures we re-run when the board content changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeTick, boardKey, maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV, isRack]);

  return [containerRef as React.RefObject<HTMLDivElement>, tileSize, needsScroll];
}
