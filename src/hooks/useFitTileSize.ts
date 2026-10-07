import { useEffect, useRef, useState, useCallback } from 'react';
import { TileSet } from '../types/rummikub';

export interface TileSize {
  w: number; // px
  h: number; // px
}

// Tile aspect ratio: width / height
const TILE_ASPECT = 0.72; // ~w-8 h-11 ratio

interface Options {
  /** Melds on the board (for board sizing) or tile count (for rack sizing) */
  sets?: TileSet[];
  /** For rack mode: total tile count */
  tileCount?: number;
  maxTileW?: number;
  minTileW?: number;
  /** Gap between tiles within a meld (px, scales with tile) */
  gapRatio?: number;
  /** Gap between melds (px, scales with tile) */
  meldGapRatio?: number;
  /** Extra padding inside the container (px total horizontal + vertical) */
  paddingH?: number;
  paddingV?: number;
}

function computeBoardFit(
  containerW: number,
  containerH: number,
  sets: TileSet[],
  tileW: number,
  gapRatio: number,
  meldGapRatio: number,
  paddingH: number,
  paddingV: number
): boolean {
  const tileH = tileW / TILE_ASPECT;
  const tileGap = Math.max(2, tileW * gapRatio);
  const meldGap = Math.max(4, tileW * meldGapRatio);
  // Each meld header ~14px (shrinks with tile)
  const meldHeaderH = Math.max(10, tileW * 0.45);
  const meldPadV = Math.max(4, tileW * 0.18);
  const meldPadH = Math.max(4, tileW * 0.18);

  const availW = containerW - paddingH;
  const availH = containerH - paddingV;

  let rowX = 0;
  let rowH = 0;
  let totalH = 0;

  for (const set of sets) {
    const n = Math.max(1, set.tiles.length);
    // Meld width: tiles + gaps + padding + drop-zone slivers (2px each side)
    const meldW = n * tileW + (n - 1) * tileGap + meldPadH * 2 + 4;
    const meldH = tileH + meldHeaderH + meldPadV * 2;

    if (rowX > 0 && rowX + meldGap + meldW > availW) {
      // wrap
      totalH += rowH + meldGap;
      rowX = 0;
      rowH = 0;
    }
    rowX += (rowX > 0 ? meldGap : 0) + meldW;
    rowH = Math.max(rowH, meldH);
  }
  totalH += rowH;

  return totalH <= availH;
}

function computeRackFit(
  containerW: number,
  containerH: number,
  tileCount: number,
  tileW: number,
  gapRatio: number,
  paddingH: number,
  paddingV: number
): boolean {
  if (tileCount === 0) return true;
  const tileH = tileW / TILE_ASPECT;
  const gap = Math.max(2, tileW * gapRatio);
  const availW = containerW - paddingH;
  const availH = containerH - paddingV;
  const tilesPerRow = Math.max(1, Math.floor((availW + gap) / (tileW + gap)));
  const rows = Math.ceil(tileCount / tilesPerRow);
  const totalH = rows * tileH + (rows - 1) * gap;
  return totalH <= availH;
}

export function useFitTileSize(opts: Options): [React.RefObject<HTMLDivElement | null>, TileSize, boolean] {
  const {
    sets,
    tileCount,
    maxTileW = 52,
    minTileW = 22,
    gapRatio = 0.1,
    meldGapRatio = 0.35,
    paddingH = 16,
    paddingV = 16,
  } = opts;

  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState<TileSize>({ w: maxTileW, h: maxTileW / TILE_ASPECT });
  const [isOverflow, setIsOverflow] = useState(false);

  const recompute = useCallback(
    (containerW: number, containerH: number) => {
      if (containerW <= 0 || containerH <= 0) return;

      let lo = minTileW;
      let hi = maxTileW;
      let best = minTileW;

      const fits = (w: number) => {
        if (sets && sets.length > 0) {
          return computeBoardFit(containerW, containerH, sets, w, gapRatio, meldGapRatio, paddingH, paddingV);
        }
        if (tileCount !== undefined) {
          return computeRackFit(containerW, containerH, tileCount, w, gapRatio, paddingH, paddingV);
        }
        return true;
      };

      // Binary search for largest fitting tile width
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      const overflow = !fits(minTileW);
      setIsOverflow(overflow);
      const finalW = overflow ? minTileW : best;
      setTileSize({ w: finalW, h: Math.round(finalW / TILE_ASPECT) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, tileCount, maxTileW, minTileW, gapRatio, meldGapRatio, paddingH, paddingV]
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

  return [containerRef as React.RefObject<HTMLDivElement>, tileSize, isOverflow];
}
