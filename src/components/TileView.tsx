import React from 'react';
import { Tile, TileColor } from '../types/rummikub';
import { Smile } from 'lucide-react';

interface TileViewProps {
  tile: Tile;
  isSelected?: boolean;
  isDragOver?: boolean;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  showPoints?: boolean;
}

const COLOR_CLASSES: Record<TileColor, { text: string; bgSoft: string; border: string }> = {
  black: {
    text: 'text-zinc-950 font-black',
    bgSoft: 'bg-zinc-100',
    border: 'border-zinc-800',
  },
  blue: {
    text: 'text-blue-700 font-black',
    bgSoft: 'bg-blue-50',
    border: 'border-blue-700',
  },
  red: {
    text: 'text-red-600 font-black',
    bgSoft: 'bg-red-50',
    border: 'border-red-600',
  },
  yellow: {
    text: 'text-amber-600 font-black',
    bgSoft: 'bg-amber-50',
    border: 'border-amber-600',
  },
};

export const TileView: React.FC<TileViewProps> = ({
  tile,
  isSelected = false,
  isDragOver = false,
  onClick,
  onDragStart,
  size = 'md',
  showPoints = false,
}) => {
  const colorMeta = COLOR_CLASSES[tile.color] || COLOR_CLASSES.black;

  // Size styling optimized for single-screen view
  const sizeClasses = {
    sm: 'w-7 h-10 text-xs sm:w-8 sm:h-11 sm:text-sm',
    md: 'w-8.5 h-12 text-sm sm:w-9.5 sm:h-13 sm:text-base',
    lg: 'w-11 h-15 text-base sm:w-12 sm:h-17 sm:text-xl',
  }[size];

  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`rummi-tile flex flex-col items-center justify-between py-1 px-1 select-none cursor-pointer relative shrink-0 ${sizeClasses} ${
        isSelected ? 'selected' : ''
      } ${isDragOver ? 'drag-over' : ''}`}
      title={tile.isJoker ? "ג'וקר (מחליף כל אריח)" : `${tile.number} (${getColorHebrew(tile.color)})`}
    >
      {/* Top micro symbol / dot */}
      <div className="w-full flex items-center justify-between px-0.5 text-[9px] opacity-60">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            tile.isJoker
              ? 'bg-gradient-to-r from-red-500 via-amber-400 to-blue-500'
              : getBgColorClass(tile.color)
          }`}
        />
        {tile.isJoker && <span className="text-[8px] font-bold text-red-500">★</span>}
      </div>

      {/* Main tile content */}
      {tile.isJoker ? (
        <div className="flex flex-col items-center justify-center my-auto">
          <div className="relative">
            <Smile className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500 fill-amber-300 stroke-[2.2]" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-blue-600 border border-white" />
          </div>
          <span className="text-[9px] sm:text-[10px] font-black text-amber-700 tracking-tighter leading-none mt-0.5">
            ג׳וקר
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center my-auto">
          <span
            className={`${colorMeta.text} tracking-tight leading-none drop-shadow-sm font-['Rubik',sans-serif]`}
          >
            {tile.number}
          </span>
          {/* Subtle colored underline distinguishing 6 and 9 like physical rummikub */}
          {(tile.number === 6 || tile.number === 9) && (
            <span className={`w-3.5 h-[2px] mt-0.5 rounded-full ${getBgColorClass(tile.color)}`} />
          )}
        </div>
      )}

      {/* Bottom label or points value */}
      <div className="w-full flex items-center justify-center text-[8px] text-stone-400 font-medium">
        {showPoints && (
          <span className="opacity-80">
            {tile.isJoker ? '30' : tile.number}
          </span>
        )}
      </div>

      {/* Glossy top bevel highlight */}
      <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/70 to-transparent rounded-t-[5px] pointer-events-none" />
    </div>
  );
};

export const FaceDownTile: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'w-6 h-10' : 'w-7 h-11 sm:w-8 sm:h-12';
  return (
    <div
      className={`rummi-tile-back ${sizeClasses} shrink-0 flex items-center justify-center relative overflow-hidden`}
    >
      <div className="w-3 h-3 rounded-full border border-amber-500/20 flex items-center justify-center">
        <div className="w-1 h-1 rounded-full bg-amber-500/40" />
      </div>
    </div>
  );
};

function getColorHebrew(color: TileColor): string {
  switch (color) {
    case 'black':
      return 'שחור';
    case 'blue':
      return 'כחול';
    case 'red':
      return 'אדום';
    case 'yellow':
      return 'צהוב';
  }
}

function getBgColorClass(color: TileColor): string {
  switch (color) {
    case 'black':
      return 'bg-zinc-900';
    case 'blue':
      return 'bg-blue-600';
    case 'red':
      return 'bg-red-600';
    case 'yellow':
      return 'bg-amber-500';
  }
}
