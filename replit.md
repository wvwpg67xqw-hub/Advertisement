# Discord Staff Portal

A full-stack Node.js app: Express backend, React/Vite frontend, Discord.js v14 bot with 35+ slash commands, JSON file-based database, and a web portal for staff management.

## Run

- Start the app via the **Start application** workflow (runs `node server.js` on port 5000)

## Stack

- Node.js 20, Express, Discord.js v14
- React + Vite frontend (built to `client/dist/`)
- JSON file-based DB (`jsondb.js`, `src/database.js`)
- SQLite-like `db.js` for web portal data

## Where things live

### Bot / Backend
- `server.js` — Express server entry point, Discord client, interaction router
- `src/commands/` — Slash commands split by category:
  - `index.js` — aggregates all defs and re-exports all handlers
  - `moderation.js` — warn, ad-warn, mute, unmute, ban, fire, jail, unjail
  - `staff-management.js` — promote, demote-user, strike, strike-remove
  - `requests.js` — ban-request, blacklist-request, network-ban-request, partnership-request
  - `network.js` — network-ban, network-unban
  - `utility.js` — messages, message-leaderboard, case-info, balance, snipe, reset-messages
  - `breaks.js` — current-breaks, break-request, break-end, manage-break
  - `staff.js` — resign-request, apply, update
  - `shared.js` — shared helpers (deny, noConfig) and `STAFF_ROLE_ID` constant
- `src/setup.js` — Setup commands (/setup, /setup-roles, /setup-resign, etc.)
- `src/database.js` — JSON DB helpers
- `src/utils.js` — Embed builders, permission checks, duration parsing, sendLog
- `routes/admin.js` — Admin API routes (role assignment, application approval)
- `routes/staff.js` — Staff API routes (referral link, modmail test)
- `routes/applications.js` — Applications API

### Frontend
- `client/` — React/Vite SPA
- `client/pages/` — Home, Apply, Admin, Staff, Appeal, Login, Success, NotFound

## Hardcoded constants

| Constant | Value | Where |
|---|---|---|
| `STAFF_ROLE_ID` | `1502594799683895346` | `src/commands/shared.js`, `routes/admin.js` |
| Main guild ID | from `MAIN_GUILD_ID` env | `server.js` |
| Mod task channel | `1502489464851796099` | `routes/admin.js` |
| HR task channel | `1502489463001972799` | `routes/admin.js` |
| Management task channel | `1502489591725166673` | `routes/admin.js` |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application/client ID |
| `MAIN_GUILD_ID` | Yes | Main (public) Discord server ID |
| `SESSION_SECRET` | Yes | Express session secret |
| `DISCORD_CLIENT_ID` | Yes | OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `PORT` | Auto | Express port (default 5000) |

## User preferences

- Commands split into separate files by category for easy management
- Staff role ID hardcoded as `1502594799683895346`
