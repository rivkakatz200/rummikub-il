/**
 * OWASP-Compliant Security Utilities for Rummikub Web Application
 * Covers input sanitization, XSS mitigation, prototype pollution prevention,
 * strict schema validation, and rate limiting.
 */

import { Tile, TileColor, TileSet } from '../types/rummikub';

export const ALLOWED_AVATARS = new Set([
  '🦁', '🦊', '🐼', '🦉', '🐯', '🦄', '🧙‍♂️', '👑', '🚀', '🐱', '🤖', '🦾', '👾', '🎲', '🐶', '🐵'
]);

export const VALID_COLORS: Set<TileColor> = new Set(['black', 'blue', 'red', 'yellow']);

/**
 * Sanitizes text input to prevent XSS (Cross-Site Scripting) and injection.
 * Strips HTML tags, script protocols, control characters, and enforces strict length.
 */
export function sanitizeText(input: unknown, maxLength = 24, fallback = ''): string {
  if (typeof input !== 'string') return fallback;

  // Remove control chars, null bytes, HTML tags, and dangerous javascript: schemes
  let clean = input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .trim();

  // Strip excessive whitespace
  clean = clean.replace(/\s+/g, ' ');

  if (clean.length === 0) return fallback;
  return clean.slice(0, maxLength);
}

/**
 * Validates and normalizes room codes to prevent path traversal or injection.
 * Room codes must be strictly uppercase alphanumeric, 4 to 8 characters.
 */
export function validateRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(clean)) {
    return null;
  }
  return clean;
}

/**
 * Validates avatar against strict whitelist
 */
export function validateAvatar(input: unknown, fallback = '🦁'): string {
  if (typeof input !== 'string') return fallback;
  return ALLOWED_AVATARS.has(input) ? input : fallback;
}

/**
 * Validates an individual Tile structure to prevent prototype pollution or synthetic invalid tiles.
 */
export function validateTile(tile: any): Tile | null {
  if (!tile || typeof tile !== 'object') return null;

  // Safe prototype pollution guard (checks own properties, not prototype chain)
  if (
    Object.prototype.hasOwnProperty.call(tile, '__proto__') ||
    Object.prototype.hasOwnProperty.call(tile, 'constructor') ||
    Object.prototype.hasOwnProperty.call(tile, 'prototype')
  ) {
    return null;
  }

  const { id, color, number, isJoker } = tile;

  if (typeof id !== 'string' || id.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }

  if (!VALID_COLORS.has(color)) {
    return null;
  }

  const num = Number(number);
  if (!Number.isInteger(num) || num < 0 || num > 13) {
    return null;
  }

  return {
    id,
    color,
    number: num,
    isJoker: Boolean(isJoker),
  };
}

/**
 * Validates a TileSet structure
 */
export function validateTileSet(set: any): TileSet | null {
  if (!set || typeof set !== 'object') return null;

  // Safe prototype pollution guard
  if (
    Object.prototype.hasOwnProperty.call(set, '__proto__') ||
    Object.prototype.hasOwnProperty.call(set, 'constructor') ||
    Object.prototype.hasOwnProperty.call(set, 'prototype')
  ) {
    return null;
  }

  if (typeof set.id !== 'string' || set.id.length > 50) return null;
  if (!Array.isArray(set.tiles)) return null;

  const validTiles: Tile[] = [];
  for (const t of set.tiles) {
    const validTile = validateTile(t);
    if (!validTile) return null;
    validTiles.push(validTile);
  }

  return {
    id: sanitizeText(set.id, 50, `set_${Date.now()}`),
    tiles: validTiles,
  };
}

/**
 * Validates an array of TileSets (the board)
 */
export function sanitizeBoard(rawBoard: unknown): TileSet[] {
  if (!Array.isArray(rawBoard)) return [];
  const cleanBoard: TileSet[] = [];

  for (const item of rawBoard) {
    const validSet = validateTileSet(item);
    if (validSet && validSet.tiles.length > 0) {
      cleanBoard.push(validSet);
    }
  }

  return cleanBoard;
}

/**
 * Rate Limiter to prevent DoS or WebSocket flooding (OWASP A04:2021)
 */
export class RateLimiter {
  private messageTimestamps: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 40, windowMs = 3000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public isAllowed(clientId: string): boolean {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(clientId) || [];

    // Filter out timestamps outside window
    const recent = timestamps.filter((t) => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false;
    }

    recent.push(now);
    this.messageTimestamps.set(clientId, recent);
    return true;
  }

  public cleanup(clientId: string) {
    this.messageTimestamps.delete(clientId);
  }
}
