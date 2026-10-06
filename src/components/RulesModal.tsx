import React, { useState } from 'react';
import { X, BookOpen, Layers, Award, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { TileView } from './TileView';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | 'sets' | 'opening' | 'board' | 'scoring'>('basics');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-stone-900 border border-stone-700/80 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-right text-stone-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-amber-100">הוראות משחק הרומיקוב</h2>
              <p className="text-xs text-stone-400">חוקי המשחק הרשמיים, מהלכים וטיפים לאסטרטגיה</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto gap-1 p-2 bg-stone-950/40 border-b border-stone-800 text-xs sm:text-sm">
          <button
            onClick={() => setActiveTab('basics')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition ${
              activeTab === 'basics'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            מטרת המשחק
          </button>
          <button
            onClick={() => setActiveTab('sets')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition ${
              activeTab === 'sets'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            סדרות חוקיות
          </button>
          <button
            onClick={() => setActiveTab('opening')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition ${
              activeTab === 'opening'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            פתיחה ראשונית (30)
          </button>
          <button
            onClick={() => setActiveTab('board')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition ${
              activeTab === 'board'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            מהלכים ומניפולציות
          </button>
          <button
            onClick={() => setActiveTab('scoring')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition ${
              activeTab === 'scoring'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
            }`}
          >
            <Award className="w-4 h-4" />
            ניקוד וניצחון
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-stone-300">
          {activeTab === 'basics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <h3 className="font-bold text-base mb-1">המטרה הראשית:</h3>
                <p>להיות השחקן הראשון שמרוקן את כל האריחים ממעמד השחקן שלו על ידי יצירת סדרות חוקיות על השולחן ולהכריז &quot;רומיקוב!&quot;.</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-base">מרכיבי המשחק:</h4>
                <ul className="list-disc list-inside space-y-1.5 text-stone-300 pr-2">
                  <li><strong>106 אריחים בסך הכל:</strong> 4 צבעים (שחור, כחול, אדום, צהוב), מספרים מ-1 עד 13 (2 עותקים מכל אריח).</li>
                  <li><strong>2 ג׳וקרים מיוחדים:</strong> יכולים לייצג כל מספר וכל צבע שתרצו.</li>
                  <li><strong>חלוקה:</strong> בתחילת המשחק כל שחקן מקבל 14 אריחים סודיים למעמד האישי שלו. שאר האריחים נשארים בקופה.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-base">מהלך התור:</h4>
                <p>בכל תור, על השחקן לבצע אחת משתי הפעולות הבאות:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-stone-800/80 border border-stone-700">
                    <span className="font-bold text-emerald-400 block mb-1">1. להוריד אריחים לשולחן</span>
                    להניח לפחות אריח אחד מהיד כחלק מסדרה חדשה או להוסיף לסדרות קיימות על השולחן.
                  </div>
                  <div className="p-3 rounded-lg bg-stone-800/80 border border-stone-700">
                    <span className="font-bold text-sky-400 block mb-1">2. לשלוף אריח מהקופה</span>
                    אם אין לשחקן מהלך חוקי, או שהוא מעדיף לשמור אריחים – עליו לשלוף אריח אחד מהקופה ותורו מסתיים.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sets' && (
            <div className="space-y-5">
              <p>כל סדרה על לוח המשחק חייבת להכיל <strong>לפחות 3 אריחים</strong> ולהשתייך לאחד משני הסוגים:</p>

              {/* Groups */}
              <div className="p-4 rounded-xl bg-stone-800/80 border border-stone-700 space-y-3">
                <div>
                  <h4 className="font-bold text-amber-400 text-base">1. קבוצה (אותו מספר, צבעים שונים)</h4>
                  <p className="text-xs text-stone-400">3 או 4 אריחים עם אותו המספר בדיוק, אך כל אחד בצבע שונה. אסור צבע כפול!</p>
                </div>
                <div className="flex items-center gap-2 p-2 bg-stone-900/60 rounded-lg overflow-x-auto">
                  <TileView tile={{ id: 'ex1', color: 'red', number: 8 }} size="sm" />
                  <TileView tile={{ id: 'ex2', color: 'blue', number: 8 }} size="sm" />
                  <TileView tile={{ id: 'ex3', color: 'black', number: 8 }} size="sm" />
                  <TileView tile={{ id: 'ex4', color: 'yellow', number: 8 }} size="sm" />
                  <span className="text-xs text-emerald-400 font-bold mr-2">✓ קבוצה חוקית של 8 (4 צבעים)</span>
                </div>
              </div>

              {/* Runs */}
              <div className="p-4 rounded-xl bg-stone-800/80 border border-stone-700 space-y-3">
                <div>
                  <h4 className="font-bold text-amber-400 text-base">2. רצף (מספרים עוקבים, אותו צבע)</h4>
                  <p className="text-xs text-stone-400">3 אריחים ומעלה עם מספרים עוקבים באותו הצבע בדיוק. המספר 1 תמיד נמוך (לא ניתן להמשיך אחרי 13).</p>
                </div>
                <div className="flex items-center gap-2 p-2 bg-stone-900/60 rounded-lg overflow-x-auto">
                  <TileView tile={{ id: 'ex5', color: 'blue', number: 4 }} size="sm" />
                  <TileView tile={{ id: 'ex6', color: 'blue', number: 5 }} size="sm" />
                  <TileView tile={{ id: 'ex7', color: 'blue', number: 6 }} size="sm" />
                  <TileView tile={{ id: 'ex8', color: 'blue', number: 7 }} size="sm" />
                  <span className="text-xs text-emerald-400 font-bold mr-2">✓ רצף כחול חוקי (4-7)</span>
                </div>
              </div>

              {/* Joker in set */}
              <div className="p-4 rounded-xl bg-stone-800/80 border border-stone-700 space-y-3">
                <div>
                  <h4 className="font-bold text-amber-400 text-base">3. שילוב ג׳וקר</h4>
                  <p className="text-xs text-stone-400">הג׳וקר מחליף כל אריח חסר (צבע ומספר לפי מיקומו בסדרה).</p>
                </div>
                <div className="flex items-center gap-2 p-2 bg-stone-900/60 rounded-lg overflow-x-auto">
                  <TileView tile={{ id: 'ex9', color: 'red', number: 9 }} size="sm" />
                  <TileView tile={{ id: 'ex10', color: 'red', number: 0, isJoker: true }} size="sm" />
                  <TileView tile={{ id: 'ex11', color: 'red', number: 11 }} size="sm" />
                  <span className="text-xs text-emerald-400 font-bold mr-2">✓ הג׳וקר מייצג 10 אדום</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'opening' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <h4 className="font-black text-lg mb-1">חוק פתיחה ראשונית (30 נקודות):</h4>
                <p>כדי לבצע את המהלך הראשון במשחק (&quot;לפתוח&quot;), על השחקן להוריד סדרה אחת או יותר מהיד שלו שסכום ערכיהן הכולל הוא <strong>לפחות 30 נקודות</strong>.</p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-white">כללים קריטיים לפתיחה:</h5>
                <ul className="list-disc list-inside space-y-2 text-stone-300">
                  <li><strong>רק מהיד האישית:</strong> בפתיחה ראשונית אסור לגעת או להשתמש באריחים שכבר נמצאים על הלוח!</li>
                  <li><strong>סדרות שלמות ועצמאיות:</strong> כל סדרה שמורידים בפתיחה חייבת להיות תקנית בפני עצמה (לפחות 3 אריחים).</li>
                  <li><strong>חישוב נקודות:</strong> ג׳וקר בסדרה מקבל את ערך המספר שאותו הוא מחליף (למשל ברצף 9-ג׳וקר-11, הג׳וקר שווה 10).</li>
                  <li><strong>אם אין 30 נקודות:</strong> השחקן אינו רשאי להוריד שום אריח, ועליו לשלוף אריח מהקופה ולהעביר את התור.</li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-stone-800/80 border border-stone-700 text-xs text-stone-300">
                💡 <strong>דוגמה לפתיחה כשרה:</strong> רצף כחול של 9+10+11 = 30 נקודות, או שתי קבוצות: שלישיית 6 (18 נק׳) + שלישיית 5 (15 נק׳) = 33 נקודות.
              </div>
            </div>
          )}

          {activeTab === 'board' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-stone-800/80 border border-stone-700">
                <h4 className="font-bold text-amber-400 text-base mb-1">חופש פעולה לאחר הפתיחה:</h4>
                <p>לאחר ששחקן פתח בהצלחה (במהלך תור קודם), הוא רשאי בכל תור לבצע <strong>מניפולציות חופשיות</strong> על כל האריחים בשולחן!</p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-white">טקטיקות מניפולציה נפוצות:</h5>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                    <strong className="text-emerald-400">הוספת אריח:</strong> הוספת אריח לקצה רצף קיים (למשל הוספת 8 כחול לרצף 5-6-7) או הוספת צבע רביעי לקבוצה של 3.
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                    <strong className="text-sky-400">פיצול רצפים:</strong> אם יש רצף ארוך של 6 אריחים (למשל 3-4-5-6-7-8), ניתן לפצל אותו לשני רצפים חוקיים (3-4-5 ו-6-7-8) או להכניס אריח ביניהם.
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                    <strong className="text-amber-400">שחרור הג׳וקר:</strong> שחקן יכול להחליף ג׳וקר שנמצא על הלוח באריח המתאים מהיד שלו, ומיד להשתמש בג׳וקר המשוחרר ליצירת סדרה חדשה!
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
                ⚠️ <strong>כלל סיום התור:</strong> בסיום התור כל האריחים שעל השולחן חייבים להיות מסודרים בסדרות חוקיות לחלוטין (לפחות 3 אריחים בכל סדרה). אם נשאר אריח בודד או סדרה לא חוקית – המהלך יבוטל!
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <h4 className="font-black text-lg mb-1">ניצחון וסיום סיבוב:</h4>
                <p>המשחק מסתיים ברגע ששחקן מניח את האריח האחרון ממעמדו על השולחן ומכריז <strong>&quot;רומיקוב!&quot;</strong>.</p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-white">חישוב הניקוד הרשמי:</h5>
                <ul className="list-disc list-inside space-y-1.5 text-stone-300">
                  <li><strong>המנצח:</strong> מקבל ניקוד חיובי השווה לסך כל הערכים של האריחים שנשארו במעמדם של כל שאר השחקנים יחד.</li>
                  <li><strong>השחקנים האחרים:</strong> מקבלים ניקוד שלילי (מינוס) השווה לסכום הערכים של האריחים שנשארו במעמד האישי שלהם.</li>
                  <li><strong>קנס על ג׳וקר:</strong> שחקן שנתפס עם ג׳וקר במעמדו בסיום הסיבוב נענש ב-<strong>30 נקודות שליליות נוספות</strong>! לכן מומלץ לא לשמור ג׳וקרים עד הרגע האחרון.</li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-stone-800/80 border border-stone-700 text-center font-bold text-amber-300 text-sm">
                🏆 סך כל הנקודות החיוביות של המנצח תמיד שווה לסך הנקודות השליליות של המפסידים!
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/70 flex justify-between items-center">
          <span className="text-xs text-stone-400">רומיקוב ישראלי אונליין • בהצלחה במשחק!</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black transition shadow-lg"
          >
            הבנתי, בואו נשחק!
          </button>
        </div>
      </div>
    </div>
  );
};
