import { isConnected, getPool } from './dbState.js';
import * as fb from './jsonFallback.js';

function ts() { return Math.floor(Date.now() / 1000); }

async function q(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function q1(sql, params = []) {
  return (await q(sql, params))[0] ?? null;
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Guild Config ──────────────────────────────────────────────────────────────

export async function getGuild(guildId) {
  if (!isConnected()) return fb.getGuild(guildId);
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
  if (!isConnected()) return fb.setGuildConfig(guildId, fields);
  await getGuild(guildId);
  const allowed = [
    'log_channel_id', 'warn_log_channel_id', 'strike_log_channel_id',
    'request_log_channel_id', 'ad_warn_log_channel_id', 'ad_warn_dm_log_channel_id', 'staff_updates_channel_id',
    'jail_role_id', 'muted_role_id',
    'ban_request_channel_id', 'blacklist_request_channel_id',
    'network_ban_request_channel_id', 'partnership_request_channel_id',
    'break_request_channel_id', 'break_role_id', 'main_break_role_id',
    'resign_channel_id', 'verified_role_id', 'applications_channel_id',
    'referral_link', 'modmail_test_channel_id',
    'pfp_url', 'banner_url',
    'network_apply_log_channel_id', 'network_apply_roles',
    'hub_mod_role_id', 'hub_team_lead_role_id', 'hub_admin_role_id', 'hub_owner_role_id',
    'level_log_channel_id', 'level_xp_channel_id', 'leveling_enabled',
    'abuse_log_channel_id',
  ];
  const sets = []; const params = [];
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
  if (!isConnected()) return fb.setCommandRoles(guildId, command, roleIds);
  const guild = await getGuild(guildId);
  const cr = guild.command_roles || {};
  cr[command] = roleIds;
  await q('UPDATE guilds SET command_roles = ? WHERE guild_id = ?', [JSON.stringify(cr), guildId]);
}

export async function getCommandRoles(guildId, command) {
  if (!isConnected()) return fb.getCommandRoles(guildId, command);
  const guild = await getGuild(guildId);
  return (guild.command_roles || {})[command] || [];
}

export async function setNetworkHub(guildId, isHub) {
  if (!isConnected()) return fb.setNetworkHub(guildId, isHub);
  await getGuild(guildId);
  await q('UPDATE guilds SET is_hub = ? WHERE guild_id = ?', [isHub ? 1 : 0, guildId]);
}

export async function setHubGuildId(guildId, hubGuildId) {
  if (!isConnected()) return fb.setHubGuildId(guildId, hubGuildId);
  await getGuild(guildId);
  await q('UPDATE guilds SET hub_guild_id = ? WHERE guild_id = ?', [hubGuildId, guildId]);
}

export async function clearNetworkHub(guildId) {
  if (!isConnected()) return fb.clearNetworkHub(guildId);
  await getGuild(guildId);
  await q('UPDATE guilds SET is_hub = 0 WHERE guild_id = ?', [guildId]);
}

export async function clearHubGuildId(guildId) {
  if (!isConnected()) return fb.clearHubGuildId(guildId);
  await getGuild(guildId);
  await q('UPDATE guilds SET hub_guild_id = NULL WHERE guild_id = ?', [guildId]);
}

export async function getNetworkHub() {
  if (!isConnected()) return fb.getNetworkHub();
  return q1('SELECT * FROM guilds WHERE is_hub = 1 LIMIT 1');
}

export async function autoLinkGuilds(hubGuildId, guildIds) {
  if (!isConnected()) return fb.autoLinkGuilds(hubGuildId, guildIds);
  for (const guildId of guildIds) {
    if (guildId === hubGuildId) continue;
    await getGuild(guildId);
    await q('UPDATE guilds SET hub_guild_id = ? WHERE guild_id = ?', [hubGuildId, guildId]);
  }
}

export async function setAutoReact(_guildId, userId, emojiId, emojiName, animated) {
  if (!isConnected()) return fb.setAutoReact(_guildId, userId, emojiId, emojiName, animated);
  await q(
    `INSERT INTO auto_reacts (guild_id, user_id, emoji_id, emoji_name, animated)
     VALUES ('global', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE emoji_id = VALUES(emoji_id), emoji_name = VALUES(emoji_name), animated = VALUES(animated)`,
    [userId, emojiId, emojiName, animated ? 1 : 0]
  );
}

export async function getAutoReact(_guildId, userId) {
  if (!isConnected()) return fb.getAutoReact(_guildId, userId);
  return q1(
    `SELECT * FROM auto_reacts WHERE user_id = ? ORDER BY (guild_id = 'global') DESC LIMIT 1`,
    [userId]
  );
}

export async function clearAutoReact(_guildId, userId) {
  if (!isConnected()) return fb.clearAutoReact(_guildId, userId);
  await q('DELETE FROM auto_reacts WHERE user_id = ?', [userId]);
}

export async function getAllAutoReactEmojiIds() {
  if (!isConnected()) return fb.getAllAutoReactEmojiIds();
  const rows = await q('SELECT DISTINCT emoji_id FROM auto_reacts WHERE emoji_id IS NOT NULL');
  return rows.map(r => r.emoji_id);
}

export async function blockAutoReact(_guildId, userId) {
  if (!isConnected()) return fb.blockAutoReact(_guildId, userId);
  await q(
    `INSERT INTO auto_reacts (guild_id, user_id, emoji_id, emoji_name, animated)
     VALUES ('global', ?, NULL, '__blocked__', 0)
     ON DUPLICATE KEY UPDATE emoji_id = NULL, emoji_name = '__blocked__', animated = 0`,
    [userId]
  );
}

export async function isAutoReactBlocked(_guildId, userId) {
  if (!isConnected()) return fb.isAutoReactBlocked(_guildId, userId);
  const row = await q1(
    `SELECT emoji_name FROM auto_reacts WHERE user_id = ? ORDER BY (guild_id = 'global') DESC LIMIT 1`,
    [userId]
  );
  return row?.emoji_name === '__blocked__';
}

export async function getArExpiry(userId) {
  if (!isConnected()) return fb.getArExpiry(userId);
  const row = await q1(
    `SELECT ar_expires_at FROM auto_reacts WHERE user_id = ? ORDER BY (guild_id = 'global') DESC LIMIT 1`,
    [userId]
  );
  return row?.ar_expires_at ?? null;
}

export async function renewArSubscription(userId) {
  if (!isConnected()) return fb.renewArSubscription(userId);
  const result = await q(
    `UPDATE auto_reacts
     SET ar_expires_at = DATE_ADD(GREATEST(COALESCE(ar_expires_at, NOW()), NOW()), INTERVAL 7 DAY)
     WHERE user_id = ?`,
    [userId]
  );
  if (result.affectedRows === 0) {
    await q(
      `INSERT IGNORE INTO auto_reacts (guild_id, user_id, emoji_id, emoji_name, animated, ar_expires_at)
       VALUES ('global', ?, '', '__pending__', 0, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [userId]
    );
  }
  return getArExpiry(userId);
}

export async function setGithubRepo(guildId, repo) {
  if (!isConnected()) return fb.setGithubRepo(guildId, repo);
  await getGuild(guildId);
  await q('UPDATE guilds SET github_repo = ? WHERE guild_id = ?', [repo || null, guildId]);
}

export async function setHubStaffRoles(guildId, modRoleId, teamLeadRoleId, adminRoleId) {
  if (!isConnected()) return fb.setHubStaffRoles(guildId, modRoleId, teamLeadRoleId, adminRoleId);
  const current = await getGuild(guildId);
  const mod      = modRoleId      ?? current.hub_mod_role_id      ?? null;
  const teamLead = teamLeadRoleId ?? current.hub_team_lead_role_id ?? null;
  const admin    = adminRoleId    ?? current.hub_admin_role_id    ?? null;
  await q(
    'UPDATE guilds SET hub_mod_role_id = ?, hub_team_lead_role_id = ?, hub_admin_role_id = ? WHERE guild_id = ?',
    [mod, teamLead, admin, guildId]
  );
}

export async function setOwnerRole(guildId, ownerRoleId) {
  if (!isConnected()) return fb.setOwnerRole(guildId, ownerRoleId);
  await getGuild(guildId);
  await q('UPDATE guilds SET hub_owner_role_id = ? WHERE guild_id = ?', [ownerRoleId || null, guildId]);
}

export async function resolveNetworkRoleIds(guildId) {
  if (!isConnected()) return fb.resolveNetworkRoleIds(guildId);
  const guild = await getGuild(guildId);
  return {
    ownerRoleId:    guild.hub_owner_role_id     || null,
    modRoleId:      guild.hub_mod_role_id       || null,
    teamLeadRoleId: guild.hub_team_lead_role_id || null,
    adminRoleId:    guild.hub_admin_role_id     || null,
  };
}

export async function getNetworkMembers(hubGuildId) {
  if (!isConnected()) return fb.getNetworkMembers(hubGuildId);
  const rows = await q('SELECT guild_id FROM guilds WHERE hub_guild_id = ?', [hubGuildId]);
  return rows.map(r => ({ guild_id: r.guild_id }));
}

export async function setNetworkApplyConfig(guildId, logChannelId, roles) {
  if (!isConnected()) return fb.setNetworkApplyConfig(guildId, logChannelId, roles);
  await getGuild(guildId);
  await q('UPDATE guilds SET network_apply_log_channel_id = ?, network_apply_roles = ? WHERE guild_id = ?',
    [logChannelId, JSON.stringify(roles || []), guildId]);
}

export async function getNetworkApplyConfig(guildId) {
  if (!isConnected()) return fb.getNetworkApplyConfig(guildId);
  const g = await getGuild(guildId);
  return { logChannelId: g.network_apply_log_channel_id || null, roles: g.network_apply_roles || [] };
}

// ── Ad Channels ───────────────────────────────────────────────────────────────

export async function addAdChannel(guildId, channelId) {
  if (!isConnected()) return fb.addAdChannel(guildId, channelId);
  await q('INSERT IGNORE INTO ad_channels (guild_id, channel_id) VALUES (?, ?)', [guildId, channelId]);
}

export async function removeAdChannel(guildId, channelId) {
  if (!isConnected()) return fb.removeAdChannel(guildId, channelId);
  const result = await q('DELETE FROM ad_channels WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  return result.affectedRows > 0;
}

export async function getAdChannels(guildId) {
  if (!isConnected()) return fb.getAdChannels(guildId);
  const rows = await q('SELECT channel_id FROM ad_channels WHERE guild_id = ?', [guildId]);
  return rows.map(r => r.channel_id);
}

export async function isAdChannel(guildId, channelId) {
  if (!isConnected()) return fb.isAdChannel(guildId, channelId);
  const row = await q1('SELECT guild_id FROM ad_channels WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  return !!row;
}

// ── Ad Posts ──────────────────────────────────────────────────────────────────

export async function trackAdPost(guildId, channelId, messageId, userId) {
  if (!isConnected()) return fb.trackAdPost(guildId, channelId, messageId, userId);
  await q('INSERT IGNORE INTO ad_posts (guild_id, channel_id, message_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, userId, ts()]);
}

export async function getAdPostsByUser(guildId, userId) {
  if (!isConnected()) return fb.getAdPostsByUser(guildId, userId);
  return q('SELECT channel_id, message_id FROM ad_posts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function clearAdPostsByUser(guildId, userId) {
  if (!isConnected()) return fb.clearAdPostsByUser(guildId, userId);
  await q('DELETE FROM ad_posts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function removeAdPostRecord(guildId, messageId) {
  if (!isConnected()) return fb.removeAdPostRecord(guildId, messageId);
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
  if (!isConnected()) return fb.addWarn(guildId, userId, moderatorId, reason);
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, ts()]);
  return caseId;
}

export async function getWarns(guildId, userId) {
  if (!isConnected()) return fb.getWarns(guildId, userId);
  return q('SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

export async function getWarnCount(guildId, userId) {
  if (!isConnected()) return fb.getWarnCount(guildId, userId);
  const [row] = await q('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return Number(row?.c) || 0;
}

export async function removeWarn(guildId, caseId) {
  if (!isConnected()) return fb.removeWarn(guildId, caseId);
  const result = await q('DELETE FROM warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return result.affectedRows > 0;
}

export async function getLastWarnTime(guildId, userId) {
  if (!isConnected()) return fb.getLastWarnTime(guildId, userId);
  const row = await q1('SELECT created_at FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', [guildId, userId]);
  return row?.created_at ?? null;
}

export async function getWarnLeaderboard(guildId, limit = 10) {
  if (!isConnected()) return fb.getWarnLeaderboard(guildId, limit);
  return q('SELECT user_id, COUNT(*) AS count FROM warns WHERE guild_id = ? GROUP BY user_id ORDER BY count DESC LIMIT ?',
    [guildId, limit]);
}

// ── Ad Warns ──────────────────────────────────────────────────────────────────

export async function addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent) {
  if (!isConnected()) return fb.addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent);
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO ad_warns (case_id, guild_id, user_id, moderator_id, reason, message_id, message_content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, messageId ?? null, messageContent ?? null, ts()]);
  return caseId;
}

export async function getAdWarns(guildId, userId) {
  if (!isConnected()) return fb.getAdWarns(guildId, userId);
  return q('SELECT * FROM ad_warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

export async function removeAdWarn(guildId, caseId) {
  if (!isConnected()) return fb.removeAdWarn(guildId, caseId);
  const result = await q('DELETE FROM ad_warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return result.affectedRows > 0;
}

export async function getAdWarnCountByModerator(guildId, moderatorId) {
  if (!isConnected()) return fb.getAdWarnCountByModerator(guildId, moderatorId);
  const [row] = await q('SELECT COUNT(*) AS c FROM ad_warns WHERE guild_id = ? AND moderator_id = ?', [guildId, moderatorId]);
  return Number(row?.c) || 0;
}

// ── Strikes ───────────────────────────────────────────────────────────────────

export async function addStrike(guildId, userId, moderatorId, reason) {
  if (!isConnected()) return fb.addStrike(guildId, userId, moderatorId, reason);
  const caseId = await generateCaseId(guildId);
  await q('INSERT INTO strikes (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [caseId, guildId, userId, moderatorId, reason, ts()]);
  return caseId;
}

export async function getStrikeCount(guildId, userId) {
  if (!isConnected()) return fb.getStrikeCount(guildId, userId);
  const [row] = await q('SELECT COUNT(*) AS c FROM strikes WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return Number(row?.c) || 0;
}

export async function removeStrike(guildId, caseId) {
  if (!isConnected()) return fb.removeStrike(guildId, caseId);
  const result = await q('DELETE FROM strikes WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return result.affectedRows > 0;
}

// ── Case Info ─────────────────────────────────────────────────────────────────

export async function getCaseInfo(guildId, caseId) {
  if (!isConnected()) return fb.getCaseInfo(guildId, caseId);
  let row = await q1('SELECT *, "warn" AS type FROM warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  if (!row) row = await q1('SELECT *, "ad_warn" AS type FROM ad_warns WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  if (!row) row = await q1('SELECT *, "strike" AS type FROM strikes WHERE guild_id = ? AND case_id = ?', [guildId, caseId]);
  return row ?? null;
}

// ── Jailed Users ──────────────────────────────────────────────────────────────

export async function jailUser(guildId, userId, originalRoles) {
  if (!isConnected()) return fb.jailUser(guildId, userId, originalRoles);
  await q(
    'INSERT INTO jailed_users (guild_id, user_id, original_roles, jailed_at) VALUES (?, ?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE original_roles = VALUES(original_roles), jailed_at = VALUES(jailed_at)',
    [guildId, userId, JSON.stringify(originalRoles), ts()]
  );
}

export async function unjailUser(guildId, userId) {
  if (!isConnected()) return fb.unjailUser(guildId, userId);
  const entry = await q1('SELECT * FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!entry) return null;
  await q('DELETE FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return parseJson(entry.original_roles, []);
}

export async function isJailed(guildId, userId) {
  if (!isConnected()) return fb.isJailed(guildId, userId);
  const row = await q1('SELECT guild_id FROM jailed_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

// ── Message Counts ────────────────────────────────────────────────────────────

export async function incrementMessageCount(guildId, userId) {
  if (!isConnected()) return fb.incrementMessageCount(guildId, userId);
  await q(
    'INSERT INTO message_counts (guild_id, user_id, count) VALUES (?, ?, 1) ' +
    'ON DUPLICATE KEY UPDATE count = count + 1',
    [guildId, userId]
  );
}

export async function getMessageCount(guildId, userId) {
  if (!isConnected()) return fb.getMessageCount(guildId, userId);
  const row = await q1('SELECT count FROM message_counts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return row?.count || 0;
}

export async function getMessageLeaderboard(guildId, limit = 10) {
  if (!isConnected()) return fb.getMessageLeaderboard(guildId, limit);
  return q('SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC LIMIT ?', [guildId, limit]);
}

export async function resetMessages(guildId, userId) {
  if (!isConnected()) return fb.resetMessages(guildId, userId);
  await q('DELETE FROM message_counts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function resetMessagesAll(guildId) {
  if (!isConnected()) return fb.resetMessagesAll(guildId);
  await q('DELETE FROM message_counts WHERE guild_id = ?', [guildId]);
}

// ── Snipe Cache ───────────────────────────────────────────────────────────────

export async function setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar) {
  if (!isConnected()) return fb.setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar);
  await q(
    'INSERT INTO snipe_cache (guild_id, channel_id, content, author_id, author_name, author_avatar, deleted_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE content = VALUES(content), author_id = VALUES(author_id), ' +
    'author_name = VALUES(author_name), author_avatar = VALUES(author_avatar), deleted_at = VALUES(deleted_at)',
    [guildId, channelId, content, authorId, authorName, authorAvatar, ts()]
  );
}

export async function getSnipeCache(guildId, channelId) {
  if (!isConnected()) return fb.getSnipeCache(guildId, channelId);
  return q1('SELECT * FROM snipe_cache WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

// ── Balances ──────────────────────────────────────────────────────────────────

export async function getBalance(guildId, userId) {
  if (!isConnected()) return fb.getBalance(guildId, userId);
  const row = await q1('SELECT balance FROM balances WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return row?.balance || 0;
}

export async function setBalance(guildId, userId, amount) {
  if (!isConnected()) return fb.setBalance(guildId, userId, amount);
  await q(
    'INSERT INTO balances (guild_id, user_id, balance) VALUES (?, ?, ?) ' +
    'ON DUPLICATE KEY UPDATE balance = VALUES(balance)',
    [guildId, userId, amount]
  );
}

export async function addBalance(guildId, userId, amount) {
  if (!isConnected()) return fb.addBalance(guildId, userId, amount);
  const current = await getBalance(guildId, userId);
  await setBalance(guildId, userId, current + amount);
  return current + amount;
}

// ── Breaks ────────────────────────────────────────────────────────────────────

export async function startBreak(guildId, userId, username, reason, savedRoles = [], endAt = null) {
  if (!isConnected()) return fb.startBreak(guildId, userId, username, reason, savedRoles, endAt);
  const existing = await q1('SELECT id FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (existing) return false;
  await q(
    'INSERT INTO breaks (guild_id, user_id, username, reason, started_at, end_at, saved_roles) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [guildId, userId, username, reason ?? null, ts(), endAt, JSON.stringify(savedRoles)]
  );
  return true;
}

export async function endBreak(guildId, userId) {
  if (!isConnected()) return fb.endBreak(guildId, userId);
  const entry = await q1('SELECT * FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!entry) return null;
  await q('DELETE FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  entry.saved_roles = parseJson(entry.saved_roles, []);
  return entry;
}

export async function extendBreak(guildId, userId, extraSeconds) {
  if (!isConnected()) return fb.extendBreak(guildId, userId, extraSeconds);
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
  if (!isConnected()) return fb.getCurrentBreaks(guildId);
  const rows = await q('SELECT * FROM breaks WHERE guild_id = ? ORDER BY started_at ASC', [guildId]);
  return rows.map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export async function getExpiredBreaks() {
  if (!isConnected()) return fb.getExpiredBreaks();
  const now = ts();
  const rows = await q('SELECT * FROM breaks WHERE end_at IS NOT NULL AND end_at <= ?', [now]);
  return rows.map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export async function isOnBreak(guildId, userId) {
  if (!isConnected()) return fb.isOnBreak(guildId, userId);
  const row = await q1('SELECT id FROM breaks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

// ── Bot Applications ──────────────────────────────────────────────────────────

export async function saveApplication(guildId, userId, username, data) {
  if (!isConnected()) return fb.saveApplication(guildId, userId, username, data);
  await q('DELETE FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  await q(
    'INSERT INTO applications (guild_id, user_id, username, data, submitted_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, username, JSON.stringify(data), ts()]
  );
}

export async function getApplication(guildId, userId) {
  if (!isConnected()) return fb.getBotApplication(guildId, userId);
  const row = await q1('SELECT * FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!row) return null;
  return { ...row, ...parseJson(row.data, {}) };
}

export async function removeApplication(guildId, userId) {
  if (!isConnected()) return fb.removeApplication(guildId, userId);
  const entry = await getApplication(guildId, userId);
  if (entry) await q('DELETE FROM applications WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return entry ?? null;
}

// ── Bot Blacklist ─────────────────────────────────────────────────────────────

export async function addBlacklist(guildId, userId, moderatorId, reason) {
  if (!isConnected()) return fb.addBlacklist(guildId, userId, moderatorId, reason);
  await q('DELETE FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  await q(
    'INSERT INTO bot_blacklist (guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, moderatorId, reason, ts()]
  );
}

export async function isBlacklisted(guildId, userId) {
  if (!isConnected()) return fb.isBlacklisted(guildId, userId);
  const row = await q1('SELECT id FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return !!row;
}

export async function getBlacklistEntry(guildId, userId) {
  if (!isConnected()) return fb.getBlacklistEntry(guildId, userId);
  return q1('SELECT * FROM bot_blacklist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// ── Leveling ──────────────────────────────────────────────────────────────────

export function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

export function computeLevel(totalXp) {
  let level = 0;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXp: remaining, xpNeeded: xpForLevel(level), totalXp };
}

export async function getUserLevel(guildId, userId) {
  if (!isConnected()) return fb.getUserLevel(guildId, userId);
  return q1('SELECT total_xp FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

export async function addUserXp(guildId, userId, amount) {
  if (!isConnected()) return fb.addUserXp(guildId, userId, amount);
  await q(
    'INSERT INTO levels (guild_id, user_id, total_xp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE total_xp = total_xp + ?',
    [guildId, userId, amount, amount]
  );
  const row = await q1('SELECT total_xp FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return Number(row?.total_xp) || 0;
}

export async function setUserXp(guildId, userId, xp) {
  if (!isConnected()) return fb.setUserXp(guildId, userId, xp);
  await q(
    'INSERT INTO levels (guild_id, user_id, total_xp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE total_xp = ?',
    [guildId, userId, xp, xp]
  );
}

export async function getLevelLeaderboard(guildId, limit = 10) {
  if (!isConnected()) return fb.getLevelLeaderboard(guildId, limit);
  return q('SELECT user_id, total_xp FROM levels WHERE guild_id = ? ORDER BY total_xp DESC LIMIT ?', [guildId, limit]);
}

// ── Command Toggles ───────────────────────────────────────────────────────────

export async function disableCommand(guildId, commandName) {
  if (!isConnected()) return fb.disableCommand(guildId, commandName);
  await q('INSERT IGNORE INTO disabled_commands (guild_id, command_name) VALUES (?, ?)', [guildId, commandName]);
}

export async function enableCommand(guildId, commandName) {
  if (!isConnected()) return fb.enableCommand(guildId, commandName);
  await q('DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [guildId, commandName]);
}

export async function isCommandDisabled(guildId, commandName) {
  if (!isConnected()) return fb.isCommandDisabled(guildId, commandName);
  const row = await q1('SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [guildId, commandName]);
  return !!row;
}

export async function getDisabledCommands(guildId) {
  if (!isConnected()) return fb.getDisabledCommands(guildId);
  const rows = await q('SELECT command_name FROM disabled_commands WHERE guild_id = ?', [guildId]);
  return rows.map(r => r.command_name);
}

const DM_SENTINEL = '__DM__';

export async function disableDmCommand(commandName) {
  if (!isConnected()) return fb.disableDmCommand(commandName);
  await q('INSERT IGNORE INTO disabled_commands (guild_id, command_name) VALUES (?, ?)', [DM_SENTINEL, commandName]);
}

export async function enableDmCommand(commandName) {
  if (!isConnected()) return fb.enableDmCommand(commandName);
  await q('DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [DM_SENTINEL, commandName]);
}

export async function isDmCommandDisabled(commandName) {
  if (!isConnected()) return fb.isDmCommandDisabled(commandName);
  const row = await q1('SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [DM_SENTINEL, commandName]);
  return !!row;
}

export async function getDmDisabledCommands() {
  if (!isConnected()) return fb.getDmDisabledCommands();
  const rows = await q('SELECT command_name FROM disabled_commands WHERE guild_id = ?', [DM_SENTINEL]);
  return rows.map(r => r.command_name);
}

// ── Staff Server ──────────────────────────────────────────────────────────────

export async function setAsStaffServer(guildId) {
  if (!isConnected()) return fb.setAsStaffServer(guildId);
  await q('UPDATE guilds SET is_staff_server = 0', []);
  await q('INSERT INTO guilds (guild_id, is_staff_server) VALUES (?, 1) ON DUPLICATE KEY UPDATE is_staff_server = 1', [guildId]);
}

export async function unsetStaffServer(guildId) {
  if (!isConnected()) return fb.unsetStaffServer(guildId);
  await q('UPDATE guilds SET is_staff_server = 0 WHERE guild_id = ?', [guildId]);
}

export async function getStaffServer() {
  if (!isConnected()) return fb.getStaffServer();
  return q1('SELECT * FROM guilds WHERE is_staff_server = 1 LIMIT 1');
}

export async function setStaffGuildId(guildId, staffGuildId) {
  if (!isConnected()) return fb.setStaffGuildId(guildId, staffGuildId);
  await q('INSERT INTO guilds (guild_id, staff_guild_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE staff_guild_id = ?', [guildId, staffGuildId, staffGuildId]);
}

// ── Network Applications ──────────────────────────────────────────────────────

export async function saveNetworkApplication(targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age) {
  if (!isConnected()) return fb.saveNetworkApplication(targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age);
  const result = await q(
    'INSERT INTO network_applications (target_guild_id, applicant_id, applicant_username, applicant_avatar, why, experience, timezone, age, status, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age, 'pending', ts()]
  );
  return result.insertId;
}

export async function getNetworkApplication(id) {
  if (!isConnected()) return fb.getNetworkApplication(id);
  return q1('SELECT * FROM network_applications WHERE id = ?', [Number(id)]);
}

export async function resolveNetworkApplication(id, status) {
  if (!isConnected()) return fb.resolveNetworkApplication(id, status);
  await q('UPDATE network_applications SET status = ? WHERE id = ?', [status, Number(id)]);
  return q1('SELECT * FROM network_applications WHERE id = ?', [Number(id)]);
}

// ── Sticky Messages ───────────────────────────────────────────────────────────

export async function getStickyMessage(guildId, channelId) {
  if (!isConnected()) return fb.getStickyMessage(guildId, channelId);
  return q1('SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

export async function setStickyMessage(guildId, channelId, message) {
  if (!isConnected()) return fb.setStickyMessage(guildId, channelId, message);
  await q(
    `INSERT INTO sticky_messages (guild_id, channel_id, message) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE message = VALUES(message)`,
    [guildId, channelId, message]
  );
}

export async function deleteStickyMessage(guildId, channelId) {
  if (!isConnected()) return fb.deleteStickyMessage(guildId, channelId);
  await q('DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  await q('DELETE FROM sticky_channel_state WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

export async function getStickyChannelState(guildId, channelId) {
  if (!isConnected()) return fb.getStickyChannelState(guildId, channelId);
  return q1('SELECT last_message_id FROM sticky_channel_state WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

export async function updateStickyChannelState(guildId, channelId, messageId) {
  if (!isConnected()) return fb.updateStickyChannelState(guildId, channelId, messageId);
  await q(
    `INSERT INTO sticky_channel_state (guild_id, channel_id, last_message_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_message_id = VALUES(last_message_id)`,
    [guildId, channelId, messageId]
  );
}

// ── Hall of Shame ─────────────────────────────────────────────────────────────

export async function isInHallOfShame(guildId, messageId) {
  if (!isConnected()) return fb.isInHallOfShame(guildId, messageId);
  const row = await q1('SELECT 1 FROM hall_of_shame WHERE guild_id = ? AND message_id = ?', [guildId, messageId]);
  return !!row;
}

export async function addToHallOfShame(guildId, messageId) {
  if (!isConnected()) return fb.addToHallOfShame(guildId, messageId);
  await q('INSERT IGNORE INTO hall_of_shame (guild_id, message_id) VALUES (?, ?)', [guildId, messageId]);
}
