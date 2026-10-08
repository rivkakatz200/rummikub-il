import React, { useState } from 'react';
import { Tile } from '../types/rummikub';
import { TileView, FaceDownTile } from './TileView';
import { sortRackByNumbers, sortRackByRuns, validateSet } from '../utils/rummikubRules';
import { Sparkles, ArrowUpDown, Plus, CheckCircle2, X } from 'lucide-react';
import { playTileClick, playTilePlace } from '../utils/audio';
import { useFitTileSize } from '../hooks/useFitTileSize';

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

  // The rack container ref + auto-fit tile size
  // We give the rack a slightly larger max tile than the board for easier touch
  const [rackRef, tileSize] = useFitTileSize({
    tileCount: rack.length,
    maxTileW: 46,
    minTileW: 24,
    gapRatio: 0.12,
    paddingH: 16,
    // Controls bar ~28px + groove padding
    paddingV: 36,
  });

  const { w: tW, h: tH } = tileSize;
  const tileGap = Math.max(2, Math.round(tW * 0.12));

  const handleSortNumbers = () => { playTileClick(); onUpdateRack(sortRackByNumbers(rack)); };
  const handleSortRuns = () => { playTileClick(); onUpdateRack(sortRackByRuns(rack)); };

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
    setMultiSelectedIds((prev) =>
      prev.includes(tile.id) ? prev.filter((id) => id !== tile.id) : [...prev, tile.id]
    );
    onTileSelect(tile, 'rack', undefined, index);
  };

  const handleClearSelection = () => { playTileClick(); setMultiSelectedIds([]); };

  const selectedTiles = rack.filter((t) => multiSelectedIds.includes(t.id));
  const multiValidation = selectedTiles.length >= 3 ? validateSet(selectedTiles) : null;

  const handlePlaySelected = () => {
    playTilePlace();
    if (selectedTiles.length > 0) {
      onPlaySelectedTilesToNewSet ? onPlaySelectedTilesToNewSet(selectedTiles) : onPlaySelectedTileToNewSet();
      setMultiSelectedIds([]);
    } else {
      onPlaySelectedTileToNewSet();
    }
  };

  const renderTile = (tile: Tile, idx: number) => {
    const isSelected =
      multiSelectedIds.includes(tile.id) ||
      (selectedTile?.source === 'rack' && selectedTile.tile.id === tile.id);
    const isDropTarget = dragOverIndex === idx;
    // Placeholder tile from optimistic draw — show as face-down until real tile arrives
    const isPlaceholder = tile.id.startsWith('drawing_placeholder_');

    return (
      <div
        key={tile.id}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(idx); }}
        onDragLeave={() => { if (dragOverIndex === idx) setDragOverIndex(null); }}
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
        className={`transition-all duration-150 relative${isDropTarget ? ' scale-105' : ''}`}
        style={isDropTarget ? { borderRight: `2px solid #fbbf24`, paddingRight: 2 } : undefined}
      >
        {isPlaceholder ? (
          <FaceDownTile tileW={tW} tileH={tH} />
        ) : (
          <TileView
            tile={tile}
            tileW={tW}
            tileH={tH}
            isSelected={isSelected}
            onClick={() => { playTileClick(); handleToggleTileSelection(tile, idx); }}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                'application/json',
                JSON.stringify({ tile, source: 'rack', fromIndex: idx })
              );
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={rackRef}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={(e) => { setDragOverIndex(null); onDropOnRack(e); }}
      className="w-full player-rack-shelf px-2 pt-1.5 pb-2 flex flex-col gap-1 rounded-2xl shadow-2xl relative shrink-0"
    >
      {/* Controls bar */}
      <div className="flex items-center justify-between px-1 min-h-[24px] flex-wrap gap-1" style={{ fontSize: 11 }}>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-amber-100 font-['Rubik']" style={{ fontSize: 12 }}>המעמד שלך</span>
          <span className="px-1.5 py-0.5 rounded-full bg-stone-900/80 border border-amber-500/30 text-amber-300 font-bold font-mono" style={{ fontSize: 10 }}>
            {rack.length} אריחים
          </span>

          {isMyTurn && (multiSelectedIds.length > 0 || (selectedTile && selectedTile.source === 'rack')) && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePlaySelected}
                className={`px-2 py-0.5 rounded-lg font-black flex items-center gap-1 shadow transition active:scale-95 ${
                  multiValidation?.valid
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-stone-950 animate-pulse'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                }`}
                style={{ fontSize: 11 }}
                title="הורד את האריחים הנבחרים כסדרה לשולחן"
              >
                {multiValidation?.valid ? (
                  <><CheckCircle2 className="w-3 h-3 stroke-[2.5]" /><span>הורד ({multiValidation.points} נק׳ ✓)</span></>
                ) : (
                  <><Plus className="w-3 h-3 stroke-[3]" /><span>{selectedTiles.length > 1 ? `הורד ${selectedTiles.length}` : 'הורד'}</span></>
                )}
              </button>
              {multiSelectedIds.length > 0 && (
                <button onClick={handleClearSelection} className="p-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleSortNumbers}
            className="px-1.5 py-0.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-0.5 transition shadow"
            style={{ fontSize: 10 }}
            title="סדר לפי קבוצות של מספרים זהים (777)"
          >
            <ArrowUpDown className="w-2.5 h-2.5" /><span>777</span>
          </button>
          <button
            onClick={handleSortRuns}
            className="px-1.5 py-0.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-0.5 transition shadow"
            style={{ fontSize: 10 }}
            title="סדר לפי רצפים עוקבים באותו צבע (789)"
          >
            <Sparkles className="w-2.5 h-2.5" /><span>789</span>
          </button>
        </div>
      </div>

      {/* Tile groove — wraps tiles, no scroll */}
      <div
        className="player-rack-groove px-2 py-1 flex flex-wrap"
        style={{ gap: tileGap, minHeight: tH + tileGap * 2 }}
      >
        {rack.map((tile, idx) => renderTile(tile, idx))}
      </div>
    </div>
  );
};
