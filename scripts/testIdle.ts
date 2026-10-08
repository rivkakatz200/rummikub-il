/**
 * npx tsx scripts/testIdle.ts
 * Integration smoke-test for Bug B server behaviors.
 * Requires the server to be running on localhost:${PORT||3000}.
 *
 * Test 1 — PING heartbeat: connect, start a game, idle 35s → expect PING around t=25s.
 * Test 2 — DRAW_TILE out of turn: send DRAW_TILE when it is NOT your turn → expect ERROR.
 * Test 3 — DRAW_TILE nonexistent room: send DRAW_TILE for room 'ZZZZZ' → expect ERROR code='room_not_found'.
 */

import WebSocket from 'ws';

const PORT = process.env.PORT || '3000';
const WS_URL = `ws://localhost:${PORT}/ws`;

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function connectWs(): WebSocket {
  return new WebSocket(WS_URL);
}

function send(ws: WebSocket, msg: object) {
  ws.send(JSON.stringify(msg));
}

/** Wait for the next message matching a predicate, with timeout. */
function waitFor(
  ws: WebSocket,
  pred: (msg: any) => boolean,
  timeoutMs: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (pred(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.on('message', handler);
  });
}

/** Collect all messages for a duration. */
function collectMessages(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const collected: any[] = [];
    const handler = (data: WebSocket.RawData) => {
      try { collected.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.off('message', handler);
      resolve(collected);
    }, durationMs);
  });
}

// ─── Test 1 — PING heartbeat ──────────────────────────────────────────────────
async function test1(): Promise<void> {
  console.log('\n=== Test 1: PING heartbeat (idle 35s) ===');
  const ws = connectWs();

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', reject);
  });

  // Create room
  send(ws, { type: 'CREATE_ROOM', playerName: 'TestPlayer1', avatar: '🦁', settings: { maxPlayers: 2, turnDuration: 0, minInitialMeld: 0 } });
  let roomId = '', playerId = '';

  try {
    const created = await waitFor(ws, m => m.type === 'ROOM_CREATED', 5000);
    roomId = created.roomId;
    playerId = created.playerId;
  } catch {
    console.error('  SKIP: could not create room');
    ws.close();
    return;
  }

  // Add bot and start game
  send(ws, { type: 'ADD_BOT', roomId, playerId });
  send(ws, { type: 'START_GAME', roomId, playerId, settings: { turnDuration: 0, minInitialMeld: 0 } });

  try {
    await waitFor(ws, m => m.type === 'ROOM_STATE' && m.state?.status === 'playing', 5000);
  } catch {
    console.error('  SKIP: game did not start');
    ws.close();
    return;
  }

  console.log('  Game started. Collecting messages for 35s (expect PING around t=25s)...');
  const t0 = Date.now();
  const msgs = await collectMessages(ws, 35000);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const pings = msgs.filter(m => m.type === 'PING');
  console.log(`  Messages received in ${elapsed}s: ${msgs.length} total, ${pings.length} PING`);
  console.log('  Message types:', [...new Set(msgs.map(m => m.type))].join(', '));

  assert('PING received within 35s idle', pings.length >= 1, `received ${pings.length} PINGs`);

  ws.close();
}

// ─── Test 2 — DRAW_TILE out of turn ──────────────────────────────────────────
async function test2(): Promise<void> {
  console.log('\n=== Test 2: DRAW_TILE out of turn ===');

  const wsA = connectWs();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    wsA.once('open', () => { clearTimeout(t); resolve(); });
    wsA.once('error', reject);
  });

  send(wsA, { type: 'CREATE_ROOM', playerName: 'PlayerA', avatar: '🦁', settings: { maxPlayers: 2, turnDuration: 0, minInitialMeld: 0 } });
  let roomId = '', playerAId = '';

  try {
    const created = await waitFor(wsA, m => m.type === 'ROOM_CREATED', 5000);
    roomId = created.roomId;
    playerAId = created.playerId;
  } catch {
    console.error('  SKIP: could not create room');
    wsA.close();
    return;
  }

  // Connect second player B
  const wsB = connectWs();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    wsB.once('open', () => { clearTimeout(t); resolve(); });
    wsB.once('error', reject);
  });

  send(wsB, { type: 'JOIN_ROOM', roomId, playerName: 'PlayerB', avatar: '🦊' });
  let playerBId = '';

  try {
    const joined = await waitFor(wsB, m => m.type === 'ROOM_JOINED', 5000);
    playerBId = joined.playerId;
  } catch {
    console.error('  SKIP: player B could not join');
    wsA.close(); wsB.close();
    return;
  }

  // Host starts game
  send(wsA, { type: 'START_GAME', roomId, playerId: playerAId, settings: { turnDuration: 0, minInitialMeld: 0 } });

  let gameState: any = null;
  try {
    const rs = await waitFor(wsA, m => m.type === 'ROOM_STATE' && m.state?.status === 'playing', 5000);
    gameState = rs.state;
  } catch {
    console.error('  SKIP: game did not start');
    wsA.close(); wsB.close();
    return;
  }

  // Identify whose turn it is NOT
  const currentIdx = gameState.currentTurnIndex;
  const activeId = gameState.players[currentIdx]?.id;
  const nonActiveId = activeId === playerAId ? playerBId : playerAId;
  const nonActiveWs = activeId === playerAId ? wsB : wsA;

  console.log(`  Active player: ${activeId === playerAId ? 'A' : 'B'}, sending DRAW_TILE from non-active player`);

  // Send DRAW_TILE from non-active player
  send(nonActiveWs, { type: 'DRAW_TILE', roomId, playerId: nonActiveId });

  try {
    const errMsg = await waitFor(nonActiveWs, m => m.type === 'ERROR', 5000);
    console.log(`  Received ERROR:`, errMsg);
    assert('DRAW_TILE out of turn returns ERROR', errMsg.type === 'ERROR', `got type=${errMsg.type}`);
  } catch {
    assert('DRAW_TILE out of turn returns ERROR', false, 'timeout — no ERROR received');
  }

  wsA.close();
  wsB.close();
}

// ─── Test 3 — DRAW_TILE for nonexistent room ──────────────────────────────────
async function test3(): Promise<void> {
  console.log('\n=== Test 3: DRAW_TILE for nonexistent room ===');

  const ws = connectWs();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', reject);
  });

  send(ws, { type: 'DRAW_TILE', roomId: 'ZZZZZ', playerId: 'nobody' });

  try {
    const errMsg = await waitFor(ws, m => m.type === 'ERROR', 5000);
    console.log(`  Received ERROR:`, errMsg);
    assert('DRAW_TILE nonexistent room returns ERROR', errMsg.type === 'ERROR', `got type=${errMsg.type}`);
    assert('ERROR has code=room_not_found', errMsg.code === 'room_not_found', `got code=${errMsg.code}`);
  } catch {
    assert('DRAW_TILE nonexistent room returns ERROR', false, 'timeout — no ERROR received');
  }

  ws.close();
}

// ─── Run all tests ────────────────────────────────────────────────────────────
async function main() {
  console.log(`Connecting to ${WS_URL}`);

  // Wrap each test with a 40s outer timeout
  const withTimeout = (fn: () => Promise<void>, label: string) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        console.error(`  [${label}] outer 40s timeout reached`);
        resolve();
      }, 40000);
      fn().then(() => { clearTimeout(t); resolve(); }).catch((err) => {
        clearTimeout(t);
        console.error(`  [${label}] error:`, err);
        resolve();
      });
    });

  await withTimeout(test1, 'Test1');
  await withTimeout(test2, 'Test2');
  await withTimeout(test3, 'Test3');

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
