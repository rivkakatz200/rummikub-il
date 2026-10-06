export type TileColor = 'black' | 'blue' | 'red' | 'yellow';

export interface Tile {
  id: string;
  color: TileColor;
  number: number; // 1-13, or 0 for joker
  isJoker?: boolean;
}

export interface TileSet {
  id: string;
  tiles: Tile[];
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isBot: boolean;
  tileCount: number;
  hasInitialMeld: boolean;
  score: number;
  isConnected: boolean;
  rack?: Tile[];
}

export interface RoomSettings {
  maxPlayers: number;
  turnDuration: number; // in seconds, default 60
  minInitialMeld: number; // default 30
}

export interface GameState {
  roomId: string;
  status: 'waiting' | 'playing' | 'round_end';
  players: Player[];
  currentTurnIndex: number;
  turnTimeLeft: number;
  maxTurnTime: number;
  board: TileSet[];
  poolCount: number;
  minInitialMeld: number;
  winnerId?: string;
  lastActionMessage?: string;
  roundNumber: number;
}

export interface PlayerActionPayload {
  roomId: string;
  playerId: string;
}

export interface FinishTurnPayload extends PlayerActionPayload {
  board: TileSet[];
  rack: Tile[];
}

export interface BoardUpdatePayload extends PlayerActionPayload {
  board: TileSet[];
}

export interface ReactionPayload {
  roomId: string;
  playerId: string;
  playerName: string;
  emoji: string;
  text?: string;
}
