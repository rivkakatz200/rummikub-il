import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TileSet } from '../types/rummikub';

export interface TileSize {
  w: number;
  h: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Absolute floor for legibility (overrides the 3-row guarantee only after everything else fails)
export const ABS_MIN_TILE_W = 14;
const TILE_ASPECT = 0.72;  // width / height

// ─── Types ────────────────────────────────────────────────────────────────────
interface BoardOptions {
  mode?: 'board';
  sets: TileSet[];
  maxTileW?: number;
  minTileW?: number;
  gapRatio?: number;
  meldGapRatio?: number;
  paddingH?: number;
  paddingV?: number;
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

// ─── Pure layout functions ────────────────────────────────────────────────────

export interface BoardLayoutResult {
  rows: number;
  totalH: number;
}

/**
 * Given tile width, compute how many rows and total height the board needs.
 */
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
 * The 3-row guarantee: compute maxTileH from box height so 3 rows always fit.
 * Then find the largest tile size ≤ that cap where all melds fit.
 */
export function computeBoardFit(
  containerW: number,
  containerH: number,
  sets: TileSet[],
  params: {
    gapRatio: number;
    meldGapRatio: number;
    paddingH: number;
    paddingV: number;
  },
): FitResult {
  const { gapRatio, meldGapRatio, paddingH, paddingV } = params;

  if (sets.length === 0) {
    // empty board: use a reasonable mid-size tile
    const tileW = 36;
    return {
      tileW,
      tileH: Math.round(tileW / TILE_ASPECT),
      rows: 0,
      contentH: 0,
      overflow: false,
    };
  }

  // THE 3-ROW GUARANTEE: compute the max tile height that allows 3 rows to fit
  // availH = containerH - paddingV
  // 3 rows means: 3 * tileH + 2 * gapY  ≤ availH
  // Assume gapY scales with tileW: gapY = max(4, tileW * meldGapRatio)
  // For simplicity, use a conservative estimate: gapY ≈ tileW * 0.35
  // => 3*tileH + 2*tileW*0.35 ≤ availH
  // => tileH ≤ (availH - 2*tileW*0.35)/3
  // But tileH = tileW / TILE_ASPECT, so:
  // => tileW / TILE_ASPECT ≤ (availH - 2*tileW*0.35)/3
  // => tileW ≤ (availH * TILE_ASPECT) / (1 + 2*0.35*TILE_ASPECT*3)
  // Simplify: solve for tileW directly from the constraint.
  // Let gapCoeff = meldGapRatio (used for vertical gaps between rows)
  // 3*tileH + 2*gapY ≤ availH
  // with tileH = tileW/TILE_ASPECT and gapY = max(4, tileW*gapCoeff)
  // Approximate: gapY ≈ tileW * gapCoeff (ignoring the max(4,...) for large tiles)
  // => 3*(tileW/TILE_ASPECT) + 2*tileW*gapCoeff ≤ availH
  // => tileW * (3/TILE_ASPECT + 2*gapCoeff) ≤ availH
  // => tileW ≤ availH / (3/TILE_ASPECT + 2*gapCoeff)
  
  const availH = Math.max(0, containerH - paddingV);
  const gapCoeff = meldGapRatio;
  const maxTileWFromHeight = availH / (3 / TILE_ASPECT + 2 * gapCoeff);
  const capTileW = Math.max(ABS_MIN_TILE_W, Math.floor(maxTileWFromHeight));

  // Binary search: find largest tileW ≤ capTileW where all melds fit in availH
  let lo = ABS_MIN_TILE_W, hi = capTileW, best = ABS_MIN_TILE_W;
  let bestRows = 0, bestH = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { rows, totalH } = computeBoardLayout(containerW, sets, mid, gapRatio, meldGapRatio, paddingH);
    if (totalH <= availH) {
      best = mid;
      bestRows = rows;
      bestH = totalH;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const overflow = bestH > availH;

  return {
    tileW:    best,
    tileH:    Math.round(best / TILE_ASPECT),
    rows:     bestRows,
    contentH: bestH,
    overflow,
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
    const mid = Math.floor((lo + hi) / 2);
    const tileH = mid / TILE_ASPECT;
    const gap   = Math.max(2, mid * gapRatio);
    const availW = containerW - paddingH;
    const perRow = Math.max(1, Math.floor((availW + gap) / (mid + gap)));
    const rows   = Math.ceil(tileCount / perRow);
    const totalH = rows * tileH + (rows - 1) * gap;
    if (totalH <= availH) { best = mid; lo = mid + 1; }
    else                  { hi = mid - 1; }
  }
  return { tileW: best, tileH: Math.round(best / TILE_ASPECT) };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFitTileSize(
  opts: FitOptions,
): [React.RefObject<HTMLDivElement | null>, TileSize, boolean] {
  const containerRef  = useRef<HTMLDivElement>(null);
  const containerSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [sizeTick, setSizeTick] = useState(0);

  const isRack = opts.mode === 'rack';

  const maxTileW     = opts.maxTileW     ?? (isRack ? 46 : 50);
  const minTileW     = opts.minTileW     ?? (isRack ? 24 : ABS_MIN_TILE_W);
  const gapRatio     = opts.gapRatio     ?? 0.10;
  const meldGapRatio = isRack ? 0 : ((opts as BoardOptions).meldGapRatio ?? 0.35);
  const paddingH     = opts.paddingH     ?? 20;
  const paddingV     = opts.paddingV     ?? (isRack ? 36 : 48);

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
    containerSize.current = { w: el.clientWidth, h: el.clientHeight };
    setSizeTick(t => t + 1);
    return () => ro.disconnect();
  }, []);

  const [tileSize, setTileSize] = useState<TileSize>({ w: maxTileW, h: Math.round(maxTileW / TILE_ASPECT) });
  const [needsScroll, setNeedsScroll] = useState(false);

  const boardKey = isRack
    ? String((opts as RackOptions).tileCount)
    : (opts as BoardOptions).sets?.map(s => `${s.id}:${s.tiles.length}`).join(',') ?? '';

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
    const r = computeBoardFit(cW, cH, sets ?? [], {
      gapRatio, meldGapRatio, paddingH, paddingV,
    });

    setTileSize(prev => (prev.w === r.tileW ? prev : { w: r.tileW, h: r.tileH }));
    setNeedsScroll(prev => (prev === r.overflow ? prev : r.overflow));
  }, [sizeTick, boardKey, maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV, isRack]);

  return [containerRef as React.RefObject<HTMLDivElement>, tileSize, needsScroll];
}
