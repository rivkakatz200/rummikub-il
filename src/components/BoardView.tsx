import React, { useState } from 'react';
import { Tile, TileSet } from '../types/rummikub';
import { TileView, FaceDownTile } from './TileView';
import { validateSet } from '../utils/rummikubRules';
import { Plus, Check, AlertTriangle, Layers, Undo2, Sparkles } from 'lucide-react';
import { playTileClick, playTilePlace } from '../utils/audio';

interface BoardViewProps {
  board: TileSet[];
  isMyTurn: boolean;
  poolCount: number;
  selectedTile: { tile: Tile; source: 'rack' | 'board'; fromSetId?: string; fromIndex?: number } | null;
  onTileSelect: (tile: Tile, source: 'rack' | 'board', fromSetId?: string, fromIndex?: number) => void;
  onMoveTileToSet: (targetSetId: string, insertIndex?: number) => void;
  onCreateNewSetWithTile: (tile?: Tile) => void;
  onSplitSet: (setId: string, atIndex: number) => void;
  onDropTile: (e: React.DragEvent, targetSetId?: string, targetIndex?: number) => void;
  onDrawTileFromPool: () => void;
  onReturnSetToRack?: (setId: string) => void;
  onAutoMergeSets?: () => void;
}

export const BoardView: React.FC<BoardViewProps> = ({
  board,
  isMyTurn,
  poolCount,
  selectedTile,
  onTileSelect,
  onMoveTileToSet,
  onCreateNewSetWithTile,
  onDropTile,
  onDrawTileFromPool,
  onReturnSetToRack,
  onAutoMergeSets,
}) => {
  const [dropIndicator, setDropIndicator] = useState<{ setId: string; index: number } | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div
      className="rummikub-table flex-1 w-full rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between overflow-y-auto min-h-0 border-4 border-[#3a1b05] shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)] relative select-none"
      onDragOver={handleDragOver}
      onDrop={(e) => {
        setDropIndicator(null);
        onDropTile(e);
      }}
    >
      {/* Table Center Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-5">
        <div className="flex flex-col items-center">
          <span className="text-7xl sm:text-8xl font-black font-['Fredoka',sans-serif] tracking-wider text-amber-100">
            רומיקוב
          </span>
          <span className="text-sm sm:text-base font-bold tracking-widest text-amber-200">
            ISRAELI RUMMIKUB
          </span>
        </div>
      </div>

      {/* Top Table Area with Visual Tile Pool (הקופה) and Table Actions */}
      <div className="flex items-center justify-between z-10 w-full mb-1">
        {/* Visual 3D Tile Pool (הקופה) Directly on the Table Felt (Requirement 1) */}
        <div
          onClick={() => {
            if (isMyTurn && poolCount > 0) {
              onDrawTileFromPool();
            }
          }}
          className={`flex items-center gap-2 p-1.5 px-2.5 rounded-xl border transition-all duration-200 ${
            isMyTurn && poolCount > 0
              ? 'bg-amber-950/40 border-amber-500/60 hover:border-amber-400 hover:scale-105 cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'bg-black/30 border-stone-800 opacity-90'
          }`}
          title={isMyTurn ? 'לחץ על הקופה לשליפת אריח מהקופה וסיום התור' : 'קופת המשחק'}
        >
          {/* Staggered 3D Tile Stack */}
          <div className="relative w-8 h-10 flex items-center justify-center">
            <div className="absolute top-1 right-1 opacity-70 transform rotate-6">
              <FaceDownTile size="sm" />
            </div>
            <div className="absolute top-0.5 right-0.5 opacity-85 transform -rotate-3">
              <FaceDownTile size="sm" />
            </div>
            <div className="relative shadow-md">
              <FaceDownTile size="sm" />
            </div>
          </div>

          <div className="flex flex-col text-right">
            <div className="flex items-center gap-1 font-bold text-xs text-amber-200 font-['Rubik']">
              <span>הקופה</span>
              {isMyTurn && poolCount > 0 && (
                <span className="text-[10px] text-amber-400 animate-pulse font-normal">
                  (שלוף)
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-stone-300">
              {poolCount} אריחים
            </span>
          </div>
        </div>

        {/* Table Actions */}
        <div className="flex items-center gap-1.5">
          {/* Auto-merge button */}
          {isMyTurn && board.length >= 2 && onAutoMergeSets && (
            <button
              onClick={() => {
                playTilePlace();
                onAutoMergeSets();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-stone-900/90 hover:bg-stone-800 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1 shadow transition active:scale-95"
              title="חבר אריחים מפוזרים על השולחן לסדרות חוקיות"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">אחד סדרות חוקיות</span>
              <span className="sm:hidden">אחד סדרות</span>
            </button>
          )}

          {/* Plus button to start new set */}
          {isMyTurn && (
            <button
              onClick={() => {
                playTilePlace();
                onCreateNewSetWithTile();
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center gap-1.5 shadow-lg transition transform hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>סדרה חדשה</span>
            </button>
          )}
        </div>
      </div>

      {/* Sets Grid Area */}
      {board.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 my-auto z-10">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2 shadow-lg">
            <Layers className="w-6 h-6 opacity-80" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-amber-100 mb-0.5">
            שולחן המשחק ריק
          </h3>
          <p className="text-xs text-stone-300 max-w-sm mb-3">
            {isMyTurn
              ? 'זהו תורך! בחר אריחים במעמד ולחץ "הורד כסדרה חדשה" או גרור לשולחן.'
              : 'ממתינים לתור הראשון שיוריד סדרות לשולחן...'}
          </p>
        </div>
      ) : (
        <div className="flex-1 z-10 flex flex-wrap content-start gap-2.5 sm:gap-3 p-1 overflow-y-auto">
          {board.map((set) => {
            const validation = validateSet(set.tiles);
            return (
              <div
                key={set.id}
                onDragOver={handleDragOver}
                onDrop={(e) => {
                  e.stopPropagation();
                  setDropIndicator(null);
                  onDropTile(e, set.id, set.tiles.length);
                }}
                className={`flex flex-col p-1.5 sm:p-2 rounded-xl transition-all duration-200 backdrop-blur-sm ${
                  validation.valid
                    ? 'bg-black/40 border border-emerald-500/40 hover:border-emerald-400/70 shadow-md'
                    : 'bg-red-950/30 border-2 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                }`}
              >
                {/* Set Header with status & points & return button */}
                <div className="flex items-center justify-between gap-1 mb-1 px-1 text-[10px]">
                  <div className="flex items-center gap-1">
                    {validation.valid ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-400">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>
                          {validation.type === 'group' ? 'קבוצה' : 'רצף'} ({validation.points} נק׳)
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-bold text-red-400" title={validation.error}>
                        <AlertTriangle className="w-3 h-3" />
                        <span>{validation.error || 'סדרה לא חוקית'}</span>
                      </span>
                    )}
                  </div>

                  {/* Return incomplete set to player rack */}
                  {isMyTurn && onReturnSetToRack && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTileClick();
                        onReturnSetToRack(set.id);
                      }}
                      className="px-1.5 py-0.5 rounded bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white text-[9px] font-bold flex items-center gap-0.5 border border-stone-700 transition active:scale-95"
                      title="החזר את אריחי הסדרה הזו למעמד שלך"
                    >
                      <Undo2 className="w-2.5 h-2.5 text-amber-400" />
                      <span>החזר למעמד</span>
                    </button>
                  )}
                </div>

                {/* Tiles Row with Drag & Drop between sets (Requirement 7) */}
                <div className="flex items-center gap-1 flex-wrap min-h-[50px] p-1 bg-black/25 rounded-lg border border-white/5 relative">
                  {/* Drop zone at the very start of the set */}
                  {isMyTurn && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropIndicator({ setId: set.id, index: 0 });
                      }}
                      onDragLeave={() => setDropIndicator(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropIndicator(null);
                        onDropTile(e, set.id, 0);
                      }}
                      className={`h-11 w-1.5 rounded transition-all duration-150 ${
                        dropIndicator?.setId === set.id && dropIndicator?.index === 0
                          ? 'bg-amber-400 w-3 shadow-lg'
                          : 'bg-transparent hover:bg-amber-400/40'
                      }`}
                    />
                  )}

                  {set.tiles.map((tile, idx) => {
                    const isSelected =
                      selectedTile?.source === 'board' &&
                      selectedTile.fromSetId === set.id &&
                      selectedTile.tile.id === tile.id;

                    const isDropTargetNext =
                      dropIndicator?.setId === set.id && dropIndicator?.index === idx + 1;

                    return (
                      <React.Fragment key={tile.id}>
                        <div
                          className="relative"
                          onDragOver={handleDragOver}
                          onDrop={(e) => {
                            e.stopPropagation();
                            setDropIndicator(null);
                            onDropTile(e, set.id, idx);
                          }}
                        >
                          <TileView
                            tile={tile}
                            size="md"
                            isSelected={isSelected}
                            onClick={() => {
                              if (!isMyTurn) return;
                              playTileClick();
                              if (selectedTile) {
                                if (selectedTile.tile.id === tile.id) {
                                  onTileSelect(tile, 'board', set.id, idx);
                                } else {
                                  onMoveTileToSet(set.id, idx);
                                }
                              } else {
                                onTileSelect(tile, 'board', set.id, idx);
                              }
                            }}
                            onDragStart={
                              isMyTurn
                                ? (e) => {
                                    e.dataTransfer.setData(
                                      'application/json',
                                      JSON.stringify({
                                        tile,
                                        source: 'board',
                                        fromSetId: set.id,
                                        fromIndex: idx,
                                      })
                                    );
                                  }
                                : undefined
                            }
                          />
                        </div>

                        {/* Insertion Drop Zone between tiles for seamless set manipulation */}
                        {isMyTurn && (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropIndicator({ setId: set.id, index: idx + 1 });
                            }}
                            onDragLeave={() => setDropIndicator(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropIndicator(null);
                              onDropTile(e, set.id, idx + 1);
                            }}
                            className={`h-11 w-1.5 rounded transition-all duration-150 ${
                              isDropTargetNext
                                ? 'bg-amber-400 w-3 shadow-lg'
                                : 'bg-transparent hover:bg-amber-400/40'
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Add button at the end of set if tile selected */}
                  {isMyTurn && selectedTile && (
                    <button
                      onClick={() => {
                        playTilePlace();
                        onMoveTileToSet(set.id, set.tiles.length);
                      }}
                      className="h-12 px-2 rounded-md border-2 border-dashed border-amber-400/60 hover:border-amber-400 hover:bg-amber-400/20 text-amber-300 text-xs font-bold flex items-center justify-center transition"
                      title="הוסף אריח נבחר לסוף הסדרה"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
