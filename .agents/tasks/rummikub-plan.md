# Implementation Plan — Rummikub Bug Fixes

## Overview

Two bugs are fixed in sequence:
- **Bug A** — Turquoise tile highlight logic is broken (wrong tiles highlighted, suppressed on own turn)
- **Bug B** — Dead-socket placeholder tile persists forever in the rack

Order: types → server → client (App.tsx) → child components → test script.

---

## Bug A — Turquoise Highlight Fix

### A-1. Update `LastAction` type + add `recentActions` to `GameState`

**Files:** `src/types/rummikub.ts`

Changes:
- Add `recentActions: LastAction[]` to `GameState` (alongside existing `lastAction?: LastAction`; `lastAction` stays for the banner UI).
- Add `turnCounter` field to `GameState` (the monotonic integer, sent from server for debugging only — not used client-side for highlight logic, which uses `turnNumber` on each entry).

```ts
// In GameState, add:
recentActions: LastAction[];   // newest-first, up to 8 entries
```

**Verify:** `npm run lint` — no TypeScript errors.

---

### A-2. Add monotonic `turnCounter` to `ServerRoom` + update `recentActions` on server

**Files:** `server.ts`

Changes:

a) Add `turnCounter: number` field to the `ServerRoom` interface (starts at 0).

b) In `CREATE_ROOM` and `RESTART_GAME` handlers, initialise `turnCounter: 0` and `recentActions: []`.

c) In `START_GAME` handler, set `room.turnCounter = 0` and `room.recentActions = []`.

d) Extract a helper `recordAction(room, action: Omit<LastAction, 'turnNumber'>)`:
   - Increments `room.turnCounter` by 1.
   - Sets `action.turnNumber = room.turnCounter`.
   - Sets `room.lastAction = { ...action, turnNumber: room.turnCounter }`.
   - Prepends to `room.recentActions`, keeps only the last 8 (slice 0..8 after unshift).

e) Replace every direct assignment to `room.lastAction = { ..., turnNumber: room.roundNumber * 1000 + room.currentTurnIndex }` with a call to `recordAction(room, { playerId, playerName, type, placedTileIds })`. This covers:
   - `handleTurnTimeout` (draw)
   - `handleBotTurn` — both the play path and the `applyBotDraw` helper
   - `FINISH_TURN` handler (play)
   - `DRAW_TILE` handler (draw)

f) Add `recentActions: room.recentActions` to `getSanitizedGameState` return value.

**Verify:** `npm run typecheck:server` — no errors.

---

### A-3. Update client highlight logic in `App.tsx`

**Files:** `src/App.tsx`

Changes:

a) Add a ref `myLastCompletedTurnNumberRef = useRef<number>(-1)`.

b) In the `ROOM_STATE` handler, after updating `gameState`:
   - Find my own entries in `newState.recentActions` (where `action.playerId === currentPId`).
   - If any exist, update `myLastCompletedTurnNumberRef.current` to the maximum `turnNumber` among those entries.
   - (Do NOT reset this on reconnect — `-1` is the right initial value and will show all opponent actions after join.)

c) Compute `highlightedTileIds` in the render function:
   ```tsx
   const highlightedTileIds = useMemo(() => {
     if (!gameState?.recentActions?.length) return undefined;
     const myLastTurn = myLastCompletedTurnNumberRef.current;
     const ids = new Set<string>();
     for (const action of gameState.recentActions) {
       if (action.playerId !== myPlayerId && action.turnNumber > myLastTurn && action.type === 'play') {
         for (const id of action.placedTileIds) ids.add(id);
       }
     }
     return ids.size > 0 ? ids : undefined;
   }, [gameState?.recentActions, myPlayerId]);
   ```
   Remove the old inline expression: `!isMyTurn && gameState.lastAction?.type === 'play' ? new Set(gameState.lastAction.placedTileIds) : undefined`.

d) Pass `highlightedTileIds` to `<BoardView>` (already wired via prop — just swap the value).

**Verify:** `npm run lint` — no TypeScript errors.

---

## Bug B — Dead-Socket Placeholder Tile Fix

### B-1. Server: explicit ERROR responses for silent failures

**Files:** `server.ts`

Changes — replace `return;` (silent) with an error send + `console.log`:

**DRAW_TILE handler** (`case 'DRAW_TILE'`):
```
// Old:
const room = rooms.get(targetRoomId);
if (!room || room.status !== 'playing') return;
// after activePlayer check:
if (activePlayer.id !== targetPlayerId) { ws.send(ERROR not_your_turn); return; }
// pool empty path: add pool_empty error
```

Specific replacements:
- `if (!room || room.status !== 'playing') return;`  
  → Split: if `!room` → `ws.send({ type:'ERROR', code:'room_not_found', message:'החדר לא נמצא. המשחק אבד.' }); console.log('[DRAW_TILE] room not found:', targetRoomId); return;`  
  → If `room.status !== 'playing'` → `ws.send({ type:'ERROR', code:'not_your_turn', message:'המשחק אינו פעיל כרגע.' }); return;`
- After `if (activePlayer.id !== targetPlayerId)` the ERROR already exists — add `code: 'not_your_turn'` field to it and a `console.log`.
- After checking `pool.length > 0`: if pool is empty, currently it advances the turn (pass). Add before `advanceToNextTurn`: a separate path that first sends `ws.send({ type:'ERROR', code:'pool_empty', message:'הקופה ריקה...' })` — wait, the pool-empty path already does advance the turn and records an action. Keep that behaviour (it's correct game logic: no tile drawn, turn passes). Do NOT send `pool_empty` as error since it's a valid game event. Leave pool-empty path as-is.

**FINISH_TURN handler** (`case 'FINISH_TURN'`):
- `if (!room || room.status !== 'playing') return;`  
  → `if (!room) { ws.send({ type:'ERROR', code:'room_not_found', message:'החדר לא נמצא. המשחק אבד.' }); return; }`  
  → `if (room.status !== 'playing') { ws.send({ type:'ERROR', code:'not_your_turn', message:'המשחק אינו פעיל.' }); return; }`

**RESET_TURN handler** (`case 'RESET_TURN'`):
- `if (!room || room.status !== 'playing') return;`  
  → same split pattern with `room_not_found` / not-playing error.
- `if (activePlayer.id !== targetPlayerId) return;` → add `ws.send` with `not_your_turn` + log.

**RECONNECT_SESSION handler**:
- Currently: if room not found, does nothing.  
  → Add else branch: `ws.send({ type:'ERROR', code:'room_not_found', message:'החדר לא נמצא. המשחק אבד.' })`

**Verify:** `npm run typecheck:server` — no errors.

---

### B-2. Server: app-level PING heartbeat

**Files:** `server.ts`

Changes:

- In `startServer()`, after `wss.on('connection', ...)` setup, add a single `setInterval` (25 seconds) that iterates over all connected clients and sends `{ type: 'PING' }`:
  ```ts
  setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'PING' }));
      }
    }
  }, 25000);
  ```
- Keep the existing ws protocol ping (20s) — do not remove it.

**Verify:** `npm run typecheck:server` — no errors.

---

### B-3. Remove optimistic placeholder from `App.tsx`; add `isDrawPending` state + timeout + guard

**Files:** `src/App.tsx`

Changes:

a) Remove from `handleDrawTile`:
   - The `setIsDrawingAnimation(true)` / `setTimeout` block (keep the animation — wait, scope says STRICT no layout changes. The `isDrawingAnimation` flying-tile animation is purely visual and already present. Keep it. Only remove the placeholder rack mutation.)
   - Remove the `placeholder` const and `setLocalRack(prev => [...prev, placeholder])` lines.

b) Add state: `const [isDrawPending, setIsDrawPending] = useState(false);`
   Add ref: `const drawPendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);`

c) In `handleDrawTile`:
   - Add guard: `if (!ws || ws.readyState !== WebSocket.OPEN) { connectWebSocket(); showError('מתחבר מחדש...'); return; }`
   - After the guard: `setIsDrawPending(true);`
   - Start 4s timeout:
     ```ts
     if (drawPendingTimeoutRef.current) clearTimeout(drawPendingTimeoutRef.current);
     drawPendingTimeoutRef.current = setTimeout(() => {
       setIsDrawPending(false);
       showError('אין תגובה מהשרת, מתחבר מחדש...');
       connectWebSocket();
     }, 4000);
     ```

d) Clear `isDrawPending` on incoming messages: in the `onmessage` switch, add clearing logic:
   - In `case 'ROOM_STATE'`: add `setIsDrawPending(false); if (drawPendingTimeoutRef.current) clearTimeout(drawPendingTimeoutRef.current);`
   - In `case 'ERROR'`: same two lines.
   - Also handle a new `case 'DRAW_NACK'` (optional — the spec mentions it but server sends ERROR; handle as the same as ERROR).

e) Add socket readiness guards to `handleFinishTurn` and `handleResetTurn`:
   - `handleFinishTurn`: already guards `!ws || ws.readyState !== WebSocket.OPEN` — just ensure the pattern is consistent (it is).
   - `handleResetTurn`: add `if (!ws || ws.readyState !== WebSocket.OPEN) { connectWebSocket(); showError('מתחבר מחדש...'); return; }` at the top.

f) Pass `isDrawPending` to `<GameControls>` as a new prop.

**Verify:** `npm run lint` — no TypeScript errors.

---

### B-4. Add `isDrawPending` prop to `GameControls`; disable draw button while pending

**Files:** `src/components/GameControls.tsx`

Changes:

a) Add `isDrawPending?: boolean` to `GameControlsProps`.

b) In the draw button:
   - Change `disabled={!isMyTurn}` to `disabled={!isMyTurn || !!isDrawPending}`.
   - Change the button label span: when `isDrawPending` is true, render `"שולף..."` instead of `"שלוף אריח מהקופה ({poolCount})"`.
   - Update the disabled className condition to also cover `isDrawPending`.

**Verify:** `npm run lint` — no TypeScript errors.

---

### B-5. Remove `isPlaceholder` / `drawing_placeholder_` branch from `PlayerRack`

**Files:** `src/components/PlayerRack.tsx`

Changes:

- In `renderTile`: remove `const isPlaceholder = tile.id.startsWith('drawing_placeholder_');` and the `{isPlaceholder ? <FaceDownTile ...> : <TileView ...>}` conditional — always render `<TileView>`.
- Remove the `FaceDownTile` import from `./TileView` (only if it's not used elsewhere in the file — confirm first).

**Verify:** `npm run lint` — no TypeScript errors.

---

### B-6. Client heartbeat + resync triggers in `App.tsx`

**Files:** `src/App.tsx`

Changes:

a) Add `lastReceivedAtRef = useRef<number>(Date.now())`.

b) At the top of the `onmessage` handler body (before the switch), add:
   ```ts
   lastReceivedAtRef.current = Date.now();
   // Handle PONG explicitly (no-op except updating timestamp — already done above)
   if (msg.type === 'PONG') return; // actually server sends PING, client sends PONG
   ```
   Add `case 'PING': { ws.send(JSON.stringify({ type: 'PONG' })); break; }` to the switch.

c) Add a 45-second dead-socket detector `useEffect` (runs once, tears down on unmount):
   ```ts
   useEffect(() => {
     const interval = setInterval(() => {
       if (Date.now() - lastReceivedAtRef.current > 45000) {
         if (!isExplicitlyLeavingRef.current) connectWebSocket();
       }
     }, 10000); // check every 10s
     return () => clearInterval(interval);
   }, [connectWebSocket]);
   ```

d) Add visibility + online resync `useEffect`:
   ```ts
   useEffect(() => {
     const onVisible = () => {
       if (document.visibilityState === 'visible' && !isExplicitlyLeavingRef.current) {
         if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
       }
     };
     const onOnline = () => {
       if (!isExplicitlyLeavingRef.current) {
         if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
       }
     };
     document.addEventListener('visibilitychange', onVisible);
     window.addEventListener('online', onOnline);
     return () => {
       document.removeEventListener('visibilitychange', onVisible);
       window.removeEventListener('online', onOnline);
     };
   }, [ws, connectWebSocket]);
   ```

e) In `ROOM_STATE` handler, add rack integrity check:
   ```ts
   if (myPlayer?.rack) {
     const badTiles = myPlayer.rack.filter(
       t => !t.isJoker && (typeof t.number !== 'number' || t.number < 1 || t.number > 13 || !t.color)
     );
     if (badTiles.length > 0) {
       console.warn('[ROOM_STATE] bad tiles in rack, requesting resync:', badTiles);
       const savedRoom = newState.roomId;
       const savedPId = currentPId;
       if (ws && ws.readyState === WebSocket.OPEN && savedRoom && savedPId) {
         ws.send(JSON.stringify({ type: 'RECONNECT_SESSION', roomId: savedRoom, playerId: savedPId }));
       }
     }
   }
   ```

**Verify:** `npm run lint` — no TypeScript errors.

---

### B-7. Create test script `scripts/testIdle.ts`

**Files:** `scripts/testIdle.ts`

Self-contained WebSocket test script using the `ws` package. Three scenarios:

**Test 1 — Dead connection / idle detection:**
- Connect, CREATE_ROOM, ADD_BOT, START_GAME.
- After ROOM_STATE with `status:'playing'`, stop processing messages (but keep socket open; collect all received messages passively).
- Wait 35 seconds. Print all messages received (should include `{ type:'PING' }` around t=25s).
- Print pass/fail based on whether PING was received.

**Test 2 — DRAW_TILE out of turn:**
- Connect client A, CREATE_ROOM, ADD_BOT, START_GAME, wait for ROOM_STATE playing.
- Connect client B, JOIN_ROOM (same room, different player name).
- Identify whose turn it is from `currentTurnIndex`. Have the client whose turn it is NOT send `DRAW_TILE`.
- Expect `{ type:'ERROR' }` back. Print the message. Pass/fail.

**Test 3 — DRAW_TILE for nonexistent room:**
- Connect a fresh client, send `{ type:'DRAW_TILE', roomId:'ZZZZZ', playerId:'nobody' }`.
- Expect `{ type:'ERROR', code:'room_not_found' }`. Print it. Pass/fail.

Script structure follows the `testPool.ts` pattern: `assert(label, cond)`, final summary of passed/failed.

Each test wraps its socket logic in a `Promise` with a 40s timeout. After timeout, prints whatever was received regardless.

Add `"test:idle": "npx tsx scripts/testIdle.ts"` to `package.json` scripts.

**Verify:** `npx tsx scripts/testIdle.ts` — all three scenarios print results. Tests 2 and 3 pass after the fix (ERROR received). Test 1 shows PING after fix. (Requires the server to be running on the default port; the script connects to `ws://localhost:3000/ws`.)

---

## Order of Changes (Dependency-Ordered)

1. `src/types/rummikub.ts` — add `recentActions` to `GameState` (A-1)
2. `server.ts` — add `turnCounter`, `recentActions`, `recordAction`, update all `lastAction` assignments, explicit errors, PING heartbeat, RECONNECT_SESSION fix (A-2, B-1, B-2)
3. `src/App.tsx` — `myLastCompletedTurnNumberRef`, new highlight logic, `isDrawPending`, remove placeholder, guards, PING handler, heartbeat useEffect, resync triggers, rack integrity check (A-3, B-3, B-6)
4. `src/components/GameControls.tsx` — `isDrawPending` prop, disabled draw button (B-4)
5. `src/components/PlayerRack.tsx` — remove `isPlaceholder` branch (B-5)
6. `scripts/testIdle.ts` + `package.json` — test script (B-7)

---

## What Could Not Be Verified by Reading Code Alone

1. **Runtime behaviour of `connectWebSocket` when called while a socket is already OPEN** — the function creates a new WebSocket unconditionally; calling it mid-game may produce two concurrent sockets. The existing `onclose` handler only prevents reconnection when `isExplicitlyLeavingRef.current` is true. A guard `if (ws && ws.readyState === WebSocket.OPEN) return;` should be added inside `connectWebSocket` before creating a new socket, to prevent double-connections on the visibility/online triggers.

2. **`useMemo` for `highlightedTileIds`** — `App.tsx` uses plain function body (no `useMemo`), so derived values are recomputed on every render. The highlight computation is inexpensive (≤8 entries), but confirming there's no existing `useMemo` import usage conflict requires a full render-path trace that code reading alone can't guarantee.

3. **Test script port** — assumes `localhost:3000`. If the server runs on a different port, the test will not connect. The script should read `process.env.PORT` with a fallback of `3000`.

4. **`FaceDownTile` import in `PlayerRack`** — after removing the `isPlaceholder` branch, `FaceDownTile` is imported but unused. TypeScript with `noUnusedLocals` will error. Confirm by checking `tsconfig.json` — if `noUnusedLocals: true`, the import must also be removed.
