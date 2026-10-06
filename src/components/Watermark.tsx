import React from 'react';

export const Watermark: React.FC = () => (
  <div
    className="fixed bottom-1 inset-x-0 flex justify-center pointer-events-none z-[100] select-none"
    dir="rtl"
  >
    <span className="text-[10px] text-stone-400 opacity-50 font-sans tracking-wide px-2">
      © כל הזכויות שמורות | בניה ועיצוב רבקה כץ
    </span>
  </div>
);
