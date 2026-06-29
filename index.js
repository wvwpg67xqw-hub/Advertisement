import { existsSync } from 'fs';
import { execSync } from 'child_process';

const distPath = './client/dist';
if (existsSync('./client/package.json') && !existsSync(distPath)) {
  try {
    console.log('🔨 Building client...');
    execSync('cd client && npm install && npm run build', { stdio: 'inherit' });
    console.log('✅ Client built successfully');
  } catch (err) {
    console.warn('⚠️  Client build failed:', err.message);
  }
}

await import('./server.js');

import { startModmailBot } from './modmail/bot.js';
startModmailBot();
