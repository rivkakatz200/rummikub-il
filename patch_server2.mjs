import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf8');

// Normalize line endings for matching, then restore
const hasCRLF = content.includes('\r\n');
const norm = content.replace(/\r\n/g, '\n');

let result = norm;

// 1. Add difficulty field to botPlayer (after ws: null,)
// Find the botPlayer block's ws: null, and add difficulty after it
const wsNull = '              ws: null,\n            };';
const wsNullWithDiff = '              ws: null,\n              difficulty: botDifficulty,\n            };';
if (result.includes(wsNull) && !result.includes('difficulty: botDifficulty')) {
  result = result.replace(wsNull, wsNullWithDiff);
  console.log('Added difficulty field to botPlayer');
} else if (result.includes('difficulty: botDifficulty')) {
  console.log('difficulty field already present');
} else {
  // Try with different indentation
  const alt = '            ws: null,\n            };';
  if (result.includes(alt)) {
    result = result.replace(alt, '            ws: null,\n              difficulty: botDifficulty,\n            };');
    console.log('Added difficulty field (alt indent)');
  } else {
    console.log('WARNING: could not find ws: null pattern. Searching...');
    const idx = result.indexOf('ws: null,');
    if (idx >= 0) console.log('Context:', JSON.stringify(result.substring(idx - 20, idx + 60)));
  }
}

if (hasCRLF) result = result.replace(/\n/g, '\r\n');
writeFileSync(file, result, 'utf8');
console.log('Done');
