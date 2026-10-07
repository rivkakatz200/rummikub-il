/**
 * scripts/testGeminiBot.ts
 *
 * Quick smoke-test for the Gemini bot integration.
 * Run with:  npm run test:bot
 *
 * Prints: source (gemini/fallback), action, latency, fallback reason.
 * Never prints the API key.
 */

import '../server/loadEnv.js';
import { geminiBotMove, getGeminiConfig } from '../server/geminiBot.js';
import type { Tile, TileSet } from '../src/types/rummikub.js';

// ── Sample game state ─────────────────────────────────────────────────────────

const sampleRack: Tile[] = [
  { id: 't_red_7_1_1',    color: 'red',    number: 7  },
  { id: 't_blue_7_1_2',   color: 'blue',   number: 7  },
  { id: 't_black_7_1_3',  color: 'black',  number: 7  },
  { id: 't_red_8_1_4',    color: 'red',    number: 8  },
  { id: 't_red_9_1_5',    color: 'red',    number: 9  },
  { id: 't_red_10_1_6',   color: 'red',    number: 10 },
  { id: 't_yellow_5_1_7', color: 'yellow', number: 5  },
  { id: 't_blue_3_1_8',   color: 'blue',   number: 3  },
];

const sampleBoard: TileSet[] = []; // empty board — initial meld scenario

const HAS_INITIAL_MELD = false;
const MIN_INITIAL_MELD = 30;
const POOL_COUNT       = 80;
const BOT_NAME         = 'TestBot';
const ROOM_ID          = 'TEST_ROOM';

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
  const { geminiConfigured, geminiModel } = getGeminiConfig();
  console.log(`\n=== Gemini Bot Test ===`);
  console.log(`configured : ${geminiConfigured}`);
  console.log(`model      : ${geminiModel}`);
  console.log(`rack       : ${sampleRack.map(t => `${t.number}${t.color[0].toUpperCase()}`).join(' ')}`);
  console.log(`board sets : ${sampleBoard.length}`);
  console.log('');

  const result = await geminiBotMove(
    sampleRack,
    sampleBoard,
    HAS_INITIAL_MELD,
    MIN_INITIAL_MELD,
    POOL_COUNT,
    BOT_NAME,
    ROOM_ID,
  );

  console.log(`source         : ${result.source}`);
  console.log(`action         : ${result.action}`);
  console.log(`latency        : ${result.latencyMs}ms`);
  console.log(`fallbackReason : ${result.fallbackReason}`);

  if (result.action === 'play' && result.newBoard) {
    console.log(`sets on board  : ${result.newBoard.length}`);
    console.log(`tiles in rack  : ${result.newRack?.length ?? '?'}`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
