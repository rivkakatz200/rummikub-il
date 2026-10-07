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
  const isTimed = maxTurnTime > 0;
  const timeLeftPercent = isTimed ? Math.max(0, Math.min(100, (turnTimeLeft / maxTurnTime) * 100)) : 100;

  return (
    <div
      className={`relative flex items-center gap-2 px-2 py-1 rounded-xl transition-all duration-300 ${
        isCurrentTurn
          ? 'bg-amber-950/50 border-2 border-amber-400 active-turn-pulse shadow-md'
          : 'bg-stone-900/70 border border-stone-800'
      }`}
      style={{ minHeight: 36 }}
    >
      {/* Floating reaction */}
      {latestReaction && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 animate-reaction flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-900/95 border border-amber-400/80 shadow-xl text-stone-100 font-bold whitespace-nowrap" style={{ fontSize: 11 }}>
          <span className="text-base">{latestReaction.emoji}</span>
          {latestReaction.text && <span>{latestReaction.text}</span>}
        </div>
      )}

      {/* Avatar */}
      <div className="relative text-lg shrink-0">
        {player.avatar}
        {player.isHost && (
          <Crown className="w-3 h-3 text-amber-400 absolute -top-1.5 -right-1 fill-amber-400 drop-shadow" />
        )}
        {player.isBot && (
          <span className="absolute -bottom-1 -left-1 p-0.5 bg-blue-600 rounded-full">
            <Bot className="w-2 h-2 text-white" />
          </span>
        )}
      </div>

      {/* Name + stats */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1" style={{ fontSize: 11 }}>
          <span className="font-bold text-stone-100 truncate max-w-[90px]">{player.name}</span>
          {!player.isConnected && <WifiOff className="w-2.5 h-2.5 text-red-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-1 text-stone-400" style={{ fontSize: 10 }}>
          <span className="font-mono text-amber-400 font-bold">{player.score}נק׳</span>
          <span>•</span>
          <span className="font-mono text-stone-300">{player.tileCount}🀱</span>
          <span>•</span>
          <span className={player.hasInitialMeld ? 'text-emerald-400' : 'text-stone-500'}>
            {player.hasInitialMeld ? 'פתח' : 'טרם'}
          </span>
        </div>
      </div>

      {/* Turn badge */}
      {isCurrentTurn && (
        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold animate-pulse shrink-0" style={{ fontSize: 9 }}>
          תור
        </span>
      )}

      {/* Timer bar */}
      {isCurrentTurn && isTimed && (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-stone-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${turnTimeLeft <= 10 ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`}
            style={{ width: `${timeLeftPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
