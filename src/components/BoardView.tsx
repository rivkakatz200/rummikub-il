import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Tile, TileSet } from '../types/rummikub';
import { TileView, FaceDownTile } from './TileView';
import { validateSet } from '../utils/rummikubRules';
import { Plus, Check, AlertTriangle, Layers, Undo2, Sparkles } from 'lucide-react';
import { playTileClick, playTilePlace } from '../utils/audio';
import { useFitTileSize } from '../hooks/useFitTileSize';

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

// How many px from the scroll edge triggers auto-scroll during drag
const AUTO_SCROLL_ZONE = 60;
// Max auto-scroll speed in px/frame
const AUTO_SCROLL_MAX_SPEED = 14;

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
  // Track the last-modified set to scroll it into view
  const [lastModifiedSetId, setLastModifiedSetId] = useState<string | null>(null);
  // ref to the INNER scroll element
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether a drag is in progress (suppress scroll-into-view during drag)
  const isDraggingRef = useRef(false);
  // Animation frame handle for auto-scroll
  const autoScrollRafRef = useRef<number | null>(null);
  // Last known pointer Y relative to the scroll container
  const pointerYRef = useRef<number>(0);

  // The OUTER container is what we measure for layout
  const [containerRef, tileSize, isOverflow] = useFitTileSize({
    sets: board,
    maxTileW: 50,
    minTileW: 22,
    gapRatio: 0.1,
    meldGapRatio: 0.35,
    paddingH: 20,
    // Reserve ~40px for the top toolbar inside the board
    paddingV: 48,
  });

  const { w: tW, h: tH } = tileSize;
  const tileGap = Math.max(2, Math.round(tW * 0.1));
  const meldGap = Math.max(4, Math.round(tW * 0.35));
  const dropZoneW = Math.max(4, Math.round(tW * 0.18));
  const meldPad = Math.max(4, Math.round(tW * 0.18));
  const headerFontSize = Math.max(9, Math.round(tW * 0.28));

  // ─── Auto-scroll during drag ──────────────────────────────────────────────
  const startAutoScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const tick = () => {
      const rect = scroll.getBoundingClientRect();
      const py = pointerYRef.current;
      const distFromTop = py - rect.top;
      const distFromBottom = rect.bottom - py;

      let speed = 0;
      if (distFromTop < AUTO_SCROLL_ZONE && distFromTop >= 0) {
        speed = -AUTO_SCROLL_MAX_SPEED * (1 - distFromTop / AUTO_SCROLL_ZONE);
      } else if (distFromBottom < AUTO_SCROLL_ZONE && distFromBottom >= 0) {
        speed = AUTO_SCROLL_MAX_SPEED * (1 - distFromBottom / AUTO_SCROLL_ZONE);
      }

      if (speed !== 0) {
        scroll.scrollTop += speed;
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Listen for dragover on the document to track pointer Y and drive auto-scroll
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      pointerYRef.current = e.clientY;
    };
    const handleDragEnd = () => {
      stopAutoScroll();
      isDraggingRef.current = false;
    };
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', handleDragEnd);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, [stopAutoScroll]);

  // ─── Scroll last-modified set into view ──────────────────────────────────
  useEffect(() => {
    if (!lastModifiedSetId || isDraggingRef.current) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const el = scroll.querySelector<HTMLElement>(`[data-set-id="${lastModifiedSetId}"]`);
    if (!el) return;
    // Small delay so the DOM has repainted
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    setLastModifiedSetId(null);
    return () => cancelAnimationFrame(id);
  }, [lastModifiedSetId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
    startAutoScroll();
  };

  // Wrap onDropTile so we can record the modified set and stop auto-scroll
  const handleDrop = (e: React.DragEvent, targetSetId?: string, targetIndex?: number) => {
    stopAutoScroll();
    isDraggingRef.current = false;
    setDropIndicator(null);
    onDropTile(e, targetSetId, targetIndex);
    if (targetSetId) {
      setLastModifiedSetId(targetSetId);
    }
  };


  return (
    // OUTER: fixed-size container measured by useFitTileSize
    <div
      ref={containerRef}
      className="rummikub-table flex-1 w-full rounded-2xl flex flex-col border-4 border-[#3a1b05] shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)] relative select-none overflow-hidden"
      style={{ padding: '8px 8px 6px' }}
    >
      {/* Watermark */}
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

      {/* Top toolbar — always visible, not scrolled */}
      <div className="flex items-center justify-between z-10 w-full shrink-0 mb-1" style={{ minHeight: 32 }}>
        {/* Pool */}
        <div
          onClick={() => { if (isMyTurn && poolCount > 0) onDrawTileFromPool(); }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all duration-200 ${
            isMyTurn && poolCount > 0
              ? 'bg-amber-950/40 border-amber-500/60 hover:border-amber-400 hover:scale-105 cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'bg-black/30 border-stone-800 opacity-90'
          }`}
          title={isMyTurn ? 'לחץ על הקופה לשליפת אריח מהקופה וסיום התור' : 'קופת המשחק'}
        >
          <div className="relative w-7 h-9 flex items-center justify-center shrink-0">
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
            <div className="flex items-center gap-1 font-bold text-amber-200 font-['Rubik']" style={{ fontSize: 11 }}>
              <span>הקופה</span>
              {isMyTurn && poolCount > 0 && (
                <span className="text-amber-400 animate-pulse font-normal" style={{ fontSize: 9 }}>(שלוף)</span>
              )}
            </div>
            <span className="font-mono text-stone-300" style={{ fontSize: 10 }}>{poolCount} אריחים</span>
          </div>
        </div>

        {/* Table actions */}
        <div className="flex items-center gap-1.5">
          {isMyTurn && board.length >= 2 && onAutoMergeSets && (
            <button
              onClick={() => { playTilePlace(); onAutoMergeSets(); }}
              className="px-2 py-1 rounded-xl bg-stone-900/90 hover:bg-stone-800 text-amber-300 hover:text-amber-200 border border-amber-500/40 font-bold flex items-center gap-1 shadow transition active:scale-95"
              style={{ fontSize: 11 }}
              title="חבר אריחים מפוזרים על השולחן לסדרות חוקיות"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">אחד סדרות חוקיות</span>
              <span className="sm:hidden">אחד</span>
            </button>
          )}
          {isMyTurn && (
            <button
              onClick={() => { playTilePlace(); onCreateNewSetWithTile(); }}
              className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black flex items-center gap-1 shadow-lg transition transform hover:scale-105 active:scale-95"
              style={{ fontSize: 11 }}
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>סדרה חדשה</span>
            </button>
          )}
        </div>
      </div>

      {/* INNER: scroll element — only scrolls when isOverflow */}
      <div
        ref={scrollRef}
        className="flex-1 z-10 relative"
        style={{
          overflowY: isOverflow ? 'auto' : 'hidden',
          overflowX: 'hidden',
          touchAction: 'pan-y',
          // scrollbar: thin & themed
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(180,120,40,0.4) transparent',
        }}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e)}
      >
        {/* Scroll fade shadow: top */}
        {isOverflow && (
          <div
            className="sticky top-0 left-0 right-0 h-5 pointer-events-none z-20"
            style={{
              background: 'linear-gradient(to bottom, rgba(8,21,14,0.7) 0%, transparent 100%)',
            }}
          />
        )}

        {/* Sets area */}
        {board.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-4 h-full">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2">
              <Layers className="w-5 h-5 opacity-80" />
            </div>
            <h3 className="text-sm font-bold text-amber-100 mb-0.5">שולחן המשחק ריק</h3>
            <p className="text-xs text-stone-300 max-w-sm mb-2">
              {isMyTurn
                ? 'זהו תורך! בחר אריחים במעמד ולחץ "הורד כסדרה חדשה" או גרור לשולחן.'
                : 'ממתינים לתור הראשון שיוריד סדרות לשולחן...'}
            </p>
          </div>
        ) : (
          <div
            className="flex flex-wrap content-start"
            style={{ gap: meldGap, padding: 2 }}
          >
            {board.map((set) => {
              const validation = validateSet(set.tiles);
              return (
                <div
                  key={set.id}
                  data-set-id={set.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDrop(e, set.id, set.tiles.length);
                  }}
                  className={`flex flex-col rounded-xl transition-all duration-200 backdrop-blur-sm ${
                    validation.valid
                      ? 'bg-black/40 border border-emerald-500/40 hover:border-emerald-400/70 shadow-md'
                      : 'bg-red-950/30 border-2 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  }`}
                  style={{ padding: meldPad }}
                >
                  {/* Set header */}
                  <div
                    className="flex items-center justify-between gap-1 px-1"
                    style={{ marginBottom: Math.max(2, meldPad * 0.5), fontSize: headerFontSize }}
                  >
                    <div className="flex items-center gap-1">
                      {validation.valid ? (
                        <span className="flex items-center gap-0.5 font-bold text-emerald-400">
                          <Check style={{ width: headerFontSize, height: headerFontSize, strokeWidth: 3 }} />
                          <span>{validation.type === 'group' ? 'קבוצה' : 'רצף'} ({validation.points})</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 font-bold text-red-400" title={validation.error}>
                          <AlertTriangle style={{ width: headerFontSize, height: headerFontSize }} />
                          <span>{validation.error || 'לא חוקי'}</span>
                        </span>
                      )}
                    </div>
                    {isMyTurn && onReturnSetToRack && (
                      <button
                        onClick={(e) => { e.stopPropagation(); playTileClick(); onReturnSetToRack(set.id); }}
                        className="px-1 py-0.5 rounded bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white font-bold flex items-center gap-0.5 border border-stone-700 transition active:scale-95"
                        style={{ fontSize: Math.max(8, headerFontSize - 1) }}
                        title="החזר את אריחי הסדרה הזו למעמד שלך"
                      >
                        <Undo2 style={{ width: headerFontSize, height: headerFontSize }} className="text-amber-400" />
                        <span>החזר</span>
                      </button>
                    )}
                  </div>

                  {/* Tiles row */}
                  <div
                    className="flex items-center flex-wrap bg-black/25 rounded-lg border border-white/5 relative"
                    style={{
                      gap: tileGap,
                      padding: Math.max(3, tileGap),
                      minHeight: tH + tileGap * 2,
                      minWidth: tW + tileGap * 2,
                    }}
                  >
                    {/* Drop zone at start */}
                    {isMyTurn && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropIndicator({ setId: set.id, index: 0 }); }}
                        onDragLeave={() => setDropIndicator(null)}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, set.id, 0); }}
                        style={{
                          height: tH,
                          width: dropIndicator?.setId === set.id && dropIndicator?.index === 0 ? dropZoneW * 2 : dropZoneW,
                          background: dropIndicator?.setId === set.id && dropIndicator?.index === 0 ? '#fbbf24' : 'transparent',
                          borderRadius: 3,
                          transition: 'width 0.1s, background 0.1s',
                          flexShrink: 0,
                        }}
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
                            onDrop={(e) => { e.stopPropagation(); handleDrop(e, set.id, idx); }}
                          >
                            <TileView
                              tile={tile}
                              tileW={tW}
                              tileH={tH}
                              isSelected={isSelected}
                              onClick={() => {
                                if (!isMyTurn) return;
                                playTileClick();
                                if (selectedTile) {
                                  if (selectedTile.tile.id === tile.id) {
                                    onTileSelect(tile, 'board', set.id, idx);
                                  } else {
                                    onMoveTileToSet(set.id, idx);
                                    setLastModifiedSetId(set.id);
                                  }
                                } else {
                                  onTileSelect(tile, 'board', set.id, idx);
                                }
                              }}
                              onDragStart={
                                isMyTurn
                                  ? (e) => {
                                      handleDragStart();
                                      e.dataTransfer.setData(
                                        'application/json',
                                        JSON.stringify({ tile, source: 'board', fromSetId: set.id, fromIndex: idx })
                                      );
                                    }
                                  : undefined
                              }
                            />
                          </div>

                          {/* Insertion drop zone after each tile */}
                          {isMyTurn && (
                            <div
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropIndicator({ setId: set.id, index: idx + 1 }); }}
                              onDragLeave={() => setDropIndicator(null)}
                              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, set.id, idx + 1); }}
                              style={{
                                height: tH,
                                width: isDropTargetNext ? dropZoneW * 2 : dropZoneW,
                                background: isDropTargetNext ? '#fbbf24' : 'transparent',
                                borderRadius: 3,
                                transition: 'width 0.1s, background 0.1s',
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Add button when tile selected */}
                    {isMyTurn && selectedTile && (
                      <button
                        onClick={() => {
                          playTilePlace();
                          onMoveTileToSet(set.id, set.tiles.length);
                          setLastModifiedSetId(set.id);
                        }}
                        className="rounded-md border-2 border-dashed border-amber-400/60 hover:border-amber-400 hover:bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center transition"
                        style={{ height: tH, width: Math.max(20, tW * 0.7), fontSize: 10 }}
                        title="הוסף אריח נבחר לסוף הסדרה"
                      >
                        <Plus style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Scroll fade shadow: bottom */}
        {isOverflow && (
          <div
            className="sticky bottom-0 left-0 right-0 h-5 pointer-events-none z-20"
            style={{
              background: 'linear-gradient(to top, rgba(8,21,14,0.7) 0%, transparent 100%)',
            }}
          />
        )}
      </div>
    </div>
  );
};
