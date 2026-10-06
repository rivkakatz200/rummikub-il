import React, { useState } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';

interface ReactionsBarProps {
  onSendReaction: (emoji: string, text?: string) => void;
}

const QUICK_REACTIONS = [
  { emoji: '👏', text: 'כל הכבוד!' },
  { emoji: '🔥', text: 'איזה מהלך!' },
  { emoji: '👑', text: 'אלוף!' },
  { emoji: '⏳', text: 'תורך!' },
  { emoji: '🃏', text: 'איפה הג׳וקר?!' },
  { emoji: '😱', text: 'הלך עליי...' },
  { emoji: '🏆', text: 'רומיקוב!' },
  { emoji: '🎲', text: 'מזל של מתחילים' },
];

export const ReactionsBar: React.FC<ReactionsBarProps> = ({ onSendReaction }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (emoji: string, text?: string) => {
    onSendReaction(emoji, text);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 sm:px-3 sm:py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 shadow-lg transition"
        title="שלח תגובה מהירה לשחקנים"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">תגובות מהירות</span>
        <Sparkles className="w-3 h-3 text-amber-400" />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 w-64 sm:w-72 p-2.5 rounded-2xl bg-stone-900 border border-stone-700/80 shadow-2xl z-40 flex flex-col gap-1.5 text-right backdrop-blur-md"
          dir="rtl"
        >
          <div className="text-[11px] font-bold text-stone-400 px-1 mb-1">
            שלח תגובה לשולחן המשחק:
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_REACTIONS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(item.emoji, item.text)}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-stone-800/80 hover:bg-amber-500 hover:text-stone-950 text-stone-200 text-xs font-bold transition text-right"
              >
                <span className="text-base">{item.emoji}</span>
                <span className="truncate">{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
