import React from 'react';
import { TileSet, Tile } from '../types/rummikub';
import { validateBoard, calculateInitialMeldPoints } from '../utils/rummikubRules';
import { Check, Undo2, PlusCircle, AlertCircle, Clock, Infinity } from 'lucide-react';
import { playTileClick } from '../utils/audio';

interface GameControlsProps {
  isMyTurn: boolean;
  turnTimeLeft: number;
  maxTurnTime: number;
  poolCount: number;
  hasInitialMeld: boolean;
  minInitialMeld: number;
  currentBoard: TileSet[];
  initialBoard: TileSet[];
  currentRack: Tile[];
  initialRack: Tile[];
  onFinishTurn: () => void;
  onDrawTile: () => void;
  onResetTurn: () => void;
}

export const GameControls: React.FC<GameControlsProps> = ({
  isMyTurn,
  turnTimeLeft,
  maxTurnTime,
  poolCount,
  hasInitialMeld,
  minInitialMeld,
  currentBoard,
  initialBoard,
  currentRack,
  initialRack,
  onFinishTurn,
  onDrawTile,
  onResetTurn,
}) => {
  const boardValidation = validateBoard(currentBoard);
  const playedTileCount = Math.max(0, initialRack.length - currentRack.length);

  // Bug fix: detect sets with < 3 tiles (incomplete sets that block ending the turn)
  const incompleteSets = currentBoard.filter((s) => s.tiles.length > 0 && s.tiles.length < 3);

  // Compute initial meld points using robust helper
  const meldResult = calculateInitialMeldPoints(currentBoard, initialBoard);

  // Determine if finish turn is currently valid
  let canFinish = false;
  let finishWarning = '';

  if (!isMyTurn) {
    finishWarning = 'המתן לתורך...';
  } else if (incompleteSets.length > 0) {
    finishWarning = `יש ${incompleteSets.length} סדרה/ות עם פחות מ-3 אריחים על השולחן. תקן אותן או לחץ "איפוס מהלך".`;
  } else if (!boardValidation.valid) {
    finishWarning = boardValidation.errors[0] || 'כל הסדרות על השולחן חייבות להיות חוקיות (לפחות 3 אריחים)';
  } else if (playedTileCount === 0) {
    finishWarning = 'עליך להוריד לפחות אריח אחד מהיד, או לקחת אריח מהקופה';
  } else if (!hasInitialMeld) {
    if (meldResult.touchedExisting) {
      finishWarning = 'בפתיחה ראשונית אסור להשתמש באריחים שכבר על השולחן!';
    } else if (minInitialMeld > 0 && meldResult.points < minInitialMeld) {
      finishWarning = `פתיחה ראשונית דורשת לפחות ${minInitialMeld} נקודות מהיד (נוכחי: ${meldResult.points})`;
    } else {
      canFinish = true;
    }
  } else {
    canFinish = true;
  }

  const hasModifications =
    playedTileCount > 0 || JSON.stringify(currentBoard) !== JSON.stringify(initialBoard);

  const isUnlimitedTime = maxTurnTime === 0;

  return (
    <div className="w-full flex flex-col gap-1 bg-stone-950/90 border border-stone-800 p-1.5 sm:p-2 rounded-xl backdrop-blur-md shadow-lg shrink-0">
      {/* Information Row */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-2">
          {/* Turn timer or No Limit indicator */}
          <div
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
              isUnlimitedTime
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : turnTimeLeft <= 10 && isMyTurn
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                : isMyTurn
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-800 text-stone-400'
            }`}
          >
            {isUnlimitedTime ? (
              <>
                <Infinity className="w-3.5 h-3.5 text-blue-400" />
                <span>ללא מגבלה</span>
              </>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                <span>{turnTimeLeft} שניות</span>
              </>
            )}
          </div>

          {/* Opening Meld Status */}
          {isMyTurn && (
            <div>
              {!hasInitialMeld ? (
                <span
                  className={`px-2 py-0.5 rounded-lg border font-bold text-[11px] ${
                    minInitialMeld === 0 || meldResult.points >= minInitialMeld
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-black'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {minInitialMeld === 0 ? (
                    'פתיחה: ללא מגבלת נקודות ✓'
                  ) : (
                    <>
                      פתיחה ראשונית: {meldResult.points} / {minInitialMeld} נק׳
                      {meldResult.points >= minInitialMeld && ' ✓ (מוכן לסיום תור!)'}
                    </>
                  )}
                </span>
              ) : (
                <span className="text-emerald-400 font-bold text-[11px]">
                  ✓ פתחת! (מותר לבצע מניפולציות ופיצולים)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Warning Toast */}
        {isMyTurn && finishWarning && (
          <div className="flex items-center gap-1 text-[11px] text-amber-300 truncate max-w-[340px]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{finishWarning}</span>
          </div>
        )}
      </div>

      {/* Main Buttons Bar */}
      <div className="flex items-center justify-between gap-1.5">
        {/* Draw tile button */}
        <button
          onClick={onDrawTile}
          disabled={!isMyTurn}
          className={`py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition shadow ${
            isMyTurn
              ? 'bg-sky-600 hover:bg-sky-500 text-white active:scale-95'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
          title="שלוף אריח מהקופה וסיים את התור"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>שלוף אריח מהקופה ({poolCount})</span>
        </button>

        {/* Reset Turn Button */}
        {isMyTurn && hasModifications && (
          <button
            onClick={() => {
              playTileClick();
              onResetTurn();
            }}
            className="py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 font-bold text-xs flex items-center gap-1 transition active:scale-95"
            title="בטל את כל השינויים והחזר את האריחים להתחלת התור"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>איפוס מהלך</span>
          </button>
        )}

        {/* Finish Turn Button */}
        <button
          onClick={onFinishTurn}
          disabled={!canFinish}
          className={`py-1.5 px-4 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-lg ${
            canFinish
              ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-stone-950 active:scale-95 animate-pulse'
              : 'bg-stone-800 text-stone-500 border border-stone-700/60 cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>סיום תור ({playedTileCount} הורדו)</span>
        </button>
      </div>
    </div>
  );
};
