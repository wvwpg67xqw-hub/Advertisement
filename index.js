import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Kill any process already holding the port so restarts never get EADDRINUSE
const port = process.env.PORT || 5000;
try { execSync(`fuser -k ${port}/tcp 2>/dev/null || true`); } catch {}

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
