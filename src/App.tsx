/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Tile, TileSet, RoomSettings } from './types/rummikub';
import { BoardView } from './components/BoardView';
import { PlayerRack } from './components/PlayerRack';
import { OpponentRack } from './components/OpponentRack';
import { GameControls } from './components/GameControls';
import { LobbyView } from './components/LobbyView';
import { RulesModal } from './components/RulesModal';
import { RoundEndModal } from './components/RoundEndModal';
import { ReactionsBar } from './components/ReactionsBar';
import { FaceDownTile } from './components/TileView';
import { Watermark } from './components/Watermark';
import {
  playTileClick,
  playTilePlace,
  playDrawTile,
  playYourTurnSound,
  playErrorSound,
  playSuccessSound,
  toggleSound,
  isSoundEnabled,
} from './utils/audio';
import { autoMergeBoardSets } from './utils/rummikubRules';
import {
  BookOpen,
  Volume2,
  VolumeX,
  LogOut,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Infinity,
  Sparkles,
} from 'lucide-react';
import { sanitizeText, validateRoomCode } from './utils/security';

export default function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(() => {
    return sessionStorage.getItem('rummi_my_player_id');
  });

  // Local working state during player's turn
  const [localBoard, setLocalBoard] = useState<TileSet[]>([]);
  const [localRack, setLocalRack] = useState<Tile[]>([]);
  const [initialTurnBoard, setInitialTurnBoard] = useState<TileSet[]>([]);
  const [initialTurnRack, setInitialTurnRack] = useState<Tile[]>([]);
  // Set of tile IDs that were on the board at turn start — these must never enter the rack
  const [boardOriginTileIds, setBoardOriginTileIds] = useState<Set<string>>(new Set());

  // Selection state
  const [selectedTile, setSelectedTile] = useState<{
    tile: Tile;
    source: 'rack' | 'board';
    fromSetId?: string;
    fromIndex?: number;
  } | null>(null);

  // Modals & UI
  const [rulesOpen, setRulesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [latestReactions, setLatestReactions] = useState<
    Record<string, { emoji: string; text?: string }>
  >({});

  // Draw animation state (Requirement 1)
  const [isDrawingAnimation, setIsDrawingAnimation] = useState(false);

  // URL room code directly on mount
  const [urlRoomCode, setUrlRoomCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.toUpperCase().trim() || '';
    }
    return '';
  });

  const isStartingSoloBotRef = useRef<boolean>(false);
  const soloSettingsRef = useRef<RoomSettings | null>(null);
  const isExplicitlyLeavingRef = useRef<boolean>(false);
  const previousTurnIndexRef = useRef<number | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = useCallback((msg: string) => {
    playErrorSound();
    setErrorToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setErrorToast(null);
    }, 4500);
  }, []);

  // Connect WebSocket with robust reconnection & session resume
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsConnected(true);
      setWs(socket);

      // Reconnect session only if not explicitly leaving
      if (!isExplicitlyLeavingRef.current) {
        const savedRoomId = sessionStorage.getItem('rummi_current_room_id');
        const savedPlayerId = sessionStorage.getItem('rummi_my_player_id');
        if (savedRoomId && savedPlayerId) {
          socket.send(
            JSON.stringify({
              type: 'RECONNECT_SESSION',
              roomId: savedRoomId,
              playerId: savedPlayerId,
            })
          );
        }
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ROOM_CREATED': {
            setMyPlayerId(msg.playerId);
            sessionStorage.setItem('rummi_my_player_id', msg.playerId);
            sessionStorage.setItem('rummi_current_room_id', msg.roomId);

            if (isStartingSoloBotRef.current) {
              isStartingSoloBotRef.current = false;
              const settingsPayload = soloSettingsRef.current;
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    type: 'ADD_BOT',
                    roomId: msg.roomId,
                    playerId: msg.playerId,
                  })
                );
                setTimeout(() => {
                  socket.send(
                    JSON.stringify({
                      type: 'START_GAME',
                      roomId: msg.roomId,
                      playerId: msg.playerId,
                      settings: settingsPayload,
                    })
                  );
                }, 300);
              }, 200);
            }
            break;
          }

          case 'ROOM_JOINED': {
            setMyPlayerId(msg.playerId);
            sessionStorage.setItem('rummi_my_player_id', msg.playerId);
            sessionStorage.setItem('rummi_current_room_id', msg.roomId);
            break;
          }

          case 'ROOM_STATE': {
            const newState: GameState = msg.state;
            setGameState(newState);
            if (newState.roomId) {
              sessionStorage.setItem('rummi_current_room_id', newState.roomId);
            }

            const currentPId = myPlayerId || sessionStorage.getItem('rummi_my_player_id');
            const myPlayer = newState.players.find((p) => p.id === currentPId);
            const isMyTurnNow =
              newState.status === 'playing' &&
              newState.players[newState.currentTurnIndex]?.id === myPlayer?.id;

            const statusChangedToPlaying =
              previousStatusRef.current !== 'playing' && newState.status === 'playing';
            previousStatusRef.current = newState.status;
            const turnChanged = previousTurnIndexRef.current !== newState.currentTurnIndex;

            // Turn change or transition from lobby into playing
            if (turnChanged || statusChangedToPlaying) {
              previousTurnIndexRef.current = newState.currentTurnIndex;
              if (isMyTurnNow) {
                playYourTurnSound();
              }
              // Reset local working copy to authoritative state
              setLocalBoard(JSON.parse(JSON.stringify(newState.board)));
              setInitialTurnBoard(JSON.parse(JSON.stringify(newState.board)));
              // Snapshot all tile IDs currently on the board — these are "board-origin" tiles
              const boardIds = new Set<string>(
                newState.board.flatMap((s) => s.tiles.map((t) => t.id))
              );
              setBoardOriginTileIds(boardIds);
              if (myPlayer?.rack) {
                setLocalRack(JSON.parse(JSON.stringify(myPlayer.rack)));
                setInitialTurnRack(JSON.parse(JSON.stringify(myPlayer.rack)));
              }
              setSelectedTile(null);
            } else if (!isMyTurnNow) {
              setLocalBoard(newState.board);
              if (myPlayer?.rack) {
                setLocalRack(myPlayer.rack);
              }
            } else {
              if (localRack.length === 0 && myPlayer?.rack && myPlayer.rack.length > 0) {
                setLocalRack(myPlayer.rack);
                setInitialTurnRack(myPlayer.rack);
              }
            }
            break;
          }

          case 'TURN_TICK': {
            setGameState((prev) => (prev ? { ...prev, turnTimeLeft: msg.timeLeft } : prev));
            break;
          }

          case 'LIVE_BOARD_UPDATE': {
            setLocalBoard(msg.board);
            break;
          }

          case 'PLAYER_REACTION': {
            setLatestReactions((prev) => ({
              ...prev,
              [msg.playerId]: { emoji: msg.emoji, text: msg.text },
            }));
            setTimeout(() => {
              setLatestReactions((prev) => {
                const next = { ...prev };
                delete next[msg.playerId];
                return next;
              });
            }, 3000);
            break;
          }

          case 'ERROR': {
            showError(msg.message);
            break;
          }
        }
      } catch (e) {
        console.error('Error handling ws message:', e);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setWs(null);
      // Reconnect after 1.5s only if not intentionally left
      if (!isExplicitlyLeavingRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 1500);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [myPlayerId, showError]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket]);

  // Dual-Sync Heartbeat Polling
  useEffect(() => {
    if (!gameState?.roomId || !myPlayerId || isExplicitlyLeavingRef.current) return;

    const interval = setInterval(async () => {
      try {
        const curPid = myPlayerId || sessionStorage.getItem('rummi_my_player_id') || '';
        const res = await fetch(`/api/room/${gameState.roomId}/sync?playerId=${encodeURIComponent(curPid)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.state) {
            setGameState((prev) => {
              if (
                !prev ||
                prev.players.length !== data.state.players.length ||
                prev.status !== data.state.status ||
                prev.currentTurnIndex !== data.state.currentTurnIndex
              ) {
                return data.state;
              }
              return prev;
            });
          }
        }
      } catch {
        // Silent catch for polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [gameState?.roomId, myPlayerId]);

  // Player details
  const myPlayer = gameState?.players.find((p) => p.id === myPlayerId);
  const isHost = myPlayer?.isHost ?? false;
  const isMyTurn =
    gameState?.status === 'playing' &&
    gameState.players[gameState.currentTurnIndex]?.id === myPlayerId;

  // Broadcast board movement live
  const broadcastLiveBoard = (newBoard: TileSet[]) => {
    if (ws && ws.readyState === WebSocket.OPEN && gameState && isMyTurn) {
      ws.send(
        JSON.stringify({
          type: 'SYNC_BOARD',
          roomId: gameState.roomId,
          playerId: myPlayerId,
          board: newBoard,
        })
      );
    }
  };

  // Actions
  const handleCreateRoom = (playerName: string, avatar: string, settings: RoomSettings) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showError('חיבור לשרת מתבצע, אנא נסה שוב בעוד רגע...');
      return;
    }
    isExplicitlyLeavingRef.current = false;
    ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: sanitizeText(playerName, 20),
        avatar,
        settings,
      })
    );
  };

  const handleStartSoloBotGame = (
    playerName: string,
    avatar: string,
    settings: RoomSettings
  ) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showError('חיבור לשרת מתבצע, אנא נסה שוב בעוד רגע...');
      return;
    }
    isExplicitlyLeavingRef.current = false;
    isStartingSoloBotRef.current = true;
    soloSettingsRef.current = {
      maxPlayers: 2,
      turnDuration: settings.turnDuration,
      minInitialMeld: settings.minInitialMeld,
    };
    ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: sanitizeText(playerName, 20),
        avatar,
        settings: {
          maxPlayers: 2,
          turnDuration: settings.turnDuration,
          minInitialMeld: settings.minInitialMeld,
        },
      })
    );
  };

  const handleUpdateSettings = (newSettings: RoomSettings) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !gameState?.roomId) return;
    ws.send(
      JSON.stringify({
        type: 'UPDATE_SETTINGS',
        roomId: gameState.roomId,
        playerId: myPlayerId,
        settings: newSettings,
      })
    );
  };

  const handleToggleInGameTimer = (newDuration: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !gameState?.roomId) return;
    playTileClick();
    ws.send(
      JSON.stringify({
        type: 'UPDATE_SETTINGS',
        roomId: gameState.roomId,
        playerId: myPlayerId,
        settings: {
          turnDuration: newDuration,
        },
      })
    );
  };

  const handleToggleInGameMinMeld = (newMinMeld: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !gameState?.roomId) return;
    playTileClick();
    ws.send(
      JSON.stringify({
        type: 'UPDATE_SETTINGS',
        roomId: gameState.roomId,
        playerId: myPlayerId,
        settings: {
          minInitialMeld: newMinMeld,
        },
      })
    );
  };

  const handleJoinRoom = (roomId: string, playerName: string, avatar: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showError('חיבור לשרת מתבצע, אנא נסה שוב בעוד רגע...');
      return;
    }
    isExplicitlyLeavingRef.current = false;
    const cleanRoomCode = validateRoomCode(roomId);
    if (!cleanRoomCode) {
      showError('קוד חדר לא תקין.');
      return;
    }
    ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: cleanRoomCode,
        playerId: myPlayerId,
        playerName: sanitizeText(playerName, 20),
        avatar,
      })
    );
  };

  const handleAddBot = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showError('חיבור לשרת מתבצע...');
      return;
    }
    playTileClick();
    ws.send(
      JSON.stringify({
        type: 'ADD_BOT',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
      })
    );
  };

  const handleRemovePlayer = (targetPlayerId: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'REMOVE_PLAYER',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
        targetPlayerId,
      })
    );
  };

  const handleStartGame = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    playTilePlace();
    ws.send(
      JSON.stringify({
        type: 'START_GAME',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
        settings: {
          turnDuration: gameState?.maxTurnTime,
          minInitialMeld: gameState?.minInitialMeld,
        },
      })
    );
  };

  const handleRestartGame = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'RESTART_GAME',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
      })
    );
  };

  // Exit Room (Requirement 4: complete disconnect, never reconnecting)
  const handleLeaveRoom = () => {
    isExplicitlyLeavingRef.current = true;

    if (ws && ws.readyState === WebSocket.OPEN && gameState?.roomId) {
      ws.send(
        JSON.stringify({
          type: 'LEAVE_ROOM',
          roomId: gameState.roomId,
          playerId: myPlayerId,
        })
      );
    }

    sessionStorage.removeItem('rummi_my_player_id');
    sessionStorage.removeItem('rummi_current_room_id');
    setMyPlayerId(null);
    setGameState(null);

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setUrlRoomCode('');
    setSelectedTile(null);
  };

  const handleSendReaction = (emoji: string, text?: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'SEND_REACTION',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
        emoji,
        text: sanitizeText(text, 40),
      })
    );
  };

  // Tile Selection & Manipulation (Requirement 7: Drag & drop freely between sets)
  const handleTileSelect = (
    tile: Tile,
    source: 'rack' | 'board',
    fromSetId?: string,
    fromIndex?: number
  ) => {
    if (selectedTile && selectedTile.tile.id === tile.id) {
      setSelectedTile(null);
      return;
    }
    setSelectedTile({ tile, source, fromSetId, fromIndex });
  };

  const handleMoveTileToSet = (targetSetId: string, insertIndex?: number) => {
    if (!selectedTile || !isMyTurn) return;

    const { tile, source, fromSetId } = selectedTile;

    if (source === 'rack') {
      const newRack = localRack.filter((t) => t.id !== tile.id);
      setLocalRack(newRack);

      const newBoard = localBoard.map((set) => {
        if (set.id === targetSetId) {
          const tiles = [...set.tiles];
          const pos = insertIndex !== undefined ? insertIndex : tiles.length;
          tiles.splice(pos, 0, tile);
          return { ...set, tiles };
        }
        return set;
      });

      setLocalBoard(newBoard);
      broadcastLiveBoard(newBoard);
      setSelectedTile(null);
      playTilePlace();
    } else if (source === 'board' && fromSetId) {
      if (fromSetId === targetSetId) {
        const newBoard = localBoard.map((set) => {
          if (set.id === targetSetId) {
            const tiles = set.tiles.filter((t) => t.id !== tile.id);
            const pos = insertIndex !== undefined ? insertIndex : tiles.length;
            tiles.splice(pos, 0, tile);
            return { ...set, tiles };
          }
          return set;
        });
        setLocalBoard(newBoard);
        broadcastLiveBoard(newBoard);
        setSelectedTile(null);
        playTilePlace();
      } else {
        let newBoard = localBoard.map((set) => {
          if (set.id === fromSetId) {
            return { ...set, tiles: set.tiles.filter((t) => t.id !== tile.id) };
          }
          if (set.id === targetSetId) {
            const tiles = [...set.tiles];
            const pos = insertIndex !== undefined ? insertIndex : tiles.length;
            tiles.splice(pos, 0, tile);
            return { ...set, tiles };
          }
          return set;
        });

        newBoard = newBoard.filter((set) => set.tiles.length > 0);
        setLocalBoard(newBoard);
        broadcastLiveBoard(newBoard);
        setSelectedTile(null);
        playTilePlace();
      }
    }
  };

  const handleCreateNewSetWithTile = (tileArg?: Tile) => {
    const tileToUse = tileArg || (selectedTile ? selectedTile.tile : null);
    if (!tileToUse || !isMyTurn) return;

    const source = selectedTile ? selectedTile.source : 'rack';
    const fromSetId = selectedTile?.fromSetId;

    if (source === 'rack') {
      const newRack = localRack.filter((t) => t.id !== tileToUse.id);
      setLocalRack(newRack);
    }

    let newBoard = [...localBoard];
    if (source === 'board' && fromSetId) {
      newBoard = newBoard
        .map((s) => (s.id === fromSetId ? { ...s, tiles: s.tiles.filter((t) => t.id !== tileToUse.id) } : s))
        .filter((s) => s.tiles.length > 0);
    }

    const newSet: TileSet = {
      id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tiles: [tileToUse],
    };

    newBoard.push(newSet);
    setLocalBoard(newBoard);
    broadcastLiveBoard(newBoard);
    setSelectedTile(null);
    playTilePlace();
  };

  const handlePlayMultipleTilesToNewSet = (tilesToPlay: Tile[]) => {
    if (!tilesToPlay || tilesToPlay.length === 0 || !isMyTurn) return;

    const playIds = new Set(tilesToPlay.map((t) => t.id));
    const newRack = localRack.filter((t) => !playIds.has(t.id));
    setLocalRack(newRack);

    const newSet: TileSet = {
      id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tiles: [...tilesToPlay],
    };

    const newBoard = [...localBoard, newSet];
    setLocalBoard(newBoard);
    broadcastLiveBoard(newBoard);
    setSelectedTile(null);
    playTilePlace();
  };

  const handleReturnSetToRack = (setId: string) => {
    if (!isMyTurn) return;
    const set = localBoard.find((s) => s.id === setId);
    if (!set) return;

    // Bug fix: board-origin tiles must never enter the rack
    const hasBoardOriginTile = set.tiles.some((t) => boardOriginTileIds.has(t.id));
    if (hasBoardOriginTile) {
      showError('אריחים שהיו על השולחן לפני התור לא יכולים לחזור למעמד!');
      return;
    }

    const newBoard = localBoard.filter((s) => s.id !== setId);
    const newRack = [...localRack, ...set.tiles];

    setLocalBoard(newBoard);
    setLocalRack(newRack);
    broadcastLiveBoard(newBoard);
    playTileClick();
  };

  const handleAutoMergeSets = () => {
    if (!isMyTurn) return;
    const merged = autoMergeBoardSets(localBoard);
    setLocalBoard(merged);
    broadcastLiveBoard(merged);
    playTilePlace();
  };

  const handleSplitSet = (setId: string, atIndex: number) => {
    if (!isMyTurn) return;
    playTileClick();

    const targetSet = localBoard.find((s) => s.id === setId);
    if (!targetSet || atIndex <= 0 || atIndex >= targetSet.tiles.length) return;

    const part1 = targetSet.tiles.slice(0, atIndex);
    const part2 = targetSet.tiles.slice(atIndex);

    const set1: TileSet = { id: `${setId}_1`, tiles: part1 };
    const set2: TileSet = {
      id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      tiles: part2,
    };

    const newBoard = localBoard.flatMap((s) => (s.id === setId ? [set1, set2] : [s]));
    setLocalBoard(newBoard);
    broadcastLiveBoard(newBoard);
  };

  // Drag and drop between sets, from rack, or to empty space
  const handleDropOnBoard = (e: React.DragEvent, targetSetId?: string, targetIndex?: number) => {
    e.preventDefault();
    if (!isMyTurn) return;

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      const { tile, source, fromSetId } = data;

      if (!tile) return;

      if (targetSetId) {
        if (source === 'rack') {
          const newRack = localRack.filter((t) => t.id !== tile.id);
          setLocalRack(newRack);

          const newBoard = localBoard.map((s) => {
            if (s.id === targetSetId) {
              const tiles = [...s.tiles];
              const idx = targetIndex !== undefined ? targetIndex : tiles.length;
              tiles.splice(idx, 0, tile);
              return { ...s, tiles };
            }
            return s;
          });
          setLocalBoard(newBoard);
          broadcastLiveBoard(newBoard);
        } else if (source === 'board' && fromSetId) {
          let newBoard: TileSet[];
          if (fromSetId === targetSetId) {
            // Reorder within the same set — must be handled atomically in one pass
            newBoard = localBoard.map((s) => {
              if (s.id !== targetSetId) return s;
              const tiles = s.tiles.filter((t) => t.id !== tile.id);
              const idx = targetIndex !== undefined ? Math.min(targetIndex, tiles.length) : tiles.length;
              tiles.splice(idx, 0, tile);
              return { ...s, tiles };
            });
          } else {
            // Move from fromSetId to a different targetSetId
            newBoard = localBoard.map((s) => {
              if (s.id === fromSetId) {
                return { ...s, tiles: s.tiles.filter((t) => t.id !== tile.id) };
              }
              if (s.id === targetSetId) {
                const tiles = [...s.tiles];
                const idx = targetIndex !== undefined ? targetIndex : tiles.length;
                tiles.splice(idx, 0, tile);
                return { ...s, tiles };
              }
              return s;
            });
            newBoard = newBoard.filter((s) => s.tiles.length > 0);
          }
          setLocalBoard(newBoard);
          broadcastLiveBoard(newBoard);
        }
      } else {
        // Drop on empty table area -> creates a new set!
        if (source === 'rack') {
          const newRack = localRack.filter((t) => t.id !== tile.id);
          setLocalRack(newRack);
        }
        let newBoard = [...localBoard];
        if (source === 'board' && fromSetId) {
          newBoard = newBoard
            .map((s) => (s.id === fromSetId ? { ...s, tiles: s.tiles.filter((t) => t.id !== tile.id) } : s))
            .filter((s) => s.tiles.length > 0);
        }
        newBoard.push({
          id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tiles: [tile],
        });
        setLocalBoard(newBoard);
        broadcastLiveBoard(newBoard);
      }

      playTilePlace();
    } catch (err) {
      console.error('Drag drop error:', err);
    }
  };

  const handleDropOnRack = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    if (!isMyTurn) return;

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      const { tile, source, fromSetId } = data;

      if (source === 'board' && fromSetId && tile) {
        // Bug fix: board-origin tiles must never enter the rack
        if (boardOriginTileIds.has(tile.id)) {
          showError('אריחים שהיו על השולחן לפני התור לא יכולים לחזור למעמד!');
          return;
        }

        const newBoard = localBoard
          .map((s) => (s.id === fromSetId ? { ...s, tiles: s.tiles.filter((t) => t.id !== tile.id) } : s))
          .filter((s) => s.tiles.length > 0);

        setLocalBoard(newBoard);

        const newRack = [...localRack];
        if (targetIndex !== undefined && targetIndex >= 0) {
          newRack.splice(targetIndex, 0, tile);
        } else {
          newRack.push(tile);
        }
        setLocalRack(newRack);
        broadcastLiveBoard(newBoard);
        playTileClick();
      }
    } catch (err) {
      console.error('Drop on rack error:', err);
    }
  };

  const handleFinishTurn = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isMyTurn) return;

    // Bug fix: validate all sets have >= 3 tiles and are valid before ending turn
    const invalidSets = localBoard.filter((s) => s.tiles.length > 0 && s.tiles.length < 3);
    if (invalidSets.length > 0) {
      showError('יש סדרות עם פחות מ-3 אריחים על השולחן. תקן אותן או לחץ "איפוס מהלך".');
      return;
    }

    playSuccessSound();
    ws.send(
      JSON.stringify({
        type: 'FINISH_TURN',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
        board: localBoard,
        rack: localRack,
      })
    );
  };

  // Draw tile with smooth animation (Requirement 1)
  const handleDrawTile = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isMyTurn) return;

    playDrawTile();
    setIsDrawingAnimation(true);
    setTimeout(() => {
      setIsDrawingAnimation(false);
    }, 650);

    ws.send(
      JSON.stringify({
        type: 'DRAW_TILE',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
      })
    );
  };

  const handleResetTurn = () => {
    if (!isMyTurn) return;

    setLocalBoard(JSON.parse(JSON.stringify(initialTurnBoard)));
    setLocalRack(JSON.parse(JSON.stringify(initialTurnRack)));
    setSelectedTile(null);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'RESET_TURN',
        roomId: gameState?.roomId,
        playerId: myPlayerId,
      })
    );
  };

  const handleCopyRoomCode = () => {
    if (!gameState?.roomId) return;
    navigator.clipboard.writeText(gameState.roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // If in lobby or waiting
  if (!gameState || gameState.status === 'waiting') {
    return (
      <>
        <LobbyView
          gameState={gameState}
          isInRoom={Boolean(gameState && gameState.roomId)}
          myPlayerId={myPlayerId}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartSoloBotGame={handleStartSoloBotGame}
          onUpdateSettings={handleUpdateSettings}
          onAddBot={handleAddBot}
          onRemovePlayer={handleRemovePlayer}
          onStartGame={handleStartGame}
          onOpenRules={() => setRulesOpen(true)}
          initialRoomCode={urlRoomCode}
        />
        <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />
        <Watermark />
      </>
    );
  }

  // Active game view
  const opponents = gameState.players.filter((p) => p.id !== myPlayerId);
  const activePlayer = gameState.players[gameState.currentTurnIndex];

  return (
    // Single Screen Layout: Strictly 100vh max-height without scrolling (Requirement 5)
    <div
      className="h-screen max-h-screen w-screen overflow-hidden bg-[#08150e] flex flex-col justify-between text-stone-100 font-['Assistant',sans-serif] p-1.5 sm:p-2 box-border relative select-none"
      dir="rtl"
    >
      {/* Tile Draw Flying Animation (Requirement 1) */}
      {isDrawingAnimation && (
        <div className="fixed top-12 left-1/4 z-50 animate-tile-draw pointer-events-none drop-shadow-2xl">
          <FaceDownTile size="md" />
        </div>
      )}

      {/* Toast Error Alert */}
      {errorToast && (
        <div className="fixed top-4 inset-x-4 max-w-sm mx-auto z-50 animate-bounce">
          <div className="bg-red-950/95 border-2 border-red-500 rounded-xl p-2.5 shadow-2xl flex items-center gap-2 text-red-200 text-xs font-bold backdrop-blur-md">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1 truncate">{errorToast}</span>
          </div>
        </div>
      )}

      {/* Top Navbar (Compact height: ~40px) */}
      <header className="w-full flex items-center justify-between px-2 sm:px-3 py-1 bg-stone-950/85 rounded-xl border border-stone-800 shadow-md shrink-0 h-10 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg sm:text-xl font-black font-['Fredoka'] text-amber-300 drop-shadow">
            רומיקוב
          </span>

          {/* Room Code Badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-stone-900 border border-stone-800 text-xs font-mono font-bold text-amber-300">
            <span className="text-stone-400 font-sans text-[10px]">חדר:</span>
            <span>{gameState.roomId}</span>
            <button
              onClick={handleCopyRoomCode}
              className="p-0.5 hover:text-white transition"
              title="העתק קוד חדר"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Center Live Turn Status Bar */}
        {/* Center Live Turn Status Bar */}
        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-stone-900/90 border border-stone-800 text-xs font-bold">
          <span className="text-stone-400 text-[11px]">תור:</span>
          <span className="text-amber-300 flex items-center gap-1">
            <span>{activePlayer?.avatar}</span>
            <span className="max-w-[120px] truncate">{activePlayer?.id === myPlayerId ? 'אתה!' : activePlayer?.name}</span>
          </span>
        </div>

        {/* Action icons & In-Game Quick Setting Toggles */}
        <div className="flex items-center gap-1">
          {/* Quick Timer Toggle Button */}
          <button
            onClick={() => handleToggleInGameTimer(gameState.maxTurnTime === 0 ? 60 : 0)}
            className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition active:scale-95 ${
              gameState.maxTurnTime === 0
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30'
                : 'bg-stone-900 border-stone-800 text-stone-300 hover:text-white'
            }`}
            title="לחץ להחלפה בין ללא הגבלת זמן לבין 60 שניות"
          >
            {gameState.maxTurnTime === 0 ? (
              <>
                <Infinity className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden lg:inline">זמן: ללא מגבלה</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline">זמן: {gameState.turnTimeLeft}ש</span>
              </>
            )}
          </button>

          {/* Quick Meld Toggle Button */}
          <button
            onClick={() => handleToggleInGameMinMeld(gameState.minInitialMeld === 0 ? 30 : 0)}
            className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition active:scale-95 ${
              gameState.minInitialMeld === 0
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-stone-900 border-stone-800 text-stone-300 hover:text-white'
            }`}
            title="לחץ להחלפה בין פתיחה ללא מגבלה לבין פתיחה של 30 נקודות"
          >
            {gameState.minInitialMeld === 0 ? (
              <span className="hidden lg:inline">פתיחה: ללא מגבלה</span>
            ) : (
              <span className="hidden lg:inline">פתיחה: 30 נק׳</span>
            )}
          </button>

          <ReactionsBar onSendReaction={handleSendReaction} />

          <button
            onClick={() => setSoundOn(toggleSound())}
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 transition"
            title={soundOn ? 'השתק צליל' : 'הפעל צליל'}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
          </button>

          <button
            onClick={() => setRulesOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-amber-300 font-bold text-xs flex items-center gap-1 transition"
            title="הוראות משחק"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">הוראות</span>
          </button>

          {/* Proper Exit Disconnection Button (Requirement 4) */}
          <button
            onClick={handleLeaveRoom}
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-red-950/80 border border-stone-800 hover:border-red-700 text-stone-400 hover:text-red-300 transition"
            title="יציאה מהמשחק (התנתקות מיידית)"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Opponents Physical Black Racks Row (Requirements 5 & 6) */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mb-1 shrink-0">
        {opponents.map((opp) => (
          <OpponentRack
            key={opp.id}
            player={opp}
            isCurrentTurn={gameState.players[gameState.currentTurnIndex]?.id === opp.id}
            turnTimeLeft={gameState.turnTimeLeft}
            maxTurnTime={gameState.maxTurnTime}
            latestReaction={latestReactions[opp.id]}
          />
        ))}
      </div>

      {/* Table Center Felt Area (BoardView with visual Pool & Set manipulation) */}
      <div className="flex-1 min-h-0 w-full relative mb-1 flex flex-col">
        <BoardView
          board={localBoard}
          isMyTurn={isMyTurn}
          poolCount={gameState.poolCount}
          selectedTile={selectedTile}
          onTileSelect={handleTileSelect}
          onMoveTileToSet={handleMoveTileToSet}
          onCreateNewSetWithTile={handleCreateNewSetWithTile}
          onSplitSet={handleSplitSet}
          onDropTile={handleDropOnBoard}
          onDrawTileFromPool={handleDrawTile}
          onReturnSetToRack={handleReturnSetToRack}
          onAutoMergeSets={handleAutoMergeSets}
        />
      </div>

      {/* Bottom Area: Controls + Player Rack (Compact height) */}
      <div className="w-full flex flex-col gap-1 shrink-0">
        <GameControls
          isMyTurn={isMyTurn}
          turnTimeLeft={gameState.turnTimeLeft}
          maxTurnTime={gameState.maxTurnTime}
          poolCount={gameState.poolCount}
          hasInitialMeld={Boolean(myPlayer?.hasInitialMeld)}
          minInitialMeld={gameState.minInitialMeld}
          currentBoard={localBoard}
          initialBoard={initialTurnBoard}
          currentRack={localRack}
          initialRack={initialTurnRack}
          onFinishTurn={handleFinishTurn}
          onDrawTile={handleDrawTile}
          onResetTurn={handleResetTurn}
        />

        {/* 2-Tier Wooden Player Rack with Drag-and-Drop manual sorting (Requirement 3) */}
        <PlayerRack
          rack={localRack}
          isMyTurn={isMyTurn}
          selectedTile={selectedTile}
          onTileSelect={handleTileSelect}
          onUpdateRack={(newRack) => setLocalRack(newRack)}
          onPlaySelectedTileToNewSet={() => handleCreateNewSetWithTile()}
          onPlaySelectedTilesToNewSet={handlePlayMultipleTilesToNewSet}
          onDropOnRack={handleDropOnRack}
        />
      </div>

      {/* Rules Modal */}
      <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />

      {/* Round End Victory Celebration Modal */}
      <RoundEndModal
        isOpen={gameState.status === 'round_end'}
        winnerId={gameState.winnerId}
        players={gameState.players}
        onNextRound={handleRestartGame}
        onLeaveRoom={handleLeaveRoom}
        isHost={isHost}
      />
      <Watermark />
    </div>
  );
}
