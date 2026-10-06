import React, { useState, useRef, useEffect } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = (emoji: string, text?: string) => {
    onSendReaction(emoji, text);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
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
          ref={panelRef}
          className="fixed z-[200] w-64 sm:w-72 p-2.5 rounded-2xl bg-stone-900 border border-stone-700/80 shadow-2xl flex flex-col gap-1.5 text-right backdrop-blur-md"
          style={(() => {
            if (!buttonRef.current) return { top: 56, right: 8 };
            const rect = buttonRef.current.getBoundingClientRect();
            const panelWidth = 288;
            // Drop down below the button; align right edge with button right edge
            let left = rect.right - panelWidth;
            // Clamp so panel never goes off left edge
            if (left < 8) left = 8;
            return { top: rect.bottom + 6, left };
          })()}
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
