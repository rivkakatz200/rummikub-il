import React from 'react';
import { Tile, TileColor } from '../types/rummikub';
import { Smile } from 'lucide-react';

interface TileViewProps {
  tile: Tile;
  isSelected?: boolean;
  isDragOver?: boolean;
  isHighlighted?: boolean;  // opponent's last-placed tile highlight
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  /** Dynamic pixel size from useFitTileSize. Overrides `size` when provided. */
  tileW?: number;
  tileH?: number;
  size?: 'sm' | 'md' | 'lg';
  showPoints?: boolean;
}

const COLOR_CLASSES: Record<TileColor, { text: string; bgSoft: string; border: string }> = {
  black: { text: 'text-zinc-950 font-black', bgSoft: 'bg-zinc-100', border: 'border-zinc-800' },
  blue:  { text: 'text-blue-700 font-black',  bgSoft: 'bg-blue-50',  border: 'border-blue-700' },
  red:   { text: 'text-red-600 font-black',   bgSoft: 'bg-red-50',   border: 'border-red-600'  },
  yellow:{ text: 'text-amber-600 font-black', bgSoft: 'bg-amber-50', border: 'border-amber-600'},
};

// Fallback static sizes (used when tileW/tileH not provided)
const STATIC_SIZE: Record<string, { w: number; h: number }> = {
  sm: { w: 28, h: 40 },
  md: { w: 34, h: 48 },
  lg: { w: 44, h: 60 },
};

export const TileView: React.FC<TileViewProps> = ({
  tile,
  isSelected = false,
  isDragOver = false,
  isHighlighted = false,
  onClick,
  onDragStart,
  tileW: propW,
  tileH: propH,
  size = 'md',
  showPoints = false,
}) => {
  const colorMeta = COLOR_CLASSES[tile.color] || COLOR_CLASSES.black;
  const fallback = STATIC_SIZE[size];
  const w = propW ?? fallback.w;
  const h = propH ?? fallback.h;

  // Scale font and icon relative to tile width
  const numFontSize = Math.max(8, Math.round(w * 0.52));
  const jokerIconSize = Math.max(10, Math.round(w * 0.55));
  const jokerLabelSize = Math.max(6, Math.round(w * 0.28));
  const dotSize = Math.max(4, Math.round(w * 0.14));
  const underlineW = Math.max(8, Math.round(w * 0.45));

  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ width: w, height: h, transition: 'width 0.15s ease, height 0.15s ease', touchAction: 'none' }}
      className={`rummi-tile flex flex-col items-center justify-between py-[3px] px-[2px] select-none cursor-pointer relative shrink-0${
        isSelected ? ' selected' : ''
      }${isDragOver ? ' drag-over' : ''
      }${isHighlighted ? ' highlighted-tile' : ''}`}
      title={tile.isJoker ? "ג'וקר (מחליף כל אריח)" : `${tile.number} (${getColorHebrew(tile.color)})`}
    >
      {/* Top dot */}
      <div className="w-full flex items-center justify-between px-[2px]" style={{ opacity: 0.6 }}>
        <span
          className={`rounded-full ${tile.isJoker ? 'bg-gradient-to-r from-red-500 via-amber-400 to-blue-500' : getBgColorClass(tile.color)}`}
          style={{ width: dotSize, height: dotSize, display: 'inline-block' }}
        />
        {tile.isJoker && <span style={{ fontSize: 7, fontWeight: 700, color: '#ef4444' }}>★</span>}
      </div>

      {/* Main content */}
      {tile.isJoker ? (
        <div className="flex flex-col items-center justify-center my-auto">
          <div className="relative">
            <Smile
              style={{ width: jokerIconSize, height: jokerIconSize }}
              className="text-amber-500 fill-amber-300 stroke-[2.2]"
            />
            <div
              className="absolute rounded-full bg-red-500 border border-white"
              style={{ width: dotSize + 2, height: dotSize + 2, top: -2, right: -2 }}
            />
            <div
              className="absolute rounded-full bg-blue-600 border border-white"
              style={{ width: dotSize + 2, height: dotSize + 2, top: -2, left: -2 }}
            />
          </div>
          <span
            className="font-black text-amber-700 tracking-tighter leading-none mt-0.5"
            style={{ fontSize: jokerLabelSize }}
          >
            ג׳וקר
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center my-auto">
          <span
            className={`${colorMeta.text} tracking-tight leading-none drop-shadow-sm font-['Rubik',sans-serif]`}
            style={{ fontSize: numFontSize }}
          >
            {tile.number}
          </span>
          {(tile.number === 6 || tile.number === 9) && (
            <span
              className={`rounded-full mt-0.5 ${getBgColorClass(tile.color)}`}
              style={{ width: underlineW, height: 2, display: 'inline-block' }}
            />
          )}
        </div>
      )}

      {/* Bottom points */}
      <div className="w-full flex items-center justify-center" style={{ fontSize: 7, color: '#a8a29e' }}>
        {showPoints && <span style={{ opacity: 0.8 }}>{tile.isJoker ? '30' : tile.number}</span>}
      </div>

      {/* Glossy bevel */}
      <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/70 to-transparent rounded-t-[5px] pointer-events-none" />
    </div>
  );
};

export const FaceDownTile: React.FC<{ size?: 'sm' | 'md'; tileW?: number; tileH?: number }> = ({
  size = 'md',
  tileW,
  tileH,
}) => {
  const fallback = STATIC_SIZE[size];
  const w = tileW ?? fallback.w;
  const h = tileH ?? fallback.h;
  return (
    <div
      className="rummi-tile-back shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{ width: w, height: h }}
    >
      <div className="w-3 h-3 rounded-full border border-amber-500/20 flex items-center justify-center">
        <div className="w-1 h-1 rounded-full bg-amber-500/40" />
      </div>
    </div>
  );
};

function getColorHebrew(color: TileColor): string {
  switch (color) {
    case 'black':  return 'שחור';
    case 'blue':   return 'כחול';
    case 'red':    return 'אדום';
    case 'yellow': return 'צהוב';
  }
}

function getBgColorClass(color: TileColor): string {
  switch (color) {
    case 'black':  return 'bg-zinc-900';
    case 'blue':   return 'bg-blue-600';
    case 'red':    return 'bg-red-600';
    case 'yellow': return 'bg-amber-500';
  }
}
