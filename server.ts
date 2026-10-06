import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Tile,
  TileSet,
  GameState,
  Player,
  RoomSettings,
} from './src/types/rummikub.js';
import {
  createFullDeck,
  validateBoard,
  validateSet,
  botFindMove,
  calculateHandPenaltyPoints,
  calculateInitialMeldPoints,
} from './src/utils/rummikubRules.js';
import {
  sanitizeText,
  validateRoomCode,
  validateAvatar,
  validateTile,
  sanitizeBoard,
  RateLimiter,
} from './src/utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

interface ServerPlayer extends Player {
  ws?: WebSocket | null;
  rack: Tile[];
}

interface ServerRoom {
  id: string;
  settings: RoomSettings;
  status: 'waiting' | 'playing' | 'round_end';
  players: ServerPlayer[];
  currentTurnIndex: number;
  turnTimeLeft: number;
  board: TileSet[];
  initialBoardSnapshot: TileSet[];
  initialRackSnapshot: Tile[];
  pool: Tile[];
  roundNumber: number;
  winnerId?: string;
  lastActionMessage?: string;
  timerInterval?: NodeJS.Timeout | null;
  lastActivity: number;
}

const rooms = new Map<string, ServerRoom>();
const rateLimiter = new RateLimiter(50, 3000);

// Periodically clean up abandoned rooms (older than 3 hours)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > 3 * 60 * 60 * 1000) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(roomId);
    }
  }
}, 30 * 60 * 1000);

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure unique
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function getSanitizedGameState(room: ServerRoom, forPlayerId: string): GameState {
  return {
    roomId: room.id,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isBot: p.isBot,
      tileCount: p.rack.length,
      hasInitialMeld: p.hasInitialMeld,
      score: p.score,
      isConnected: p.isConnected,
      rack: p.id === forPlayerId ? p.rack : undefined,
    })),
    currentTurnIndex: room.currentTurnIndex,
    turnTimeLeft: room.turnTimeLeft,
    maxTurnTime: room.settings.turnDuration,
    board: room.board,
    poolCount: room.pool.length,
    minInitialMeld: room.settings.minInitialMeld,
    winnerId: room.winnerId,
    lastActionMessage: room.lastActionMessage,
    roundNumber: room.roundNumber,
  };
}

function broadcastRoom(room: ServerRoom) {
  room.lastActivity = Date.now();
  for (const player of room.players) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      try {
        const state = getSanitizedGameState(room, player.id);
        player.ws.send(JSON.stringify({ type: 'ROOM_STATE', state }));
      } catch (err) {
        console.error('Error broadcasting to player:', player.id, err);
      }
    }
  }
}

function broadcastToRoom(room: ServerRoom, payload: any) {
  room.lastActivity = Date.now();
  const msg = JSON.stringify(payload);
  for (const player of room.players) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(msg);
      } catch (err) {
        console.error('Error sending message to player:', player.id, err);
      }
    }
  }
}

function sendToPlayer(player: ServerPlayer, payload: any) {
  if (player.ws && player.ws.readyState === WebSocket.OPEN) {
    try {
      player.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('Error sending direct to player:', player.id, err);
    }
  }
}

function startTurnTimer(room: ServerRoom) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  const activePlayer = room.players[room.currentTurnIndex];
  if (!activePlayer) return;

  room.turnTimeLeft = room.settings.turnDuration;
  room.initialBoardSnapshot = JSON.parse(JSON.stringify(room.board));
  room.initialRackSnapshot = JSON.parse(JSON.stringify(activePlayer.rack));

  // If active player is a bot, execute bot turn with realistic human-like pacing
  if (activePlayer.isBot && room.status === 'playing') {
    setTimeout(() => {
      handleBotTurn(room);
    }, 1500);
    return;
  }

  // If no time limit (turnDuration === 0), do not start a countdown timer
  if (room.settings.turnDuration === 0) {
    room.turnTimeLeft = 0;
    broadcastToRoom(room, {
      type: 'TURN_TICK',
      timeLeft: 0,
    });
    return;
  }

  room.timerInterval = setInterval(() => {
    room.turnTimeLeft--;
    broadcastToRoom(room, {
      type: 'TURN_TICK',
      timeLeft: room.turnTimeLeft,
    });

    if (room.turnTimeLeft <= 0) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
      }
      handleTurnTimeout(room);
    }
  }, 1000);
}

function handleTurnTimeout(room: ServerRoom) {
  const player = room.players[room.currentTurnIndex];
  if (!player) return;

  // Reset board to initial turn start
  room.board = JSON.parse(JSON.stringify(room.initialBoardSnapshot));
  player.rack = JSON.parse(JSON.stringify(room.initialRackSnapshot));

  // Player draws a penalty tile for running out of time
  if (room.pool.length > 0) {
    const penaltyTile = room.pool.pop()!;
    player.rack.push(penaltyTile);
    room.lastActionMessage = `הזמן של ${player.name} אזל! הלוח אופס ונשלף אריח עונש.`;
  } else {
    room.lastActionMessage = `הזמן של ${player.name} אזל! הלוח אופס.`;
  }

  advanceToNextTurn(room);
}

function advanceToNextTurn(room: ServerRoom) {
  if (room.status !== 'playing') return;

  let nextIdx = (room.currentTurnIndex + 1) % room.players.length;
  room.currentTurnIndex = nextIdx;
  const nextPlayer = room.players[nextIdx];
  room.lastActionMessage = `תור שחקן: ${nextPlayer.name}`;

  broadcastRoom(room);
  startTurnTimer(room);
}

function handleBotTurn(room: ServerRoom) {
  if (room.status !== 'playing') return;
  const bot = room.players[room.currentTurnIndex];
  if (!bot || !bot.isBot) return;

  const result = botFindMove(
    bot.rack,
    room.board,
    bot.hasInitialMeld,
    room.settings.minInitialMeld
  );

  if (result.action === 'play' && result.newBoard && result.newRack) {
    room.board = result.newBoard;
    bot.rack = result.newRack;
    bot.hasInitialMeld = true;
    room.lastActionMessage = `${bot.name} הוריד אריחים ללוח!`;

    // Check if bot won
    if (bot.rack.length === 0) {
      handlePlayerWin(room, bot);
      return;
    }
  } else {
    // Bot draws a tile
    if (room.pool.length > 0) {
      const drawn = room.pool.pop()!;
      bot.rack.push(drawn);
      room.lastActionMessage = `${bot.name} לקח אריח מהקופה.`;
    } else {
      room.lastActionMessage = `הקופה ריקה, ${bot.name} העביר את התור.`;
    }
  }

  advanceToNextTurn(room);
}

function handlePlayerWin(room: ServerRoom, winner: ServerPlayer) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  room.status = 'round_end';
  room.winnerId = winner.id;
  room.lastActionMessage = `רומיקוב! 🏆 ${winner.name} ניצח בסיבוב!`;

  // Calculate scores
  let totalWinnerPoints = 0;
  for (const p of room.players) {
    if (p.id !== winner.id) {
      const penalty = calculateHandPenaltyPoints(p.rack);
      p.score -= penalty;
      totalWinnerPoints += penalty;
    }
  }
  winner.score += totalWinnerPoints;

  broadcastRoom(room);
  broadcastToRoom(room, {
    type: 'GAME_OVER',
    winnerId: winner.id,
    winnerName: winner.name,
  });
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '64kb' }));

  // WebSocket Server setup with explicit path '/ws'
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, req) => {
    let currentRoomId: string | null = null;
    let currentPlayerId: string | null = null;
    const clientIp = req.socket.remoteAddress || 'unknown';

    // WebSocket heartbeat ping every 20s
    let isAlive = true;
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    const pingInterval = setInterval(() => {
      if ((ws as any).isAlive === false) {
        clearInterval(pingInterval);
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    }, 20000);

    ws.on('message', (data: string) => {
      try {
        // OWASP Rate Limiting
        if (!rateLimiter.isAllowed(clientIp)) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'נשלחו יותר מדי בקשות, אנא המתן מעט.' }));
          return;
        }

        if (data.length > 65536) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'הודעה גדולה מדי נדחתה מטעמי אבטחה.' }));
          return;
        }

        const message = JSON.parse(data.toString());
        const { type } = message;

        switch (type) {
          case 'RECONNECT_SESSION': {
            const targetRoomCode = validateRoomCode(message.roomId);
            const reqPlayerId = sanitizeText(message.playerId, 50);

            if (targetRoomCode && rooms.has(targetRoomCode)) {
              const targetRoom = rooms.get(targetRoomCode)!;
              const player = targetRoom.players.find((p) => p.id === reqPlayerId);
              if (player) {
                player.ws = ws;
                player.isConnected = true;
                currentRoomId = targetRoom.id;
                currentPlayerId = player.id;
                sendToPlayer(player, {
                  type: 'ROOM_JOINED',
                  roomId: targetRoom.id,
                  playerId: player.id,
                });
                broadcastRoom(targetRoom);
              }
            }
            break;
          }

          case 'CREATE_ROOM': {
            const cleanName = sanitizeText(message.playerName, 20, 'שחקן 1');
            const cleanAvatar = validateAvatar(message.avatar, '🦁');
            const roomId = generateRoomCode();
            const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            const hostPlayer: ServerPlayer = {
              id: playerId,
              name: cleanName,
              avatar: cleanAvatar,
              isHost: true,
              isBot: false,
              tileCount: 0,
              hasInitialMeld: false,
              score: 0,
              isConnected: true,
              rack: [],
              ws,
            };

            const isUnlimitedDuration = message.settings?.turnDuration === 0;
            const chosenTurnDuration = isUnlimitedDuration
              ? 0
              : Math.min(180, Math.max(30, Number(message.settings?.turnDuration) || 60));
            const chosenMinMeld = message.settings?.minInitialMeld === 0 ? 0 : 30;

            const room: ServerRoom = {
              id: roomId,
              settings: {
                maxPlayers: Math.min(4, Math.max(2, Number(message.settings?.maxPlayers) || 4)),
                turnDuration: chosenTurnDuration,
                minInitialMeld: chosenMinMeld,
              },
              status: 'waiting',
              players: [hostPlayer],
              currentTurnIndex: 0,
              turnTimeLeft: chosenTurnDuration,
              board: [],
              initialBoardSnapshot: [],
              initialRackSnapshot: [],
              pool: [],
              roundNumber: 1,
              lastActionMessage: `חדר נוצר בהצלחה! קוד חדר: ${roomId}`,
              lastActivity: Date.now(),
            };

            rooms.set(roomId, room);
            currentRoomId = roomId;
            currentPlayerId = playerId;

            sendToPlayer(hostPlayer, {
              type: 'ROOM_CREATED',
              roomId,
              playerId,
            });
            broadcastRoom(room);
            break;
          }

          case 'UPDATE_SETTINGS': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) return;
            const room = rooms.get(targetRoomId);
            if (!room) return;

            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            const isHostOrSolo = sender?.isHost || room.players.filter((p) => !p.isBot).length <= 1;
            if (sender && !isHostOrSolo) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'רק מנהל החדר רשאי לשנות את הגדרות המשחק.' }));
              return;
            }

            if (message.settings) {
              if (message.settings.turnDuration !== undefined) {
                const isNoLimit = message.settings.turnDuration === 0;
                room.settings.turnDuration = isNoLimit
                  ? 0
                  : Math.min(180, Math.max(30, Number(message.settings.turnDuration) || 60));

                if (room.settings.turnDuration === 0) {
                  if (room.timerInterval) {
                    clearInterval(room.timerInterval);
                    room.timerInterval = null;
                  }
                  room.turnTimeLeft = 0;
                  broadcastToRoom(room, { type: 'TURN_TICK', timeLeft: 0 });
                } else if (room.status === 'playing') {
                  room.turnTimeLeft = room.settings.turnDuration;
                  broadcastToRoom(room, { type: 'TURN_TICK', timeLeft: room.turnTimeLeft });
                }
              }

              if (message.settings.minInitialMeld !== undefined) {
                room.settings.minInitialMeld = message.settings.minInitialMeld === 0 ? 0 : 30;
              }

              room.lastActionMessage = `הגדרות המשחק עודכנו (זמן: ${
                room.settings.turnDuration === 0 ? 'ללא מגבלה ∞' : room.settings.turnDuration + ' שנ׳'
              }, פתיחה: ${room.settings.minInitialMeld === 0 ? 'ללא מגבלה' : room.settings.minInitialMeld + ' נק׳'}).`;
              broadcastRoom(room);
            }
            break;
          }

          case 'JOIN_ROOM': {
            const cleanCode = validateRoomCode(message.roomId);
            if (!cleanCode) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'קוד חדר לא תקין. יש להזין 4-8 אותיות או מספרים.' }));
              return;
            }

            const targetRoom = rooms.get(cleanCode);
            if (!targetRoom) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'חדר לא נמצא. אנא ודא את הקוד שהזנת.' }));
              return;
            }

            const cleanName = sanitizeText(message.playerName, 20, `שחקן ${targetRoom.players.length + 1}`);
            const cleanAvatar = validateAvatar(message.avatar, '🦊');

            // If player reconnecting with existing ID or name
            const existing = targetRoom.players.find(
              (p) => (message.playerId && p.id === message.playerId) || (!p.isBot && p.name === cleanName)
            );

            if (existing) {
              existing.ws = ws;
              existing.isConnected = true;
              currentRoomId = targetRoom.id;
              currentPlayerId = existing.id;
              sendToPlayer(existing, {
                type: 'ROOM_JOINED',
                roomId: targetRoom.id,
                playerId: existing.id,
              });
              broadcastRoom(targetRoom);
              return;
            }

            if (targetRoom.status === 'playing') {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'המשחק בחדר זה כבר החל.' }));
              return;
            }

            if (targetRoom.players.length >= targetRoom.settings.maxPlayers) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'החדר מלא (מקסימום 4 שחקנים).' }));
              return;
            }

            const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const newPlayer: ServerPlayer = {
              id: playerId,
              name: cleanName,
              avatar: cleanAvatar,
              isHost: false,
              isBot: false,
              tileCount: 0,
              hasInitialMeld: false,
              score: 0,
              isConnected: true,
              rack: [],
              ws,
            };

            targetRoom.players.push(newPlayer);
            currentRoomId = targetRoom.id;
            currentPlayerId = playerId;

            sendToPlayer(newPlayer, {
              type: 'ROOM_JOINED',
              roomId: targetRoom.id,
              playerId,
            });
            targetRoom.lastActionMessage = `${newPlayer.name} הצטרף למשחק!`;
            broadcastRoom(targetRoom);
            break;
          }

          case 'ADD_BOT': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'חדר לא מזוהה.' }));
              return;
            }

            const room = rooms.get(targetRoomId);
            if (!room) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'חדר לא נמצא.' }));
              return;
            }

            if (room.status !== 'waiting') {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'לא ניתן להוסיף בוט לאחר שהמשחק החל.' }));
              return;
            }

            // OWASP Access control: only host can add bots
            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            if (sender && !sender.isHost) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'רק מנהל החדר רשאי להוסיף שחקני בוט.' }));
              return;
            }

            if (room.players.length >= room.settings.maxPlayers) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'החדר מלא (מקסימום 4 שחקנים).' }));
              return;
            }

            const botAvatars = ['🤖', '🦾', '👾', '🧙‍♂️'];
            const botNames = ['רומי-בוט', 'מחשב אלפא', 'רובוט חכם', 'אלוף הרומי'];
            const botIndex = room.players.filter((p) => p.isBot).length;
            const botId = `bot_${Date.now()}_${botIndex}`;

            const botPlayer: ServerPlayer = {
              id: botId,
              name: botNames[botIndex % botNames.length],
              avatar: botAvatars[botIndex % botAvatars.length],
              isHost: false,
              isBot: true,
              tileCount: 0,
              hasInitialMeld: false,
              score: 0,
              isConnected: true,
              rack: [],
              ws: null,
            };

            room.players.push(botPlayer);
            room.lastActionMessage = `${botPlayer.name} נוסף למשחק.`;
            broadcastRoom(room);
            break;
          }

          case 'REMOVE_PLAYER': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) return;
            const room = rooms.get(targetRoomId);
            if (!room || room.status !== 'waiting') return;

            // OWASP Access control: only host can remove players
            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            if (!sender?.isHost) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'רק מנהל החדר רשאי להסיר שחקנים.' }));
              return;
            }

            const { targetPlayerId } = message;
            const idx = room.players.findIndex((p) => p.id === targetPlayerId);
            if (idx !== -1) {
              const removed = room.players.splice(idx, 1)[0];
              room.lastActionMessage = `${removed.name} הוסר מהחדר.`;
              broadcastRoom(room);
            }
            break;
          }

          case 'START_GAME': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) return;
            const room = rooms.get(targetRoomId);
            if (!room || room.status === 'playing') return;

            // OWASP Access control: only host can start
            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            if (!sender?.isHost) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'רק מנהל החדר רשאי להתחיל את המשחק.' }));
              return;
            }

            if (room.players.length < 2) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'דרושים לפחות 2 שחקנים להתחלת המשחק (ניתן להוסיף בוט).' }));
              return;
            }

            // Sync any updated settings sent with start
            if (message.settings) {
              if (message.settings.turnDuration !== undefined) {
                room.settings.turnDuration =
                  message.settings.turnDuration === 0
                    ? 0
                    : Math.min(180, Math.max(30, Number(message.settings.turnDuration) || 60));
              }
              if (message.settings.minInitialMeld !== undefined) {
                room.settings.minInitialMeld = message.settings.minInitialMeld === 0 ? 0 : 30;
              }
            }

            // Create and shuffle standard 106 deck
            const fullDeck = createFullDeck();

            // Deal 14 tiles to each player
            for (const player of room.players) {
              player.rack = fullDeck.splice(0, 14);
              player.hasInitialMeld = false;
            }

            room.pool = fullDeck;
            room.board = [];
            room.status = 'playing';
            room.winnerId = undefined;
            room.currentTurnIndex = 0;
            room.lastActionMessage = `המשחק התחיל! 14 אריחים חולקו לכל שחקן.`;

            broadcastRoom(room);
            startTurnTimer(room);
            break;
          }

          case 'RESTART_GAME': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) return;
            const room = rooms.get(targetRoomId);
            if (!room) return;

            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            if (!sender?.isHost) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'רק מנהל החדר רשאי להתחיל סיבוב חדש.' }));
              return;
            }

            const fullDeck = createFullDeck();
            for (const player of room.players) {
              player.rack = fullDeck.splice(0, 14);
              player.hasInitialMeld = false;
            }

            room.pool = fullDeck;
            room.board = [];
            room.status = 'playing';
            room.winnerId = undefined;
            room.roundNumber++;
            room.currentTurnIndex = (room.roundNumber - 1) % room.players.length;
            room.lastActionMessage = `סיבוב חדש מס' ${room.roundNumber} החל!`;

            broadcastRoom(room);
            startTurnTimer(room);
            break;
          }

          case 'SYNC_BOARD': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            const targetPlayerId = sanitizeText(message.playerId, 50) || currentPlayerId;
            if (!targetRoomId || !targetPlayerId) return;

            const room = rooms.get(targetRoomId);
            if (!room || room.status !== 'playing') return;

            // OWASP: Only active player can sync board movements
            const activePlayer = room.players[room.currentTurnIndex];
            if (activePlayer.id !== targetPlayerId) return;

            const cleanBoard = sanitizeBoard(message.board);
            room.board = cleanBoard;

            for (const p of room.players) {
              if (p.id !== targetPlayerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({ type: 'LIVE_BOARD_UPDATE', board: cleanBoard }));
              }
            }
            break;
          }

          case 'FINISH_TURN': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            const targetPlayerId = sanitizeText(message.playerId, 50) || currentPlayerId;
            if (!targetRoomId || !targetPlayerId) return;

            const room = rooms.get(targetRoomId);
            if (!room || room.status !== 'playing') return;

            const activePlayer = room.players[room.currentTurnIndex];
            if (activePlayer.id !== targetPlayerId) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'זהו אינו תורך!' }));
              return;
            }

            const cleanBoard = sanitizeBoard(message.board);
            const cleanRack: Tile[] = Array.isArray(message.rack)
              ? (message.rack.map((t: any) => validateTile(t)).filter(Boolean) as Tile[])
              : [];

            // 1. Validate board
            const boardVal = validateBoard(cleanBoard);
            if (!boardVal.valid) {
              const err = boardVal.errors[0] || 'כל הסדרות על השולחן חייבות להכיל לפחות 3 אריחים חוקיים';
              ws.send(JSON.stringify({ type: 'ERROR', message: err }));
              return;
            }

            // 2. Must play at least one tile
            const initialRackCount = room.initialRackSnapshot.length;
            if (cleanRack.length >= initialRackCount) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  message: 'עליך להוריד לפחות אריח אחד מהיד, או לקחת אריח מהקופה אם אין לך מהלך.',
                })
              );
              return;
            }

            // 3. Initial meld check (30 points requirement)
            if (!activePlayer.hasInitialMeld) {
              if (room.settings.minInitialMeld === 0) {
                activePlayer.hasInitialMeld = true;
              } else {
                const meldResult = calculateInitialMeldPoints(
                  cleanBoard,
                  room.initialBoardSnapshot,
                  room.settings.minInitialMeld
                );

                if (meldResult.touchedExisting) {
                  ws.send(
                    JSON.stringify({
                      type: 'ERROR',
                      message: 'בפתיחה ראשונית אסור להשתמש באריחים שכבר נמצאים על הלוח! יש ליצור סדרות שלמות מהיד בלבד.',
                    })
                  );
                  return;
                }

                if (meldResult.points < room.settings.minInitialMeld) {
                  ws.send(
                    JSON.stringify({
                      type: 'ERROR',
                      message: `פתיחה ראשונית דורשת לפחות ${room.settings.minInitialMeld} נקודות מהיד (נוכחי: ${meldResult.points}).`,
                    })
                  );
                  return;
                }

                activePlayer.hasInitialMeld = true;
              }
            }

            // Normalize sets so runs are neatly sorted
            const normalizedBoard = cleanBoard.map((set) => {
              const res = validateSet(set.tiles);
              return {
                id: set.id,
                tiles: res.sortedTiles || set.tiles,
              };
            });

            // Valid turn
            room.board = normalizedBoard;
            activePlayer.rack = cleanRack;
            room.lastActionMessage = `${activePlayer.name} ביצע מהלך בהצלחה!`;

            if (activePlayer.rack.length === 0) {
              handlePlayerWin(room, activePlayer);
              return;
            }

            advanceToNextTurn(room);
            break;
          }

          case 'DRAW_TILE': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            const targetPlayerId = sanitizeText(message.playerId, 50) || currentPlayerId;
            if (!targetRoomId || !targetPlayerId) return;

            const room = rooms.get(targetRoomId);
            if (!room || room.status !== 'playing') return;

            const activePlayer = room.players[room.currentTurnIndex];
            if (activePlayer.id !== targetPlayerId) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'זהו אינו תורך!' }));
              return;
            }

            // Reset board and rack to start-of-turn snapshot
            room.board = JSON.parse(JSON.stringify(room.initialBoardSnapshot));
            activePlayer.rack = JSON.parse(JSON.stringify(room.initialRackSnapshot));

            if (room.pool.length > 0) {
              const drawn = room.pool.pop()!;
              activePlayer.rack.push(drawn);
              room.lastActionMessage = `${activePlayer.name} לקח אריח מהקופה.`;
            } else {
              room.lastActionMessage = `הקופה ריקה! ${activePlayer.name} העביר את התור.`;
            }

            advanceToNextTurn(room);
            break;
          }

          case 'RESET_TURN': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            const targetPlayerId = sanitizeText(message.playerId, 50) || currentPlayerId;
            if (!targetRoomId || !targetPlayerId) return;

            const room = rooms.get(targetRoomId);
            if (!room || room.status !== 'playing') return;

            const activePlayer = room.players[room.currentTurnIndex];
            if (activePlayer.id !== targetPlayerId) return;

            room.board = JSON.parse(JSON.stringify(room.initialBoardSnapshot));
            activePlayer.rack = JSON.parse(JSON.stringify(room.initialRackSnapshot));
            room.lastActionMessage = `${activePlayer.name} איפס את המהלך.`;

            broadcastRoom(room);
            break;
          }

          case 'SEND_REACTION': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            if (!targetRoomId) return;
            const room = rooms.get(targetRoomId);
            if (!room) return;

            const cleanEmoji = validateAvatar(message.emoji, '👏');
            const cleanText = sanitizeText(message.text, 40);

            const sender = room.players.find((p) => p.id === (message.playerId || currentPlayerId));
            if (sender) {
              broadcastToRoom(room, {
                type: 'PLAYER_REACTION',
                playerId: sender.id,
                playerName: sender.name,
                emoji: cleanEmoji,
                text: cleanText,
              });
            }
            break;
          }

          case 'LEAVE_ROOM': {
            const targetRoomId = validateRoomCode(message.roomId) || currentRoomId;
            const targetPlayerId = sanitizeText(message.playerId, 50) || currentPlayerId;
            if (!targetRoomId || !targetPlayerId) return;

            const room = rooms.get(targetRoomId);
            if (!room) return;

            const idx = room.players.findIndex((p) => p.id === targetPlayerId);
            if (idx !== -1) {
              const leaving = room.players.splice(idx, 1)[0];
              leaving.isConnected = false;
              leaving.ws = null;

              if (room.players.length === 0) {
                if (room.timerInterval) clearInterval(room.timerInterval);
                rooms.delete(targetRoomId);
              } else {
                if (leaving.isHost) {
                  const nextHost = room.players.find((p) => !p.isBot) || room.players[0];
                  if (nextHost) nextHost.isHost = true;
                }
                if (room.status === 'playing' && room.currentTurnIndex >= room.players.length) {
                  room.currentTurnIndex = 0;
                }
                room.lastActionMessage = `${leaving.name} עזב את המשחק.`;
                broadcastRoom(room);
              }
            }
            currentRoomId = null;
            currentPlayerId = null;
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket processing error:', err);
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (currentRoomId && currentPlayerId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          const player = room.players.find((p) => p.id === currentPlayerId);
          if (player) {
            player.isConnected = false;
            player.ws = null;
            room.lastActionMessage = `${player.name} התנתק.`;
            broadcastRoom(room);
          }
        }
      }
    });
  });

  // REST API Endpoints for redundancy & health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), activeRooms: rooms.size });
  });

  app.get('/api/room/:code/sync', (req, res) => {
    const code = validateRoomCode(req.params.code);
    if (!code || !rooms.has(code)) {
      return res.status(404).json({ error: 'חדר לא נמצא' });
    }
    const room = rooms.get(code)!;
    const forPlayerId = typeof req.query.playerId === 'string' ? req.query.playerId : '';
    return res.json({
      state: getSanitizedGameState(room, forPlayerId),
    });
  });

  // Vite dev server or static in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Rummikub server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
