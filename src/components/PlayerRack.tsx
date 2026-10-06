import React, { useState } from 'react';
import { Tile } from '../types/rummikub';
import { TileView } from './TileView';
import { sortRackByNumbers, sortRackByRuns, validateSet } from '../utils/rummikubRules';
import { Sparkles, ArrowUpDown, Plus, CheckCircle2, X } from 'lucide-react';
import { playTileClick, playTilePlace } from '../utils/audio';

interface PlayerRackProps {
  rack: Tile[];
  isMyTurn: boolean;
  selectedTile: { tile: Tile; source: 'rack' | 'board'; fromSetId?: string; fromIndex?: number } | null;
  onTileSelect: (tile: Tile, source: 'rack' | 'board', fromSetId?: string, fromIndex?: number) => void;
  onUpdateRack: (newRack: Tile[]) => void;
  onPlaySelectedTileToNewSet: () => void;
  onPlaySelectedTilesToNewSet?: (tiles: Tile[]) => void;
  onDropOnRack: (e: React.DragEvent, targetIndex?: number) => void;
}

export const PlayerRack: React.FC<PlayerRackProps> = ({
  rack,
  isMyTurn,
  selectedTile,
  onTileSelect,
  onUpdateRack,
  onPlaySelectedTileToNewSet,
  onPlaySelectedTilesToNewSet,
  onDropOnRack,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

  const handleSortNumbers = () => {
    playTileClick();
    onUpdateRack(sortRackByNumbers(rack));
  };

  const handleSortRuns = () => {
    playTileClick();
    onUpdateRack(sortRackByRuns(rack));
  };

  // Reorder tiles manually within the rack via Drag and Drop
  const handleTileReorder = (fromIndex: number, targetIndex: number) => {
    if (fromIndex === targetIndex || fromIndex < 0 || targetIndex < 0) return;
    const newRack = [...rack];
    const [moved] = newRack.splice(fromIndex, 1);
    if (!moved) return;
    newRack.splice(targetIndex, 0, moved);
    onUpdateRack(newRack);
    playTileClick();
  };

  const handleToggleTileSelection = (tile: Tile, index: number) => {
    setMultiSelectedIds((prev) => {
      const exists = prev.includes(tile.id);
      if (exists) {
        return prev.filter((id) => id !== tile.id);
      } else {
        return [...prev, tile.id];
      }
    });
    onTileSelect(tile, 'rack', undefined, index);
  };

  const handleClearSelection = () => {
    playTileClick();
    setMultiSelectedIds([]);
  };

  const selectedTiles = rack.filter((t) => multiSelectedIds.includes(t.id));
  const multiValidation = selectedTiles.length >= 3 ? validateSet(selectedTiles) : null;

  const handlePlaySelected = () => {
    playTilePlace();
    if (selectedTiles.length > 0) {
      if (onPlaySelectedTilesToNewSet) {
        onPlaySelectedTilesToNewSet(selectedTiles);
      } else {
        onPlaySelectedTileToNewSet();
      }
      setMultiSelectedIds([]);
    } else {
      onPlaySelectedTileToNewSet();
    }
  };

  // Divide into 2 rows for realistic 2-tier rack
  const splitPoint = Math.ceil(rack.length / 2);
  const topTier = rack.slice(0, splitPoint);
  const bottomTier = rack.slice(splitPoint);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        setDragOverIndex(null);
        onDropOnRack(e);
      }}
      className="w-full player-rack-shelf p-2 flex flex-col gap-1.5 rounded-2xl shadow-2xl relative shrink-0"
    >
      {/* Top Rack Controls Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-amber-200/90 min-h-6 flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs sm:text-sm text-amber-100 font-['Rubik']">
            המעמד שלך
          </span>
          <span className="px-2 py-0.5 rounded-full bg-stone-900/80 border border-amber-500/30 text-amber-300 font-bold font-mono text-[11px]">
            {rack.length} אריחים
          </span>

          {/* Multi-selection or Single selection action button */}
          {isMyTurn && (multiSelectedIds.length > 0 || (selectedTile && selectedTile.source === 'rack')) && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePlaySelected}
                className={`px-3 py-1 rounded-lg font-black text-xs flex items-center gap-1.5 shadow transition transform active:scale-95 ${
                  multiValidation?.valid
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-stone-950 font-black animate-pulse shadow-emerald-500/30'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                }`}
                title="הורד את האריחים הנבחרים כסדרה לשולחן"
              >
                {multiValidation?.valid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>הורד כסדרה חדשה ({multiValidation.points} נק׳ ✓)</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 stroke-[3]" />
                    <span>
                      {selectedTiles.length > 1
                        ? `הורד ${selectedTiles.length} אריחים לשולחן`
                        : 'הורד לשולחן'}
                    </span>
                  </>
                )}
              </button>

              {multiSelectedIds.length > 0 && (
                <button
                  onClick={handleClearSelection}
                  className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition"
                  title="בטל בחירה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sorting Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSortNumbers}
            className="px-2 py-0.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition shadow"
            title="סדר לפי קבוצות של מספרים זהים (777)"
          >
            <ArrowUpDown className="w-3 h-3" />
            <span>סדר 777</span>
          </button>
          <button
            onClick={handleSortRuns}
            className="px-2 py-0.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition shadow"
            title="סדר לפי רצפים עוקבים באותו צבע (789)"
          >
            <Sparkles className="w-3 h-3" />
            <span>סדר 789</span>
          </button>
        </div>
      </div>

      {/* Two Tiers of Physical Wooden Grooves */}
      <div className="flex flex-col gap-1">
        {/* Tier 1 (Upper shelf) */}
        <div className="player-rack-groove min-h-[50px] sm:min-h-[54px] px-2 py-1 flex items-center gap-1 overflow-x-auto">
          {topTier.map((tile, idx) => {
            const isSelected =
              multiSelectedIds.includes(tile.id) ||
              (selectedTile?.source === 'rack' && selectedTile.tile.id === tile.id);
            const isDropTarget = dragOverIndex === idx;

            return (
              <div
                key={tile.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(idx);
                }}
                onDragLeave={() => {
                  if (dragOverIndex === idx) setDragOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(null);

                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.source === 'rack' && typeof data.fromIndex === 'number') {
                      handleTileReorder(data.fromIndex, idx);
                    } else {
                      onDropOnRack(e, idx);
                    }
                  } catch {
                    onDropOnRack(e, idx);
                  }
                }}
                className={`transition-all duration-150 relative ${
                  isDropTarget ? 'border-r-2 border-amber-400 pr-1 scale-105' : ''
                }`}
              >
                <TileView
                  tile={tile}
                  isSelected={isSelected}
                  onClick={() => {
                    playTileClick();
                    handleToggleTileSelection(tile, idx);
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        tile,
                        source: 'rack',
                        fromIndex: idx,
                      })
                    );
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Tier 2 (Lower shelf) */}
        <div className="player-rack-groove min-h-[50px] sm:min-h-[54px] px-2 py-1 flex items-center gap-1 overflow-x-auto">
          {bottomTier.map((tile, idx) => {
            const realIdx = splitPoint + idx;
            const isSelected =
              multiSelectedIds.includes(tile.id) ||
              (selectedTile?.source === 'rack' && selectedTile.tile.id === tile.id);
            const isDropTarget = dragOverIndex === realIdx;

            return (
              <div
                key={tile.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(realIdx);
                }}
                onDragLeave={() => {
                  if (dragOverIndex === realIdx) setDragOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(null);

                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.source === 'rack' && typeof data.fromIndex === 'number') {
                      handleTileReorder(data.fromIndex, realIdx);
                    } else {
                      onDropOnRack(e, realIdx);
                    }
                  } catch {
                    onDropOnRack(e, realIdx);
                  }
                }}
                className={`transition-all duration-150 relative ${
                  isDropTarget ? 'border-r-2 border-amber-400 pr-1 scale-105' : ''
                }`}
              >
                <TileView
                  tile={tile}
                  isSelected={isSelected}
                  onClick={() => {
                    playTileClick();
                    handleToggleTileSelection(tile, realIdx);
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        tile,
                        source: 'rack',
                        fromIndex: realIdx,
                      })
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
