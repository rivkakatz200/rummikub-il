import React from 'react';
import { Player } from '../types/rummikub';
import { Bot, Crown, WifiOff } from 'lucide-react';

interface OpponentRackProps {
  player: Player;
  isCurrentTurn: boolean;
  turnTimeLeft: number;
  maxTurnTime: number;
  latestReaction?: { emoji: string; text?: string };
}

export const OpponentRack: React.FC<OpponentRackProps> = ({
  player,
  isCurrentTurn,
  turnTimeLeft,
  maxTurnTime,
  latestReaction,
}) => {
  // If turn timer is active (maxTurnTime > 0)
  const isTimed = maxTurnTime > 0;
  const timeLeftPercent = isTimed
    ? Math.max(0, Math.min(100, (turnTimeLeft / maxTurnTime) * 100))
    : 100;

  return (
    <div
      className={`relative flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${
        isCurrentTurn
          ? 'bg-amber-950/50 border-2 border-amber-400 active-turn-pulse shadow-lg'
          : 'bg-stone-900/70 border border-stone-800 backdrop-blur-sm'
      }`}
    >
      {/* Floating Reaction Bubble */}
      {latestReaction && (
        <div className="absolute -top-10 z-30 animate-reaction flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900/95 border border-amber-400/80 shadow-2xl text-stone-100 text-xs font-bold">
          <span className="text-lg">{latestReaction.emoji}</span>
          {latestReaction.text && <span>{latestReaction.text}</span>}
        </div>
      )}

      {/* Top Player Details Bar */}
      <div className="flex items-center gap-2 w-full justify-between mb-1 px-1">
        <div className="flex items-center gap-1.5">
          <div className="relative text-xl">
            {player.avatar}
            {player.isHost && (
              <Crown className="w-3.5 h-3.5 text-amber-400 absolute -top-1.5 -right-1 fill-amber-400 drop-shadow" />
            )}
            {player.isBot && (
              <span className="absolute -bottom-1 -left-1 p-0.5 bg-blue-600 rounded-full text-[9px] text-white">
                <Bot className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs font-bold text-stone-100">
              <span className="truncate max-w-[100px]">{player.name}</span>
              {!player.isConnected && (
                <span title="מנותק">
                  <WifiOff className="w-3 h-3 text-red-400" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-stone-400">
              <span className="font-medium text-amber-400 font-mono">{player.score} נק׳</span>
              <span>•</span>
              <span className={player.hasInitialMeld ? 'text-emerald-400' : 'text-stone-400'}>
                {player.hasInitialMeld ? 'פתח (30+)' : 'טרם פתח'}
              </span>
            </div>
          </div>
        </div>

        {/* Turn Indicator */}
        {isCurrentTurn && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-[10px] font-bold text-amber-300 animate-pulse">
            תור פעיל
          </span>
        )}
      </div>

      {/* Turn Countdown Bar (if timed) */}
      {isCurrentTurn && isTimed && (
        <div className="w-full h-1 bg-stone-800 rounded-full overflow-hidden mb-1.5">
          <div
            className={`h-full transition-all duration-1000 ${
              turnTimeLeft <= 10 ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
            }`}
            style={{ width: `${timeLeftPercent}%` }}
          />
        </div>
      )}

      {/* Realistic Solid Opaque Black Plastic Rummikub Rack */}
      {/* Strictly hides the number of tiles, showing only the physical plastic stand back */}
      <div className="w-full bg-gradient-to-b from-[#24282f] via-[#1a1c22] to-[#101216] border border-[#383e4a] rounded-lg p-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.6)] flex flex-col gap-1 items-center justify-center min-h-[38px] relative overflow-hidden">
        {/* Horizontal molded plastic ridges */}
        <div className="w-full h-1.5 bg-[#14161b] rounded-full border-t border-b border-black/40 shadow-inner" />
        <div className="w-full h-1.5 bg-[#14161b] rounded-full border-t border-b border-black/40 shadow-inner" />

        {/* Subtle molded plastic Rummikub logo embossing */}
        <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none select-none">
          <span className="text-[10px] font-black tracking-widest text-stone-300 font-['Fredoka']">
            RUMMIKUB
          </span>
        </div>

        {/* Glossy reflection on top of the black plastic holder */}
        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};
