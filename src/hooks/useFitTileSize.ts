import { useEffect, useRef, useState, useCallback } from 'react';
import { TileSet } from '../types/rummikub';

export interface TileSize {
  w: number; // px
  h: number; // px
}

// ─── Tunable constants ────────────────────────────────────────────────────────
const MAX_ROWS_NORMAL = 3; // tablets, desktop, tall phones
const MAX_ROWS_SMALL  = 2; // narrow/short/landscape phones

// Tile aspect ratio: width / height  (~w-8 h-11)
const TILE_ASPECT = 0.72;

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

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Returns { rows, totalH } for a given tile width on the board. */
function boardLayout(
  containerW: number,
  sets: TileSet[],
  tileW: number,
  gapRatio: number,
  meldGapRatio: number,
  paddingH: number,
): { rows: number; totalH: number } {
  const tileH      = tileW / TILE_ASPECT;
  const tileGap    = Math.max(2, tileW * gapRatio);
  const meldGap    = Math.max(4, tileW * meldGapRatio);
  const meldHeaderH = Math.max(10, tileW * 0.45);
  const meldPadV   = Math.max(4, tileW * 0.18);
  const meldPadH   = Math.max(4, tileW * 0.18);
  const availW     = containerW - paddingH;

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

/** Returns { rows, totalH } for a given tile width in the rack. */
function rackLayout(
  containerW: number,
  tileCount: number,
  tileW: number,
  gapRatio: number,
  paddingH: number,
): { rows: number; totalH: number } {
  if (tileCount === 0) return { rows: 0, totalH: 0 };
  const tileH        = tileW / TILE_ASPECT;
  const gap          = Math.max(2, tileW * gapRatio);
  const availW       = containerW - paddingH;
  const tilesPerRow  = Math.max(1, Math.floor((availW + gap) / (tileW + gap)));
  const rows         = Math.ceil(tileCount / tilesPerRow);
  const totalH       = rows * tileH + (rows - 1) * gap;
  return { rows, totalH };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns [containerRef, tileSize, needsScroll].
 *
 * Board mode:
 *   Binary-searches the largest tileW where ALL melds fit within the visible
 *   container height AND the row count ≤ maxRows.
 *   If even minTileW exceeds the row cap, uses minTileW and sets needsScroll=true.
 *
 * Rack mode:
 *   Binary-searches the largest tileW where all tiles fit in the container height.
 *   needsScroll is always false for the rack (it wraps to more rows instead).
 */
export function useFitTileSize(
  opts: FitOptions,
): [React.RefObject<HTMLDivElement | null>, TileSize, boolean] {
  const containerRef = useRef<HTMLDivElement>(null);

  const isRack = opts.mode === 'rack';

  const defaults = {
    maxTileW:     isRack ? 46 : 50,
    minTileW:     isRack ? 24 : 22,
    gapRatio:     0.10,
    meldGapRatio: 0.35,
    paddingH:     20,
    paddingV:     isRack ? 36 : 48,
  };

  const maxTileW     = opts.maxTileW     ?? defaults.maxTileW;
  const minTileW     = opts.minTileW     ?? defaults.minTileW;
  const gapRatio     = opts.gapRatio     ?? defaults.gapRatio;
  const meldGapRatio = !isRack ? ((opts as BoardOptions).meldGapRatio ?? defaults.meldGapRatio) : 0;
  const paddingH     = opts.paddingH     ?? defaults.paddingH;
  const paddingV     = opts.paddingV     ?? defaults.paddingV;

  const [tileSize,    setTileSize]    = useState<TileSize>({ w: maxTileW, h: maxTileW / TILE_ASPECT });
  const [needsScroll, setNeedsScroll] = useState(false);

  const recompute = useCallback(
    (containerW: number, containerH: number) => {
      if (containerW <= 0 || containerH <= 0) return;

      if (isRack) {
        // ── Rack: fit all tiles vertically, no row cap ──────────────────────
        const { tileCount } = opts as RackOptions;
        const availH = containerH - paddingV;

        let lo = minTileW, hi = maxTileW, best = minTileW;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const { totalH } = rackLayout(containerW, tileCount, mid, gapRatio, paddingH);
          if (totalH <= availH) { best = mid; lo = mid + 1; }
          else                  { hi = mid - 1; }
        }
        setNeedsScroll(false);
        setTileSize({ w: best, h: Math.round(best / TILE_ASPECT) });
        return;
      }

      // ── Board: shrink-first, then scroll ───────────────────────────────────
      const { sets } = opts as BoardOptions;
      if (!sets || sets.length === 0) {
        setNeedsScroll(false);
        setTileSize({ w: maxTileW, h: Math.round(maxTileW / TILE_ASPECT) });
        return;
      }

      // Determine row cap based on viewport size
      const isSmallScreen = window.innerWidth < 480 || window.innerHeight < 700;
      const maxRows = isSmallScreen ? MAX_ROWS_SMALL : MAX_ROWS_NORMAL;
      const availH  = containerH - paddingV;

      // Find the largest tileW that satisfies BOTH:
      //   (a) totalH ≤ availH  (fits vertically)
      //   (b) rows   ≤ maxRows (within row cap)
      let lo = minTileW, hi = maxTileW, best = -1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const { rows, totalH } = boardLayout(containerW, sets, mid, gapRatio, meldGapRatio, paddingH);
        if (totalH <= availH && rows <= maxRows) { best = mid; lo = mid + 1; }
        else                                     { hi = mid - 1; }
      }

      if (best >= minTileW) {
        // A fitting size was found — no scroll needed
        setNeedsScroll(false);
        setTileSize({ w: best, h: Math.round(best / TILE_ASPECT) });
      } else {
        // No size satisfies the row cap — use minTileW and scroll
        setNeedsScroll(true);
        setTileSize({ w: minTileW, h: Math.round(minTileW / TILE_ASPECT) });
      }
    },
    // opts is an object — depend on its stable primitive fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isRack,
      isRack ? (opts as RackOptions).tileCount : JSON.stringify((opts as BoardOptions).sets?.map(s => s.id + s.tiles.length)),
      maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV,
    ],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      recompute(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    recompute(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [recompute]);

  return [containerRef as React.RefObject<HTMLDivElement>, tileSize, needsScroll];
}
