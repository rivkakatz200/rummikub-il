import React, { useState, useEffect } from 'react';
import { GameState, RoomSettings } from '../types/rummikub';
import {
  Users,
  Copy,
  Check,
  Bot,
  Play,
  BookOpen,
  Volume2,
  VolumeX,
  Share2,
  Trash2,
  Sliders,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { toggleSound, isSoundEnabled, playTileClick } from '../utils/audio';
import { sanitizeText, validateRoomCode } from '../utils/security';

interface LobbyViewProps {
  gameState: GameState | null;
  isInRoom: boolean;
  myPlayerId: string | null;
  onCreateRoom: (playerName: string, avatar: string, settings: RoomSettings) => void;
  onJoinRoom: (roomId: string, playerName: string, avatar: string) => void;
  onStartSoloBotGame: (playerName: string, avatar: string, settings: RoomSettings) => void;
  onUpdateSettings?: (settings: RoomSettings) => void;
  onAddBot: () => void;
  onRemovePlayer: (targetPlayerId: string) => void;
  onStartGame: () => void;
  onOpenRules: () => void;
  initialRoomCode?: string;
}

const AVATARS = ['🦁', '🦊', '🐼', '🦉', '🐯', '🦄', '🧙‍♂️', '👑', '🚀', '🐱', '🎲'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  gameState,
  isInRoom,
  myPlayerId,
  onCreateRoom,
  onJoinRoom,
  onStartSoloBotGame,
  onUpdateSettings,
  onAddBot,
  onRemovePlayer,
  onStartGame,
  onOpenRules,
  initialRoomCode = '',
}) => {
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('rummi_player_name') || 'שחקן 1'
  );
  const [selectedAvatar, setSelectedAvatar] = useState(
    () => localStorage.getItem('rummi_avatar') || '🦁'
  );
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [settings, setSettings] = useState<RoomSettings>(() => {
    const savedTurn = localStorage.getItem('rummi_turn_duration');
    const savedMeld = localStorage.getItem('rummi_min_meld');
    return {
      maxPlayers: 4,
      // Default to 0 (ללא מגבלה) as requested for relaxed gameplay
      turnDuration: savedTurn !== null ? Number(savedTurn) : 0,
      minInitialMeld: savedMeld !== null ? Number(savedMeld) : 30,
    };
  });

  // Sync initialRoomCode when URL has ?room=XYZ
  useEffect(() => {
    if (initialRoomCode) {
      setRoomCodeInput(initialRoomCode.toUpperCase().trim());
    }
  }, [initialRoomCode]);

  const handleAvatarSelect = (av: string) => {
    playTileClick();
    setSelectedAvatar(av);
    localStorage.setItem('rummi_avatar', av);
  };

  const handleNameChange = (val: string) => {
    const clean = sanitizeText(val, 20);
    setPlayerName(clean);
    localStorage.setItem('rummi_player_name', clean);
  };

  const handleCopyCode = () => {
    if (!gameState?.roomId) return;
    navigator.clipboard.writeText(gameState.roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!gameState?.roomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${gameState.roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleToggleSound = () => {
    const state = toggleSound();
    setSoundOn(state);
  };

  const handleJoinClick = () => {
    const cleanCode = validateRoomCode(roomCodeInput);
    if (!cleanCode) return;
    onJoinRoom(cleanCode, playerName || 'שחקן', selectedAvatar);
  };

  const updateSettingOption = (newSettings: Partial<RoomSettings>) => {
    playTileClick();
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (newSettings.turnDuration !== undefined) {
      localStorage.setItem('rummi_turn_duration', String(newSettings.turnDuration));
    }
    if (newSettings.minInitialMeld !== undefined) {
      localStorage.setItem('rummi_min_meld', String(newSettings.minInitialMeld));
    }
    if (isInRoom && isHost && onUpdateSettings) {
      onUpdateSettings(updated);
    }
  };

  const myPlayer = gameState?.players.find((p) => p.id === myPlayerId);
  const isHost = myPlayer?.isHost ?? false;
  const isInvitedViaLink = Boolean(initialRoomCode && !isInRoom);

  return (
    <div
      className="min-h-screen rummikub-table flex flex-col items-center justify-center p-3 sm:p-6 text-stone-100 relative"
      dir="rtl"
    >
      {/* Top Header bar with Sound & Rules */}
      <div className="absolute top-4 inset-x-4 max-w-4xl mx-auto flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl font-black font-['Fredoka'] text-amber-300 drop-shadow">
            רומיקוב
          </span>
          <span className="text-xs sm:text-sm font-bold text-amber-400/90 hidden sm:inline">
            אונליין מרובה משתתפים
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleSound}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-stone-900/80 hover:bg-stone-800 border border-stone-700/80 text-stone-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition shadow"
            title={soundOn ? 'השתק צלילים' : 'הפעל צלילים'}
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{soundOn ? 'צלילים פעילים' : 'צליל מושתק'}</span>
          </button>

          <button
            onClick={onOpenRules}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center gap-1.5 shadow-lg transition transform hover:scale-105"
          >
            <BookOpen className="w-4 h-4 stroke-[2.5]" />
            <span>הוראות משחק</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-lg bg-stone-900/90 border-2 border-amber-600/50 rounded-3xl p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl z-10 mt-12 sm:mt-0">
        {!isInRoom ? (
          /* Profile & Room Creation / Join Screen */
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-black text-amber-200 font-['Fredoka'] mb-1">
                ברוכים הבאים לרומיקוב!
              </h1>
              <p className="text-xs sm:text-sm text-stone-400">
                שחקו עם חברים בזמן אמת סביב שולחן עץ מציאותי לפי חוקי המשחק הרשמיים
              </p>
            </div>

            {/* Direct Invitation Banner if arriving via link */}
            {isInvitedViaLink && (
              <div className="p-3 rounded-2xl bg-amber-500/15 border-2 border-amber-500/60 flex items-center justify-between gap-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-right">
                    <span className="font-bold text-amber-200 text-xs sm:text-sm block">
                      קיבלת הזמנה לחדר: {initialRoomCode}
                    </span>
                    <span className="text-[11px] text-stone-300">
                      הזן את שמך ולחץ על הצטרף
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleJoinClick}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shadow-md transition"
                >
                  הצטרף עכשיו
                </button>
              </div>
            )}

            {/* Profile Setup */}
            <div className="bg-stone-950/60 border border-stone-800 rounded-2xl p-3.5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1">
                  השם שלך:
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="הקלד את שמך..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900 border border-stone-700 text-white font-bold text-sm focus:outline-none focus:border-amber-400 transition text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1.5">
                  בחר דמות:
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      onClick={() => handleAvatarSelect(av)}
                      className={`text-2xl p-2 rounded-xl transition ${
                        selectedAvatar === av
                          ? 'bg-amber-500 scale-110 shadow-lg'
                          : 'bg-stone-900/80 hover:bg-stone-800'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Game Settings (Configurable prior to creating or starting solo game) */}
            <div className="bg-stone-950/60 border border-amber-500/20 rounded-2xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>הגדרות המשחק (חוקים וזמנים):</span>
              </div>

              {/* Turn Timer Selector */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-stone-300 font-bold">זמן לתור:</span>
                <div className="flex items-center gap-1">
                  {[
                    { sec: 0, label: 'ללא מגבלה ∞' },
                    { sec: 45, label: '45 שניות' },
                    { sec: 60, label: '60 שניות' },
                    { sec: 90, label: '90 שניות' },
                  ].map((opt) => (
                    <button
                      key={opt.sec}
                      type="button"
                      onClick={() => updateSettingOption({ turnDuration: opt.sec })}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                        settings.turnDuration === opt.sec
                          ? 'bg-amber-500 text-stone-950 shadow-md scale-105'
                          : 'bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Initial Meld points selector */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-stone-300 font-bold">פתיחה ראשונית:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateSettingOption({ minInitialMeld: 30 })}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                      settings.minInitialMeld === 30
                        ? 'bg-amber-500 text-stone-950 shadow-md scale-105'
                        : 'bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800'
                    }`}
                  >
                    30 נקודות (רשמי)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettingOption({ minInitialMeld: 0 })}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                      settings.minInitialMeld === 0
                        ? 'bg-amber-500 text-stone-950 shadow-md scale-105'
                        : 'bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800'
                    }`}
                  >
                    ללא מגבלה (קל)
                  </button>
                </div>
              </div>
            </div>

            {/* Play Options */}
            <div className="flex flex-col gap-2.5">
              {/* Option A: Solo vs AI Bot (Instant 1-Click Game) */}
              <button
                onClick={() => onStartSoloBotGame(playerName, selectedAvatar, settings)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition transform hover:scale-[1.01] active:scale-95 border border-blue-400/30"
              >
                <Bot className="w-5 h-5" />
                <span>משחק יחיד נגד המחשב (בוט AI)</span>
                <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              </button>

              {/* Option B: Create Multiplayer Room */}
              <button
                onClick={() => onCreateRoom(playerName, selectedAvatar, settings)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition transform hover:scale-[1.01] active:scale-95"
              >
                <Play className="w-5 h-5 fill-stone-950" />
                <span>צור חדר והזמן חברים (מולטיפלייר)</span>
              </button>

              {/* Option C: Join with code */}
              <div className="flex items-center gap-3 my-0.5">
                <div className="flex-1 h-px bg-stone-800" />
                <span className="text-xs text-stone-400 font-bold">או הצטרף לחדר קיים</span>
                <div className="flex-1 h-px bg-stone-800" />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="הזן קוד חדר (לדוגמה: 7X8B)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-700 text-white font-mono font-bold text-sm tracking-wider uppercase text-center focus:outline-none focus:border-amber-400 transition"
                />
                <button
                  onClick={handleJoinClick}
                  disabled={!roomCodeInput.trim()}
                  className={`py-2.5 px-5 rounded-xl font-bold text-sm transition shadow ${
                    roomCodeInput.trim()
                      ? 'bg-sky-600 hover:bg-sky-500 text-white active:scale-95'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  }`}
                >
                  הצטרף
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Waiting Room Lobby Screen */
          <div className="flex flex-col gap-4">
            {/* Room Code & Invite Link */}
            <div className="bg-stone-950/70 border border-amber-500/30 rounded-2xl p-4 flex flex-col items-center gap-2 text-center">
              <span className="text-xs font-bold text-stone-400">קוד חדר לשיתוף עם חברים:</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-3xl font-black text-amber-300 tracking-widest bg-stone-900 px-4 py-1.5 rounded-xl border border-stone-700">
                  {gameState?.roomId}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="p-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 transition"
                  title="העתק קוד"
                >
                  {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>

              <button
                onClick={handleCopyLink}
                className="mt-1 flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-bold transition underline underline-offset-4"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? '✓ הקישור הועתק ללוח!' : 'העתק קישור ישיר להזמנת חברים'}</span>
              </button>
            </div>

            {/* Players List in Lobby */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-400 px-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>שחקנים בחדר ({gameState?.players.length}/4):</span>
                </div>

                {/* Add Bot Button */}
                {isHost && gameState && gameState.players.length < 4 && (
                  <button
                    onClick={() => {
                      playTileClick();
                      onAddBot();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-xs font-bold flex items-center gap-1.5 transition transform active:scale-95 shadow"
                  >
                    <Bot className="w-4 h-4 text-blue-400" />
                    <span>+ הוסף שחקן בוט (AI)</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {gameState?.players.map((p) => {
                  const isMe = p.id === myPlayerId;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                        isMe
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-stone-950/40 border-stone-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{p.avatar}</span>
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-sm text-stone-100">
                            <span>{p.name}</span>
                            {isMe && (
                              <span className="text-[10px] text-amber-400 font-normal">
                                (אתה)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-400">
                            {p.isHost ? 'מנהל החדר 👑' : p.isBot ? 'בוט מחשב 🤖' : 'שחקן אורח'}
                          </div>
                        </div>
                      </div>

                      {/* Remove player if host */}
                      {isHost && !p.isHost && (
                        <button
                          onClick={() => onRemovePlayer(p.id)}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-red-400 hover:bg-stone-800 transition"
                          title="הסר שחקן מהחדר"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Room Settings (Host only) */}
            {isHost && (
              <div className="bg-stone-950/40 border border-stone-800 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-stone-300 mb-1">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>הגדרות המשחק:</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">זמן לתור:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { sec: 0, label: 'ללא מגבלה ∞' },
                      { sec: 45, label: '45 שניות' },
                      { sec: 60, label: '60 שניות' },
                      { sec: 90, label: '90 שניות' },
                    ].map((opt) => (
                      <button
                        key={opt.sec}
                        type="button"
                        onClick={() => updateSettingOption({ turnDuration: opt.sec })}
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition ${
                          settings.turnDuration === opt.sec
                            ? 'bg-amber-500 text-stone-950 font-black shadow'
                            : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-stone-400 font-bold">פתיחה ראשונית:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSettingOption({ minInitialMeld: 30 })}
                      className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition ${
                        settings.minInitialMeld === 30
                          ? 'bg-amber-500 text-stone-950 font-black shadow'
                          : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                      }`}
                    >
                      30 נקודות (רשמי)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettingOption({ minInitialMeld: 0 })}
                      className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition ${
                        settings.minInitialMeld === 0
                          ? 'bg-amber-500 text-stone-950 font-black shadow'
                          : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                      }`}
                    >
                      ללא מגבלה (קל)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Start Game Action */}
            <div className="pt-1">
              {isHost ? (
                <button
                  onClick={onStartGame}
                  disabled={(gameState?.players.length || 0) < 2}
                  className={`w-full py-3.5 px-4 rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-xl transition transform active:scale-95 ${
                    (gameState?.players.length || 0) >= 2
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-stone-950 hover:scale-[1.02]'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-5 h-5 fill-stone-950" />
                  <span>
                    {(gameState?.players.length || 0) < 2
                      ? 'דרושים לפחות 2 שחקנים (לחץ הוסף בוט)'
                      : 'התחל משחק עכשיו!'}
                  </span>
                </button>
              ) : (
                <div className="text-center py-3 text-sm font-bold text-amber-300 animate-pulse bg-stone-950/60 rounded-xl border border-stone-800">
                  ממתינים למנהל החדר שיתחיל את המשחק...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
