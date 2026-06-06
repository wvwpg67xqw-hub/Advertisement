# Discord Staff Portal

A full-stack Node.js app: Express backend, React/Vite frontend, Discord.js v14 bot with 35+ slash commands, JSON file-based database, and a web portal for staff management.

## Run

- Start the app via the **Start application** workflow (`node index.js` → builds client if needed, then starts `server.js` on port 5000)

## Stack

- Node.js 20, Express, Discord.js v14
- React + Vite frontend (built to `client/dist/`)
- JSON file-based DB (`jsondb.js` + `db.js`) for web portal data
- MySQL (`mysqldb.js`) for bot guild configs, warns, strikes, levels, etc.
- Discord OAuth2 for authentication (no Replit Auth)

## Pages & Routes

| Path | Page | Access |
|---|---|---|
| `/` | Home — landing page, open positions | Public |
| `/login` | Discord OAuth login | Public |
| `/apply` | Multi-step application form | Logged in |
| `/staff` | Moderator panel (referral link, modmail test) | Logged in |
| `/admin` | Admin dashboard | Admin only |
| `/appeal` | Ban appeal form | Logged in + blacklisted |
| `/success` | Submission confirmation | Public |

## Admin Dashboard Tabs

- **Applications** — view/accept/deny staff applications, assign Discord roles on acceptance, send test applications
- **Roles** — create/edit/toggle the staff positions shown on the apply page
- **Servers** — configure which Discord servers appear on the apply page, post apply-message embeds
- **Channels** — remotely lock/unlock Discord channels via the bot
- **Blacklist** — ban/unban users from the portal
- **Bots** — manage bot OAuth2 invite links
- **Admins** — manage who has admin access to the dashboard

## Where Things Live

### Bot / Backend
- `index.js` — entry point: kills port, builds client if needed, imports `server.js`
- `server.js` — Express server, Discord client, interaction router, OAuth2 callbacks
- `botClient.js` — Discord.js client singleton
- `db.js` — JSON-based web portal DB (users, admins, applications, blacklist, bots, roles, servers)
- `jsondb.js` — low-level JSON file read/write helpers
- `mysqldb.js` — MySQL pool + schema migrations for bot data
- `auth.js` — `requireAuth` / `requireAdmin` Express middleware
- `dmRest.js` — REST-only Discord DM sender (no gateway dependency)
- `security.js` — IP blacklist, rate limiting, VPN detection, breach alerts
- `src/commands/` — Slash commands split by category:
  - `index.js` — aggregates all definitions and handlers
  - `moderation.js` — warn, ad-warn, mute, unmute, ban, fire, jail, unjail
  - `staff-management.js` — promote, demote-user, strike, strike-remove
  - `requests.js` — ban-request, blacklist-request, network-ban-request, partnership-request
  - `network.js` — network-ban, network-unban
  - `utility.js` — messages, message-leaderboard, case-info, balance, snipe, reset-messages
  - `breaks.js` — current-breaks, break-request, break-end, manage-break
  - `staff.js` — resign-request, apply, update
  - `shared.js` — shared helpers (deny, noConfig) and `STAFF_ROLE_ID` constant
- `src/setup.js` — Setup slash commands (/setup, /setup-roles, /setup-resign, etc.)
- `src/database.js` — MySQL-backed DB helpers (guilds, warns, levels, breaks, etc.)
- `src/utils.js` — Embed builders, permission checks, duration parsing, sendLog
- `routes/admin.js` — Admin API (applications, roles, servers, channels, blacklist, bots, admins)
- `routes/staff.js` — Staff API (referral link, modmail test application)
- `routes/applications.js` — Public applications API + `ROLE_QUESTIONS` export

### Frontend
- `client/` — React + Vite SPA
- `client/App.jsx` — Router, auth context, branding context, navbar
- `client/pages/Home.jsx` — Landing page with open positions fetched from `/api/roles`
- `client/pages/Apply.jsx` — 3-step application form (server → role → questions); roles fetched from `/api/roles`, servers from `/api/applications/servers`
- `client/pages/Admin.jsx` — Full admin dashboard (7 tabs)
- `client/pages/Staff.jsx` — Moderator panel
- `client/pages/Login.jsx` — Discord OAuth login page
- `client/pages/Appeal.jsx` — Ban appeal submission
- `client/pages/Success.jsx` — Post-submission confirmation
- `client/pages/NotFound.jsx` — 404 page

## Hardcoded Constants

| Constant | Value | Where |
|---|---|---|
| `STAFF_ROLE_ID` | `1502594799683895346` | `src/commands/shared.js`, `routes/admin.js` |
| Main guild ID | from `MAIN_GUILD_ID` env | `server.js` |
| App channel | `1503147704522637494` | `server.js`, `routes/admin.js` |
| Admin Discord role | `1502041120849395775` | `server.js` (auto-grants admin on login) |
| Mod task channel | `1502489464851796099` | `client/pages/Staff.jsx` |
| HR task channel | `1502489463001972799` | `client/pages/Staff.jsx` |
| Management task channel | `1502489591725166673` | `client/pages/Staff.jsx` |
| Owner ID | `1453592157607825595` | `server.js` (fallback if `OWNER_ID` not set) |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application/client ID |
| `MAIN_GUILD_ID` | Yes | Main (public) Discord server ID |
| `SESSION_SECRET` | Yes | Express session secret |
| `DISCORD_CLIENT_ID` | Yes | OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `DISCORD_REDIRECT_URI` | Yes | OAuth2 redirect URI (e.g. `https://yourdomain.replit.app/api/auth/callback`) |
| `OWNER_ID` | No | Discord user ID that receives login/appeal/security DMs |
| `ADMIN_ID` | No | Extra Discord user ID seeded as owner-level admin |
| `STAFF_SERVER` | No | Staff server ID (auto-joins users on login) |
| `DISCORD_BOT_TOKEN` | No | Bot token for guild-join API calls (can be same as `TOKEN`) |
| `DB_HOST` | No | MySQL host (default: `nc1.lemonhost.me`) |
| `DB_PORT` | No | MySQL port (default: `3306`) |
| `DB_NAME` | No | MySQL database name (default: `mysql`) |
| `DB_USER` | No | MySQL username |
| `DB_PASS` | No | MySQL password |
| `PORT` | Auto | Express port (default: `5000`) |

## Application Flow

1. User visits `/` → sees Home page with open staff positions
2. Clicks "Login with Discord" → Discord OAuth2 → redirected back
3. Visits `/apply` → selects server (from admin-configured list) → selects role → fills 20 questions → submits
4. Application posted to Discord channel as embed with Accept/Deny buttons + full Q&A thread
5. Admin reviews via `/admin` dashboard or Discord buttons → accept assigns Discord roles + DMs applicant

## User Preferences

- Commands split into separate files by category for easy management
- Staff role ID hardcoded as `1502594799683895346`
