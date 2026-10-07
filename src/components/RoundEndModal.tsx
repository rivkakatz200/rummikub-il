import React, { useEffect } from 'react';
import { Player } from '../types/rummikub';
import { Trophy, RotateCcw, Home, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playVictorySound } from '../utils/audio';

interface RoundEndModalProps {
  isOpen: boolean;
  winnerId?: string;
  players: Player[];
  onNextRound: () => void;
  onLeaveRoom: () => void;
  isHost: boolean;
}

export const RoundEndModal: React.FC<RoundEndModalProps> = ({
  isOpen,
  winnerId,
  players,
  onNextRound,
  onLeaveRoom,
  isHost,
}) => {
  useEffect(() => {
    if (isOpen) {
      playVictorySound();
      // Confetti burst
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 350);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const winner = players.find((p) => p.id === winnerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="bg-stone-900 border-2 border-amber-500/70 rounded-3xl max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6 flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
        dir="rtl"
      >
        {/* Background glow */}
        <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-amber-500/20 to-transparent pointer-events-none" />

        {/* Winner Icon */}
        <div className="relative mb-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 p-1 flex items-center justify-center shadow-xl animate-bounce">
            <div className="w-full h-full rounded-full bg-stone-950 flex items-center justify-center text-amber-300 text-3xl">
              <Trophy className="w-10 h-10 stroke-[2.2]" />
            </div>
          </div>
          <Sparkles className="w-6 h-6 text-amber-300 absolute -top-1 -right-1 animate-spin" />
        </div>

        <h2 className="text-3xl sm:text-4xl font-black text-amber-300 tracking-tight font-['Fredoka'] mb-1">
          רומיקוב!
        </h2>
        <p className="text-stone-300 text-sm sm:text-base font-bold mb-5">
          {winner ? `${winner.name} רוקן את המעמד וניצח בסיבוב!` : 'הסיבוב הסתיים!'}
        </p>

        {/* Scores Table */}
        <div className="w-full bg-stone-950/70 rounded-2xl border border-stone-800 p-3 mb-6">
          <div className="text-xs font-bold text-stone-400 mb-2 border-b border-stone-800/80 pb-1.5 flex justify-between px-2">
            <span>שחקן</span>
            <span>אריחים שנותרו</span>
            <span>ניקוד מצטבר</span>
          </div>

          <div className="space-y-2">
            {players.map((player) => {
              const isPlayerWinner = player.id === winnerId;
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs sm:text-sm font-bold ${
                    isPlayerWinner
                      ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
                      : 'bg-stone-900/60 text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{player.avatar}</span>
                    <span className="truncate max-w-[110px]">{player.name}</span>
                    {isPlayerWinner && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-stone-950 text-[10px] font-black">
                        מנצח!
                      </span>
                    )}
                  </div>

                  <div className="text-stone-400 font-mono">
                    {isPlayerWinner ? '0 (רוקן)' : `${player.tileCount} אריחים`}
                  </div>

                  <div
                    className={`font-mono text-sm font-black ${
                      player.score > 0
                        ? 'text-emerald-400'
                        : player.score < 0
                        ? 'text-red-400'
                        : 'text-stone-300'
                    }`}
                  >
                    {player.score > 0 ? `+${player.score}` : player.score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
          {isHost ? (
            <button
              onClick={onNextRound}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition transform active:scale-95"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              <span>התחל סיבוב הבא</span>
            </button>
          ) : (
            <div className="text-xs text-amber-400/80 py-2">
              ממתינים למנהל החדר שיתחיל את הסיבוב הבא...
            </div>
          )}

          <button
            onClick={onLeaveRoom}
            className="w-full sm:w-auto py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" />
            <span>חזרה ללובי</span>
          </button>
        </div>
      </div>
    </div>
  );
};
