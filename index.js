import { execSync } from 'child_process';
import { existsSync } from 'fs';

const distPath = './client/dist';
if (existsSync('./client/package.json') && !existsSync(distPath)) {
  try {
    console.log('🔨 Building client...');
    execSync('cd client && npm install --registry https://registry.npmjs.org/ && npm run build', { stdio: 'inherit' });
    console.log('✅ Client built successfully');
  } catch (err) {
    console.warn('⚠️  Client build failed:', err.message);
  }
}

await import('./server.js');
