import pool from '../mysqldb.js';

function ts() { return Math.floor(Date.now() / 1000); }

async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Guild Config ──────────────────────────────────────────────────────────────

export async function getGuild(guildId) {
  let row = await q1('SELECT * FROM guilds WHERE guild_id = ?', [guildId]);
  if (!row) {
    await q('INSERT IGNORE INTO guilds (guild_id) VALUES (?)', [guildId]);
    row = await q1('SELECT * FROM guilds WHERE guild_id = ?', [guildId]);
  }
  row.command_roles       = parseJson(row.command_roles, {});
  row.network_apply_roles = parseJson(row.network_apply_roles, []);
  row.is_hub = !!row.is_hub;
  return row;
}

export async function setGuildConfig(guildId, fields) {
  await getGuild(guildId);
  const allowed = [
    'log_channel_id', 'warn_log_channel_id', 'strike_log_channel_id',
    'request_log_channel_id', 'ad_warn_log_channel_id', 'staff_updates_channel_id',
    'jail_role_id', 'muted_role_id',
    'ban_request_channel_id', 'blacklist_request_channel_id',
    'network_ban_request_channel_id', 'partnership_request_channel_id',
    'break_request_channel_id', 'break_role_id', 'main_break_role_id',
    'resign_channel_id', 'verified_role_id', 'applications_channel_id',
    'referral_link', 'modmail_test_channel_id',
    'pfp_url', 'banner_url',
    'network_apply_log_channel_id', 'network_apply_roles',
  ];
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    sets.push(`\`${key}\` = ?`);
    params.push(key === 'network_apply_roles' ? JSON.stringify(val) : val);
  }
  if (sets.length === 0) return;
  params.push(guildId);
  await q(`UPDATE guilds SET ${sets.join(', ')} WHERE guild_id = ?`, params);
}

export async function setCommandRoles(guildId, command, roleIds) {
  const guild = await getGuild(guildId);
  const cr = guild.command_roles || {};
  cr[command] = roleIds;
  await q('UPDATE guilds SET command_roles = ? WHERE guild_id = ?', [JSON.stringify(cr), guildId]);
}

export async function getCommandRoles(guildId, command) {
  const guild = await getGuild(guildId);
  return (guild.command_roles || {})[command] || [];
}

export async function setNetworkHub(guildId, isHub) {
  await getGuild(guildId);
  await q('UPDATE guilds SET is_hub = ? WHERE guild_id = ?', [isHub ? 1 : 0, guildId]);
}

export async function setHubGuildId(guildId, hubGuildId) {
  await getGuild(guildId);
  await q('UPDATE guilds SET hub_guild_id = ? WHERE guild_id = ?', [hubGuildId, guildId]);
}

export async function clearNetworkHub(guildId) {
  await getGuild(guildId);
  await q('UPDATE guilds SET is_hub = 0 WHERE guild_id = ?', [guildId]);
}

export async function clearHubGuildId(guildId) {
  await getGuild(guildId);
  await q('UPDATE guilds SET hub_guild_id = NULL WHERE guild_id = ?', [guildId]);
}

export async function getNetworkMembers(hubGuildId) {
  const rows = await q('SELECT guild_id FROM guilds WHERE hub_guild_id = ?', [hubGuildId]);
  return rows.map(r => ({ guild_id: r.guild_id }));
}

export async function setNetworkApplyConfig(guildId, logChannelId, roles) {
  await getGuild(guildId);
  await q('UPDATE guilds SET network_apply_log_channel_id = ?, network_apply_roles = ? WHERE guild_id = ?',
    [logChannelId, JSON.stringify(roles || []), guildId]);
}

export async function getNetworkApplyConfig(guildId) {
  const g = await getGuild(guildId);
  return {
    logChannelId: g.network_apply_log_channel_id || null,
    roles: g.network_apply_roles || [],
  };
}

// ── Ad Channels ───────────────────────────────────────────────────────────────

export async function addAdChannel(guildId, channelId) {
  await q('INSERT IGNORE INTO ad_channels (guild_id, channel_id) VALUES (?, ?)', [guildId, channelId]);
}

export async function removeAdChannel(guildId, channelId) {
  const result = await q('DELETE FROM ad_channels WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  return result.affectedRows > 0;
}

export async function getAdChannels(guildId) {
  const rows = await q('SELECT channel_id FROM ad_channels WHERE guild_id = ?', [guildId]);
  return rows.map(r => r.channel_id);
}

export async function isAdChannel(guildId, channelId) {
  const row = await q1('SELECT guild_id FROM ad_channels WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  return !!row;
}

// ── Ad Posts ──────────────────────────────────────────────────────────────────

export async function trackAdPost(guildId, channelId, messageId, userId) {
  await q('INSERT IGNORE INTO ad_posts (guild_id, channel_id, message_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, userId, ts()]);
}

export async function getAdPostsByUser(guildId, userId) {
  return q('SELECT channel_id, message_id FROM ad_posts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function clearAdPostsByUser(guildId, userId) {
  await q('DELETE FROM ad_posts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function removeAdPostRecord(guildId, messageId) {
  await q('DELETE FROM ad_posts WHERE guild_id = ? AND message_id = ?', [guildId, messageId]);
}

// ── Case ID Generator ─────────────────────────────────────────────────────────

async function generateCaseId(guildId) {
  const [w] = await q('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ?', [guildId]);
  const [a] = await q('SELECT COUNT(*) AS c FROM ad_warns WHERE guild_id = ?', [guildId]);
  const [s] = await q('SELECT COUNT(*) AS c FROM strikes WHERE guild_id = ?', [guildId]);
  const total = (Number(w?.c) || 0) + (Number(a?.c) || 0) + (Number(s?.c) || 0) + 1;
  return `CASE-${String(total).padStart(4, '0')}`;
}

// ── Warns ─────────────────────────────────────────────────────────────────────

export async function addWarn(guildId, userId, moderatorId, reason) {
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, ts()]);
  return caseId;
}

export async function getWarns(guildId, userId) {
  return q('SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

export async function getWarnCount(guildId, userId) {
  const [row] = await q('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return Number(row?.c) || 0;
}

export async function getWarnLeaderboard(guildId, limit = 10) {
  return q('SELECT user_id, COUNT(*) AS count FROM warns WHERE guild_id = ? GROUP BY user_id ORDER BY count DESC LIMIT ?',
    [guildId, limit]);
}

// ── Ad Warns ──────────────────────────────────────────────────────────────────

export async function addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent) {
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO ad_warns (case_id, guild_id, user_id, moderator_id, reason, message_id, message_content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, messageId ?? null, messageContent ?? null, ts()]);
  return caseId;
}

export async function getAdWarns(guildId, userId) {
  return q('SELECT * FROM ad_warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

export async function removeAdWarn(guildId, caseId) {
  const result = await q('DELETE FROM ad_warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return result.affectedRows > 0;
}

export async function getAdWarnCountByModerator(guildId, moderatorId) {
  const [row] = await q('SELECT COUNT(*) AS c FROM ad_warns WHERE guild_id = ? AND moderator_id = ?', [guildId, moderatorId]);
  return Number(row?.c) || 0;
}

// ── Strikes ───────────────────────────────────────────────────────────────────

export async function addStrike(guildId, userId, moderatorId, reason) {
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO strikes (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, ts()]);
  return caseId;
}

export async function getStrikeCount(guildId, userId) {
  const [row] = await q('SELECT COUNT(*) AS c FROM strikes WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return Number(row?.c) || 0;
}

export async function removeStrike(guildId, caseId) {
  const result = await q('DELETE FROM strikes WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return result.affectedRows > 0;
}

// ── Case Info (cross-table) ───────────────────────────────────────────────────

export async function getCaseInfo(guildId, caseId) {
  let row = await q1('SELECT *, "warn" AS type FROM warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  if (!row) row = await q1('SELECT *, "ad_warn" AS type FROM ad_warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  if (!row) row = await q1('SELECT *, "strike" AS type FROM strikes WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return row ?? null;
}

// ── Jailed Users ──────────────────────────────────────────────────────────────

export async function jailUser(guildId, userId, originalRoles) {
  await q(
    'INSERT INTO jailed_users (guild_id, user_id, original_roles, jailed_at) VALUES (?, ?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE original_roles = VALUES(original_roles), jailed_at = VALUES(jailed_at)',
    [guildId, userId, JSON.stringify(originalRoles), ts()]
  );
}

export async function unjailUser(guildId, userId) {
  const entry = await q1('SELECT * FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!entry) return null;
  await q('DELETE FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return parseJson(entry.original_roles, []);
}

export async function isJailed(guildId, userId) {
  const row = await q1('SELECT guild_id FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

// ── Message Counts ────────────────────────────────────────────────────────────

export async function incrementMessageCount(guildId, userId) {
  await q(
    'INSERT INTO message_counts (guild_id, user_id, count) VALUES (?, ?, 1) ' +
    'ON DUPLICATE KEY UPDATE count = count + 1',
    [guildId, userId]
  );
}

export async function getMessageCount(guildId, userId) {
  const row = await q1('SELECT count FROM message_counts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return row?.count || 0;
}

export async function getMessageLeaderboard(guildId, limit = 10) {
  return q('SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC LIMIT ?', [guildId, limit]);
}

export async function resetMessages(guildId, userId) {
  await q('DELETE FROM message_counts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function resetMessagesAll(guildId) {
  await q('DELETE FROM message_counts WHERE guild_id = ?', [guildId]);
}

// ── Snipe Cache ───────────────────────────────────────────────────────────────

export async function setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar) {
  await q(
    'INSERT INTO snipe_cache (guild_id, channel_id, content, author_id, author_name, author_avatar, deleted_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE content = VALUES(content), author_id = VALUES(author_id), ' +
    'author_name = VALUES(author_name), author_avatar = VALUES(author_avatar), deleted_at = VALUES(deleted_at)',
    [guildId, channelId, content, authorId, authorName, authorAvatar, ts()]
  );
}

export async function getSnipeCache(guildId, channelId) {
  return q1('SELECT * FROM snipe_cache WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

// ── Balances ──────────────────────────────────────────────────────────────────

export async function getBalance(guildId, userId) {
  const row = await q1('SELECT balance FROM balances WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return row?.balance || 0;
}

export async function setBalance(guildId, userId, amount) {
  await q(
    'INSERT INTO balances (guild_id, user_id, balance) VALUES (?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE balance = VALUES(balance)',
    [guildId, userId, amount]
  );
}

// ── Breaks ────────────────────────────────────────────────────────────────────

export async function startBreak(guildId, userId, username, reason, savedRoles = [], endAt = null) {
  const existing = await q1('SELECT id FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (existing) return false;
  await q(
    'INSERT INTO breaks (guild_id, user_id, username, reason, started_at, end_at, saved_roles) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [guildId, userId, username, reason ?? null, ts(), endAt, JSON.stringify(savedRoles)]
  );
  return true;
}

export async function endBreak(guildId, userId) {
  const entry = await q1('SELECT * FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!entry) return null;
  await q('DELETE FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  entry.saved_roles = parseJson(entry.saved_roles, []);
  return entry;
}

export async function extendBreak(guildId, userId, extraSeconds) {
  const row = await q1('SELECT * FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!row) return null;
  const base = row.end_at ?? ts();
  const newEnd = base + extraSeconds;
  await q('UPDATE breaks SET end_at = ? WHERE guild_id = ? AND user_id = ?', [newEnd, guildId, userId]);
  row.end_at = newEnd;
  row.saved_roles = parseJson(row.saved_roles, []);
  return row;
}

export async function getCurrentBreaks(guildId) {
  const rows = await q('SELECT * FROM breaks WHERE guild_id = ? ORDER BY started_at ASC', [guildId]);
  return rows.map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export async function getExpiredBreaks() {
  const now = ts();
  const rows = await q('SELECT * FROM breaks WHERE end_at IS NOT NULL AND end_at <= ?', [now]);
  return rows.map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export async function isOnBreak(guildId, userId) {
  const row = await q1('SELECT id FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

// ── Applications ──────────────────────────────────────────────────────────────

export async function saveApplication(guildId, userId, username, data) {
  await q('DELETE FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  await q(
    'INSERT INTO applications (guild_id, user_id, username, data, submitted_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, username, JSON.stringify(data), ts()]
  );
}

export async function getApplication(guildId, userId) {
  const row = await q1('SELECT * FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!row) return null;
  const data = parseJson(row.data, {});
  return { ...row, ...data };
}

export async function removeApplication(guildId, userId) {
  const entry = await getApplication(guildId, userId);
  if (entry) await q('DELETE FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return entry ?? null;
}

// ── Bot Blacklist ─────────────────────────────────────────────────────────────

export async function addBlacklist(guildId, userId, moderatorId, reason) {
  await q('DELETE FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  await q(
    'INSERT INTO bot_blacklist (guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, moderatorId, reason, ts()]
  );
}

export async function isBlacklisted(guildId, userId) {
  const row = await q1('SELECT id FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

export async function getBlacklistEntry(guildId, userId) {
  return q1('SELECT * FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// ── Network Applications ──────────────────────────────────────────────────────

export async function saveNetworkApplication(targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age) {
  const result = await q(
    'INSERT INTO network_applications (target_guild_id, applicant_id, applicant_username, applicant_avatar, why, experience, timezone, age, status, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age, 'pending', ts()]
  );
  return result.insertId;
}

export async function getNetworkApplication(id) {
  return q1('SELECT * FROM network_applications WHERE id = ?', [Number(id)]);
}

export async function resolveNetworkApplication(id, status) {
  await q('UPDATE network_applications SET status = ? WHERE id = ?', [status, Number(id)]);
  return q1('SELECT * FROM network_applications WHERE id = ?', [Number(id)]);
}
