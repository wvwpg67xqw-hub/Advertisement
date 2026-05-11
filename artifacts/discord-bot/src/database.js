import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'bot.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Migrate existing guilds table — add columns if missing
for (const col of [
  'ban_request_channel_id TEXT',
  'blacklist_request_channel_id TEXT',
  'network_ban_request_channel_id TEXT',
  'partnership_request_channel_id TEXT',
  'is_hub INTEGER NOT NULL DEFAULT 0',
  'hub_guild_id TEXT',
]) {
  try {
    db.exec(`ALTER TABLE guilds ADD COLUMN ${col}`);
  } catch {
    // Column already exists — safe to ignore
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    warn_log_channel_id TEXT,
    strike_log_channel_id TEXT,
    request_log_channel_id TEXT,
    ad_warn_log_channel_id TEXT,
    jail_role_id TEXT,
    muted_role_id TEXT,
    command_roles TEXT NOT NULL DEFAULT '{}',
    ban_request_channel_id TEXT,
    blacklist_request_channel_id TEXT,
    network_ban_request_channel_id TEXT,
    partnership_request_channel_id TEXT,
    is_hub INTEGER NOT NULL DEFAULT 0,
    hub_guild_id TEXT
  );

  CREATE TABLE IF NOT EXISTS warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS ad_warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    message_id TEXT,
    message_content TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS strikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS jailed_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    original_roles TEXT NOT NULL DEFAULT '[]',
    jailed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS message_counts (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS snipe_cache (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    content TEXT,
    author_id TEXT,
    author_name TEXT,
    author_avatar TEXT,
    deleted_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS balances (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS breaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    reason TEXT,
    started_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ─── Guild Config ─────────────────────────────────────────────────────────────

export function getGuild(guildId) {
  let row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
  }
  row.command_roles = JSON.parse(row.command_roles || '{}');
  return row;
}

export function setGuildConfig(guildId, fields) {
  getGuild(guildId);
  const allowed = [
    'log_channel_id', 'warn_log_channel_id', 'strike_log_channel_id',
    'request_log_channel_id', 'ad_warn_log_channel_id', 'jail_role_id', 'muted_role_id',
    'ban_request_channel_id', 'blacklist_request_channel_id',
    'network_ban_request_channel_id', 'partnership_request_channel_id',
  ];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      db.prepare(`UPDATE guilds SET ${key} = ? WHERE guild_id = ?`).run(val, guildId);
    }
  }
}

export function setNetworkHub(guildId, isHub) {
  getGuild(guildId);
  db.prepare('UPDATE guilds SET is_hub = ? WHERE guild_id = ?').run(isHub ? 1 : 0, guildId);
}

export function setHubGuildId(guildId, hubGuildId) {
  getGuild(guildId);
  db.prepare('UPDATE guilds SET hub_guild_id = ? WHERE guild_id = ?').run(hubGuildId, guildId);
}

export function getNetworkMembers(hubGuildId) {
  return db.prepare('SELECT guild_id FROM guilds WHERE hub_guild_id = ?').all(hubGuildId);
}

export function setCommandRoles(guildId, command, roleIds) {
  const guild = getGuild(guildId);
  const roles = guild.command_roles;
  roles[command] = roleIds;
  db.prepare('UPDATE guilds SET command_roles = ? WHERE guild_id = ?')
    .run(JSON.stringify(roles), guildId);
}

export function getCommandRoles(guildId, command) {
  const guild = getGuild(guildId);
  return guild.command_roles[command] || [];
}

// ─── Case ID ──────────────────────────────────────────────────────────────────

function generateCaseId(guildId) {
  const w = db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ?').get(guildId)?.c || 0;
  const a = db.prepare('SELECT COUNT(*) as c FROM ad_warns WHERE guild_id = ?').get(guildId)?.c || 0;
  const s = db.prepare('SELECT COUNT(*) as c FROM strikes WHERE guild_id = ?').get(guildId)?.c || 0;
  return `CASE-${String(Number(w) + Number(a) + Number(s) + 1).padStart(4, '0')}`;
}

// ─── Warns ────────────────────────────────────────────────────────────────────

export function addWarn(guildId, userId, moderatorId, reason) {
  const caseId = generateCaseId(guildId);
  db.prepare(
    'INSERT INTO warns (case_id, guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?, ?)',
  ).run(caseId, guildId, userId, moderatorId, reason);
  return caseId;
}

export function getWarns(guildId, userId) {
  return db.prepare(
    'SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
  ).all(guildId, userId);
}

export function getWarnCount(guildId, userId) {
  return Number(db.prepare(
    'SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId)?.c || 0);
}

export function getWarnLeaderboard(guildId, limit = 10) {
  return db.prepare(
    `SELECT user_id, COUNT(*) as count FROM warns
     WHERE guild_id = ? GROUP BY user_id ORDER BY count DESC LIMIT ?`,
  ).all(guildId, limit);
}

export function getCaseInfo(guildId, caseId) {
  return (
    db.prepare("SELECT *, 'warn' as type FROM warns WHERE guild_id = ? AND case_id = ?").get(guildId, caseId) ||
    db.prepare("SELECT *, 'ad_warn' as type FROM ad_warns WHERE guild_id = ? AND case_id = ?").get(guildId, caseId) ||
    db.prepare("SELECT *, 'strike' as type FROM strikes WHERE guild_id = ? AND case_id = ?").get(guildId, caseId)
  );
}

// ─── Ad Warns ─────────────────────────────────────────────────────────────────

export function addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent) {
  const caseId = generateCaseId(guildId);
  db.prepare(
    `INSERT INTO ad_warns (case_id, guild_id, user_id, moderator_id, reason, message_id, message_content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(caseId, guildId, userId, moderatorId, reason, messageId ?? null, messageContent ?? null);
  return caseId;
}

export function getAdWarns(guildId, userId) {
  return db.prepare(
    'SELECT * FROM ad_warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
  ).all(guildId, userId);
}

export function removeAdWarn(guildId, caseId) {
  const result = db.prepare('DELETE FROM ad_warns WHERE guild_id = ? AND case_id = ?').run(guildId, caseId);
  return result.changes > 0;
}

// ─── Strikes ──────────────────────────────────────────────────────────────────

export function addStrike(guildId, userId, moderatorId, reason) {
  const caseId = generateCaseId(guildId);
  db.prepare(
    'INSERT INTO strikes (case_id, guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?, ?)',
  ).run(caseId, guildId, userId, moderatorId, reason);
  return caseId;
}

export function getStrikes(guildId, userId) {
  return db.prepare(
    'SELECT * FROM strikes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
  ).all(guildId, userId);
}

export function getStrikeCount(guildId, userId) {
  return Number(db.prepare(
    'SELECT COUNT(*) as c FROM strikes WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId)?.c || 0);
}

export function removeStrike(guildId, caseId) {
  const result = db.prepare('DELETE FROM strikes WHERE guild_id = ? AND case_id = ?').run(guildId, caseId);
  return result.changes > 0;
}

// ─── Jail ─────────────────────────────────────────────────────────────────────

export function jailUser(guildId, userId, originalRoles) {
  db.prepare(
    'INSERT OR REPLACE INTO jailed_users (guild_id, user_id, original_roles) VALUES (?, ?, ?)',
  ).run(guildId, userId, JSON.stringify(originalRoles));
}

export function unjailUser(guildId, userId) {
  const row = db.prepare(
    'SELECT * FROM jailed_users WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId);
  if (!row) return null;
  db.prepare('DELETE FROM jailed_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return JSON.parse(row.original_roles);
}

export function isJailed(guildId, userId) {
  return !!db.prepare('SELECT 1 FROM jailed_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

// ─── Message Counts ───────────────────────────────────────────────────────────

export function incrementMessageCount(guildId, userId) {
  db.prepare(
    `INSERT INTO message_counts (guild_id, user_id, count) VALUES (?, ?, 1)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET count = count + 1`,
  ).run(guildId, userId);
}

export function getMessageCount(guildId, userId) {
  return Number(db.prepare(
    'SELECT count FROM message_counts WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId)?.count || 0);
}

export function getMessageLeaderboard(guildId, limit = 10) {
  return db.prepare(
    'SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC LIMIT ?',
  ).all(guildId, limit);
}

export function resetMessages(guildId, userId) {
  db.prepare('DELETE FROM message_counts WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

export function resetMessagesAll(guildId) {
  db.prepare('DELETE FROM message_counts WHERE guild_id = ?').run(guildId);
}

// ─── Snipe Cache ──────────────────────────────────────────────────────────────

export function setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar) {
  db.prepare(
    `INSERT OR REPLACE INTO snipe_cache
     (guild_id, channel_id, content, author_id, author_name, author_avatar, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch())`,
  ).run(guildId, channelId, content, authorId, authorName, authorAvatar);
}

export function getSnipeCache(guildId, channelId) {
  return db.prepare(
    'SELECT * FROM snipe_cache WHERE guild_id = ? AND channel_id = ?',
  ).get(guildId, channelId);
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export function getBalance(guildId, userId) {
  return Number(db.prepare(
    'SELECT balance FROM balances WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId)?.balance || 0);
}

export function setBalance(guildId, userId, amount) {
  db.prepare(
    `INSERT INTO balances (guild_id, user_id, balance) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = ?`,
  ).run(guildId, userId, amount, amount);
}

// ─── Breaks ───────────────────────────────────────────────────────────────────

export function startBreak(guildId, userId, username, reason) {
  const existing = db.prepare('SELECT 1 FROM breaks WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (existing) return false;
  db.prepare(
    'INSERT INTO breaks (guild_id, user_id, username, reason) VALUES (?, ?, ?, ?)',
  ).run(guildId, userId, username, reason ?? null);
  return true;
}

export function endBreak(guildId, userId) {
  const row = db.prepare('SELECT * FROM breaks WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) return null;
  db.prepare('DELETE FROM breaks WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return row;
}

export function getCurrentBreaks(guildId) {
  return db.prepare('SELECT * FROM breaks WHERE guild_id = ? ORDER BY started_at ASC').all(guildId);
}

export function isOnBreak(guildId, userId) {
  return !!db.prepare('SELECT 1 FROM breaks WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}
