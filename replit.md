# Discord Moderation Bot

A full Discord.js v14 moderation and staff-network bot with 35 slash commands, SQLite persistence (via Node's built-in `node:sqlite`), role-based permissions, and a health endpoint for uptime monitoring.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — run the Discord bot
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, unused by bot)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, JavaScript (ES modules)
- Discord: discord.js v14
- DB: SQLite via `node:sqlite` (Node 22.5+ built-in, no native compilation needed)
- HTTP: Express 5 (health endpoint only)

## Where things live

- `artifacts/discord-bot/src/index.js` — Bot entry point, event handlers, health server
- `artifacts/discord-bot/src/commands.js` — All 35 slash command definitions and handlers
- `artifacts/discord-bot/src/setup.js` — Setup commands (/setup, /setup-roles, etc.)
- `artifacts/discord-bot/src/database.js` — SQLite schema + all DB helper functions
- `artifacts/discord-bot/src/utils.js` — Shared helpers: embed builders, permission checks, duration parsing
- `artifacts/discord-bot/data/bot.db` — SQLite database (auto-created on first run)

## Architecture decisions

- **node:sqlite over better-sqlite3**: better-sqlite3 requires Python/node-gyp for native compilation which isn't available in this environment. Node 24's built-in `node:sqlite` module provides the same synchronous API with zero dependencies.
- **Role-based permissions via DB**: Each server stores a JSON map of `{commandName: [roleId, ...]}` in the guilds table. Admins always bypass checks. Commands with no roles set default to `ManageGuild` permission.
- **Single-file command handlers**: All command logic lives in `commands.js` with a router map in `index.js` — easy to extend without touching the entry point.
- **Health endpoint for UptimeRobot**: Bot runs a small Express server on PORT 5000 at `/health` for external uptime monitoring.

## Product — Commands

| Category | Commands |
|---|---|
| Setup | `/setup` `/setup-roles` `/setup-roles-extra` `/setup-roles-wizard` `/setup-status` `/setup-edit` |
| Warnings | `/warn` `/warns` `/warn-leaderboard` |
| Ad Warnings | `/ad-warn` `/remove-ad-warn` |
| Moderation | `/mute` `/unmute` `/ban` `/fire` `/promote` `/demote-user` |
| Strikes | `/strike` `/strike-remove` |
| Jail | `/jail` `/unjail` |
| Requests | `/ban-request` `/blacklist-request` `/network-ban-request` `/partnership-request` |
| Utility | `/messages` `/message-leaderboard` `/case-info` `/balance` `/snipe` `/current-breaks` `/break` `/break-end` `/reset-messages` `/reset-messages-all` |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application/client ID |
| `PORT` | Auto | Port for Express health server (default: 5000) |

## Gotchas

- Run `/setup` in your server first to configure log channels and roles before using moderation commands.
- The `node:sqlite` module emits an ExperimentalWarning on startup — this is expected and harmless.
- Discord limits string option choices to 25. Commands like `warns`, `messages`, `balance`, `snipe`, `break`, `break-end`, and `current-breaks` are intentionally open to all users and excluded from the role permission system.
- Slash commands are registered globally (not per-guild) — changes can take up to 1 hour to propagate across all servers.
