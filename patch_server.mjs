import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf8');

// 1. Insert botDifficulty after botId line
const botIdLine = "            const botId = `bot_${Date.now()}_${botIndex}`;";
const botDiffLine = "\n            const botDifficulty = (message.difficulty === 'easy' || message.difficulty === 'medium') ? message.difficulty : 'hard';";
if (!content.includes('botDifficulty')) {
  content = content.replace(botIdLine, botIdLine + botDiffLine);
  console.log('Inserted botDifficulty');
} else {
  console.log('botDifficulty already present');
}

writeFileSync(file, content, 'utf8');
console.log('Done');
