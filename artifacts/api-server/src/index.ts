import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ─── DISCORD BOT SUBPROCESS ──────────────────────────────────────────────────
// Replit's artifact detection always deploys the api-server (it has a dist/).
// We spawn the Discord bot here so it runs in production regardless.
// Path: dist/index.mjs → ../../discord-bot/src/index.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// From dist/index.mjs, go up two levels to reach artifacts/, then into discord-bot
const BOT_ENTRY = resolve(__dirname, '../../discord-bot/src/index.js');

function spawnBot() {
  logger.info({ botEntry: BOT_ENTRY }, 'Starting Discord bot subprocess');

  const bot = spawn('node', [BOT_ENTRY], {
    env: {
      ...process.env,
      BOT_HEALTH_PORT: '8081',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  bot.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[bot] ${data}`);
  });

  bot.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[bot] ${data}`);
  });

  bot.on('exit', (code: number | null, signal: string | null) => {
    logger.warn({ code, signal }, 'Discord bot exited — restarting in 5s');
    setTimeout(spawnBot, 5000);
  });
}

if (process.env.TOKEN && process.env.CLIENT_ID) {
  spawnBot();
} else {
  logger.warn('TOKEN or CLIENT_ID not set — Discord bot subprocess skipped');
}
