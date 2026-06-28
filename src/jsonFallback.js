import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data', 'bot');
mkdirSync(dataDir, { recursive: true });

function readCol(name) {
  const path = join(dataDir, `${name}.json`);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function writeCol(name, data) {
  writeFileSync(join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));
}

function nextId(name) {
  const rows = readCol(name);
  if (!rows.length) return 1;
  return Math.max(...rows.map(r => r.id || 0)) + 1;
}

function ts() { return Math.floor(Date.now() / 1000); }

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Guild Config ──────────────────────────────────────────────────────────────

export function getGuild(guildId) {
  const rows = readCol('guilds');
  let row = rows.find(r => r.guild_id === guildId);
  if (!row) {
    row = { guild_id: guildId, command_roles: {}, network_apply_roles: [], is_hub: false, leveling_enabled: 1 };
    rows.push(row);
    writeCol('guilds', rows);
  }
  row.command_roles = parseJson(row.command_roles, {});
  row.network_apply_roles = parseJson(row.network_apply_roles, []);
  row.is_hub = !!row.is_hub;
  return row;
}

export function setGuildConfig(guildId, fields) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i < 0) return;
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
  for (const [key, val] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    rows[i][key] = key === 'network_apply_roles' ? JSON.stringify(val) : val;
  }
  writeCol('guilds', rows);
}

export function setCommandRoles(guildId, command, roleIds) {
  const guild = getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i < 0) return;
  const cr = parseJson(rows[i].command_roles, {});
  cr[command] = roleIds;
  rows[i].command_roles = JSON.stringify(cr);
  writeCol('guilds', rows);
}

export function getCommandRoles(guildId, command) {
  const guild = getGuild(guildId);
  return (guild.command_roles || {})[command] || [];
}

export function setNetworkHub(guildId, isHub) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].is_hub = isHub ? 1 : 0; writeCol('guilds', rows); }
}

export function setHubGuildId(guildId, hubGuildId) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].hub_guild_id = hubGuildId; writeCol('guilds', rows); }
}

export function clearNetworkHub(guildId) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].is_hub = 0; writeCol('guilds', rows); }
}

export function clearHubGuildId(guildId) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].hub_guild_id = null; writeCol('guilds', rows); }
}

export function getNetworkHub() {
  return readCol('guilds').find(r => r.is_hub == 1) ?? null;
}

export function autoLinkGuilds(hubGuildId, guildIds) {
  for (const guildId of guildIds) {
    if (guildId === hubGuildId) continue;
    getGuild(guildId);
    const rows = readCol('guilds');
    const i = rows.findIndex(r => r.guild_id === guildId);
    if (i >= 0) { rows[i].hub_guild_id = hubGuildId; writeCol('guilds', rows); }
  }
}

export function getNetworkMembers(hubGuildId) {
  return readCol('guilds').filter(r => r.hub_guild_id === hubGuildId).map(r => ({ guild_id: r.guild_id }));
}

export function setGithubRepo(guildId, repo) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].github_repo = repo || null; writeCol('guilds', rows); }
}

export function setHubStaffRoles(guildId, modRoleId, teamLeadRoleId, adminRoleId) {
  const current = getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) {
    rows[i].hub_mod_role_id      = modRoleId      ?? current.hub_mod_role_id      ?? null;
    rows[i].hub_team_lead_role_id = teamLeadRoleId ?? current.hub_team_lead_role_id ?? null;
    rows[i].hub_admin_role_id    = adminRoleId    ?? current.hub_admin_role_id    ?? null;
    writeCol('guilds', rows);
  }
}

export function setOwnerRole(guildId, ownerRoleId) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].hub_owner_role_id = ownerRoleId || null; writeCol('guilds', rows); }
}

export function resolveNetworkRoleIds(guildId) {
  const guild = getGuild(guildId);
  return {
    ownerRoleId:    guild.hub_owner_role_id     || null,
    modRoleId:      guild.hub_mod_role_id       || null,
    teamLeadRoleId: guild.hub_team_lead_role_id || null,
    adminRoleId:    guild.hub_admin_role_id     || null,
  };
}

export function setNetworkApplyConfig(guildId, logChannelId, roles) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) {
    rows[i].network_apply_log_channel_id = logChannelId;
    rows[i].network_apply_roles = JSON.stringify(roles || []);
    writeCol('guilds', rows);
  }
}

export function getNetworkApplyConfig(guildId) {
  const g = getGuild(guildId);
  return {
    logChannelId: g.network_apply_log_channel_id || null,
    roles: parseJson(g.network_apply_roles, []),
  };
}

export function setAsStaffServer(guildId) {
  const rows = readCol('guilds');
  for (const r of rows) r.is_staff_server = 0;
  let i = rows.findIndex(r => r.guild_id === guildId);
  if (i < 0) { rows.push({ guild_id: guildId }); i = rows.length - 1; }
  rows[i].is_staff_server = 1;
  writeCol('guilds', rows);
}

export function unsetStaffServer(guildId) {
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].is_staff_server = 0; writeCol('guilds', rows); }
}

export function getStaffServer() {
  return readCol('guilds').find(r => r.is_staff_server == 1) ?? null;
}

export function setStaffGuildId(guildId, staffGuildId) {
  getGuild(guildId);
  const rows = readCol('guilds');
  const i = rows.findIndex(r => r.guild_id === guildId);
  if (i >= 0) { rows[i].staff_guild_id = staffGuildId; writeCol('guilds', rows); }
}

// ── Ad Channels ───────────────────────────────────────────────────────────────

export function addAdChannel(guildId, channelId) {
  const rows = readCol('ad_channels');
  if (!rows.find(r => r.guild_id === guildId && r.channel_id === channelId)) {
    rows.push({ guild_id: guildId, channel_id: channelId });
    writeCol('ad_channels', rows);
  }
}

export function removeAdChannel(guildId, channelId) {
  const rows = readCol('ad_channels');
  const next = rows.filter(r => !(r.guild_id === guildId && r.channel_id === channelId));
  writeCol('ad_channels', next);
  return rows.length !== next.length;
}

export function getAdChannels(guildId) {
  return readCol('ad_channels').filter(r => r.guild_id === guildId).map(r => r.channel_id);
}

export function isAdChannel(guildId, channelId) {
  return !!readCol('ad_channels').find(r => r.guild_id === guildId && r.channel_id === channelId);
}

// ── Ad Posts ──────────────────────────────────────────────────────────────────

export function trackAdPost(guildId, channelId, messageId, userId) {
  const rows = readCol('ad_posts');
  if (!rows.find(r => r.guild_id === guildId && r.message_id === messageId)) {
    rows.push({ id: nextId('ad_posts'), guild_id: guildId, channel_id: channelId, message_id: messageId, user_id: userId, created_at: ts() });
    writeCol('ad_posts', rows);
  }
}

export function getAdPostsByUser(guildId, userId) {
  return readCol('ad_posts').filter(r => r.guild_id === guildId && r.user_id === userId).map(r => ({ channel_id: r.channel_id, message_id: r.message_id }));
}

export function clearAdPostsByUser(guildId, userId) {
  writeCol('ad_posts', readCol('ad_posts').filter(r => !(r.guild_id === guildId && r.user_id === userId)));
}

export function removeAdPostRecord(guildId, messageId) {
  writeCol('ad_posts', readCol('ad_posts').filter(r => !(r.guild_id === guildId && r.message_id === messageId)));
}

// ── Case ID Generator ─────────────────────────────────────────────────────────

function generateCaseId(guildId) {
  const warns   = readCol('warns').filter(r => r.guild_id === guildId).length;
  const adWarns = readCol('ad_warns').filter(r => r.guild_id === guildId).length;
  const strikes = readCol('strikes').filter(r => r.guild_id === guildId).length;
  const total   = warns + adWarns + strikes + 1;
  return `CASE-${String(total).padStart(4, '0')}`;
}

// ── Warns ─────────────────────────────────────────────────────────────────────

export function addWarn(guildId, userId, moderatorId, reason) {
  const caseId = generateCaseId(guildId);
  const rows = readCol('warns');
  rows.push({ id: nextId('warns'), case_id: caseId, guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, created_at: ts() });
  writeCol('warns', rows);
  return caseId;
}

export function getWarns(guildId, userId) {
  return readCol('warns').filter(r => r.guild_id === guildId && r.user_id === userId).sort((a, b) => b.created_at - a.created_at);
}

export function getWarnCount(guildId, userId) {
  return readCol('warns').filter(r => r.guild_id === guildId && r.user_id === userId).length;
}

export function removeWarn(guildId, caseId) {
  const rows = readCol('warns');
  const next = rows.filter(r => !(r.guild_id === guildId && r.case_id === caseId));
  writeCol('warns', next);
  return rows.length !== next.length;
}

export function getLastWarnTime(guildId, userId) {
  const rows = readCol('warns').filter(r => r.guild_id === guildId && r.user_id === userId).sort((a, b) => b.created_at - a.created_at);
  return rows[0]?.created_at ?? null;
}

export function getWarnLeaderboard(guildId, limit = 10) {
  const counts = {};
  for (const r of readCol('warns').filter(r => r.guild_id === guildId)) {
    counts[r.user_id] = (counts[r.user_id] || 0) + 1;
  }
  return Object.entries(counts).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

// ── Ad Warns ──────────────────────────────────────────────────────────────────

export function addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent) {
  const caseId = generateCaseId(guildId);
  const rows = readCol('ad_warns');
  rows.push({ id: nextId('ad_warns'), case_id: caseId, guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, message_id: messageId ?? null, message_content: messageContent ?? null, created_at: ts() });
  writeCol('ad_warns', rows);
  return caseId;
}

export function getAdWarns(guildId, userId) {
  return readCol('ad_warns').filter(r => r.guild_id === guildId && r.user_id === userId).sort((a, b) => b.created_at - a.created_at);
}

export function removeAdWarn(guildId, caseId) {
  const rows = readCol('ad_warns');
  const next = rows.filter(r => !(r.guild_id === guildId && r.case_id === caseId));
  writeCol('ad_warns', next);
  return rows.length !== next.length;
}

export function getAdWarnCountByModerator(guildId, moderatorId) {
  return readCol('ad_warns').filter(r => r.guild_id === guildId && r.moderator_id === moderatorId).length;
}

// ── Strikes ───────────────────────────────────────────────────────────────────

export function addStrike(guildId, userId, moderatorId, reason) {
  const caseId = generateCaseId(guildId);
  const rows = readCol('strikes');
  rows.push({ id: nextId('strikes'), case_id: caseId, guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, created_at: ts() });
  writeCol('strikes', rows);
  return caseId;
}

export function getStrikeCount(guildId, userId) {
  return readCol('strikes').filter(r => r.guild_id === guildId && r.user_id === userId).length;
}

export function removeStrike(guildId, caseId) {
  const rows = readCol('strikes');
  const next = rows.filter(r => !(r.guild_id === guildId && r.case_id === caseId));
  writeCol('strikes', next);
  return rows.length !== next.length;
}

// ── Case Info ─────────────────────────────────────────────────────────────────

export function getCaseInfo(guildId, caseId) {
  const w = readCol('warns').find(r => r.guild_id === guildId && r.case_id === caseId);
  if (w) return { ...w, type: 'warn' };
  const a = readCol('ad_warns').find(r => r.guild_id === guildId && r.case_id === caseId);
  if (a) return { ...a, type: 'ad_warn' };
  const s = readCol('strikes').find(r => r.guild_id === guildId && r.case_id === caseId);
  if (s) return { ...s, type: 'strike' };
  return null;
}

// ── Jailed Users ──────────────────────────────────────────────────────────────

export function jailUser(guildId, userId, originalRoles) {
  const rows = readCol('jailed_users');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  const entry = { guild_id: guildId, user_id: userId, original_roles: JSON.stringify(originalRoles), jailed_at: ts() };
  if (i >= 0) rows[i] = entry; else rows.push(entry);
  writeCol('jailed_users', rows);
}

export function unjailUser(guildId, userId) {
  const rows = readCol('jailed_users');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i < 0) return null;
  const [removed] = rows.splice(i, 1);
  writeCol('jailed_users', rows);
  return parseJson(removed.original_roles, []);
}

export function isJailed(guildId, userId) {
  return !!readCol('jailed_users').find(r => r.guild_id === guildId && r.user_id === userId);
}

// ── Message Counts ────────────────────────────────────────────────────────────

export function incrementMessageCount(guildId, userId) {
  const rows = readCol('message_counts');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i >= 0) rows[i].count += 1;
  else rows.push({ guild_id: guildId, user_id: userId, count: 1 });
  writeCol('message_counts', rows);
}

export function getMessageCount(guildId, userId) {
  return readCol('message_counts').find(r => r.guild_id === guildId && r.user_id === userId)?.count || 0;
}

export function getMessageLeaderboard(guildId, limit = 10) {
  return readCol('message_counts').filter(r => r.guild_id === guildId).sort((a, b) => b.count - a.count).slice(0, limit).map(r => ({ user_id: r.user_id, count: r.count }));
}

export function resetMessages(guildId, userId) {
  writeCol('message_counts', readCol('message_counts').filter(r => !(r.guild_id === guildId && r.user_id === userId)));
}

export function resetMessagesAll(guildId) {
  writeCol('message_counts', readCol('message_counts').filter(r => r.guild_id !== guildId));
}

// ── Snipe Cache ───────────────────────────────────────────────────────────────

export function setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar) {
  const rows = readCol('snipe_cache');
  const i = rows.findIndex(r => r.guild_id === guildId && r.channel_id === channelId);
  const entry = { guild_id: guildId, channel_id: channelId, content, author_id: authorId, author_name: authorName, author_avatar: authorAvatar, deleted_at: ts() };
  if (i >= 0) rows[i] = entry; else rows.push(entry);
  writeCol('snipe_cache', rows);
}

export function getSnipeCache(guildId, channelId) {
  return readCol('snipe_cache').find(r => r.guild_id === guildId && r.channel_id === channelId) ?? null;
}

// ── Balances ──────────────────────────────────────────────────────────────────

export function getBalance(guildId, userId) {
  return readCol('balances').find(r => r.guild_id === guildId && r.user_id === userId)?.balance || 0;
}

export function setBalance(guildId, userId, amount) {
  const rows = readCol('balances');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i >= 0) rows[i].balance = amount;
  else rows.push({ guild_id: guildId, user_id: userId, balance: amount });
  writeCol('balances', rows);
}

export function addBalance(guildId, userId, amount) {
  const current = getBalance(guildId, userId);
  setBalance(guildId, userId, current + amount);
  return current + amount;
}

// ── Breaks ────────────────────────────────────────────────────────────────────

export function startBreak(guildId, userId, username, reason, savedRoles = [], endAt = null) {
  const rows = readCol('breaks');
  if (rows.find(r => r.guild_id === guildId && r.user_id === userId)) return false;
  rows.push({ id: nextId('breaks'), guild_id: guildId, user_id: userId, username, reason: reason ?? null, started_at: ts(), end_at: endAt, saved_roles: JSON.stringify(savedRoles) });
  writeCol('breaks', rows);
  return true;
}

export function endBreak(guildId, userId) {
  const rows = readCol('breaks');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i < 0) return null;
  const [removed] = rows.splice(i, 1);
  writeCol('breaks', rows);
  removed.saved_roles = parseJson(removed.saved_roles, []);
  return removed;
}

export function extendBreak(guildId, userId, extraSeconds) {
  const rows = readCol('breaks');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i < 0) return null;
  const base = rows[i].end_at ?? ts();
  rows[i].end_at = base + extraSeconds;
  writeCol('breaks', rows);
  rows[i].saved_roles = parseJson(rows[i].saved_roles, []);
  return rows[i];
}

export function getCurrentBreaks(guildId) {
  return readCol('breaks').filter(r => r.guild_id === guildId).sort((a, b) => a.started_at - b.started_at).map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export function getExpiredBreaks() {
  const now = ts();
  return readCol('breaks').filter(r => r.end_at != null && r.end_at <= now).map(r => ({ ...r, saved_roles: parseJson(r.saved_roles, []) }));
}

export function isOnBreak(guildId, userId) {
  return !!readCol('breaks').find(r => r.guild_id === guildId && r.user_id === userId);
}

// ── Bot Applications (guild-level, separate from portal applications) ─────────

export function saveApplication(guildId, userId, username, data) {
  const rows = readCol('bot_applications');
  const next = rows.filter(r => !(r.guild_id === guildId && r.user_id === userId));
  next.push({ id: nextId('bot_applications'), guild_id: guildId, user_id: userId, username, data: JSON.stringify(data), submitted_at: ts() });
  writeCol('bot_applications', next);
}

export function getBotApplication(guildId, userId) {
  const row = readCol('bot_applications').find(r => r.guild_id === guildId && r.user_id === userId);
  if (!row) return null;
  const data = parseJson(row.data, {});
  return { ...row, ...data };
}

export function removeApplication(guildId, userId) {
  const rows = readCol('bot_applications');
  const entry = getBotApplication(guildId, userId);
  writeCol('bot_applications', rows.filter(r => !(r.guild_id === guildId && r.user_id === userId)));
  return entry;
}

// ── Bot Blacklist ─────────────────────────────────────────────────────────────

export function addBlacklist(guildId, userId, moderatorId, reason) {
  const rows = readCol('bot_blacklist');
  const next = rows.filter(r => !(r.guild_id === guildId && r.user_id === userId));
  next.push({ id: nextId('bot_blacklist'), guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, created_at: ts() });
  writeCol('bot_blacklist', next);
}

export function isBlacklisted(guildId, userId) {
  return !!readCol('bot_blacklist').find(r => r.guild_id === guildId && r.user_id === userId);
}

export function getBlacklistEntry(guildId, userId) {
  return readCol('bot_blacklist').find(r => r.guild_id === guildId && r.user_id === userId) ?? null;
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

export function getUserLevel(guildId, userId) {
  const row = readCol('levels').find(r => r.guild_id === guildId && r.user_id === userId);
  return row ? { total_xp: row.total_xp } : null;
}

export function addUserXp(guildId, userId, amount) {
  const rows = readCol('levels');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i >= 0) rows[i].total_xp = (rows[i].total_xp || 0) + amount;
  else rows.push({ guild_id: guildId, user_id: userId, total_xp: amount });
  writeCol('levels', rows);
  return rows[i >= 0 ? i : rows.length - 1].total_xp;
}

export function setUserXp(guildId, userId, xp) {
  const rows = readCol('levels');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i >= 0) rows[i].total_xp = xp;
  else rows.push({ guild_id: guildId, user_id: userId, total_xp: xp });
  writeCol('levels', rows);
}

export function getLevelLeaderboard(guildId, limit = 10) {
  return readCol('levels').filter(r => r.guild_id === guildId).sort((a, b) => b.total_xp - a.total_xp).slice(0, limit).map(r => ({ user_id: r.user_id, total_xp: r.total_xp }));
}

// ── Command Toggles ───────────────────────────────────────────────────────────

export function disableCommand(guildId, commandName) {
  const rows = readCol('disabled_commands');
  if (!rows.find(r => r.guild_id === guildId && r.command_name === commandName)) {
    rows.push({ guild_id: guildId, command_name: commandName });
    writeCol('disabled_commands', rows);
  }
}

export function enableCommand(guildId, commandName) {
  writeCol('disabled_commands', readCol('disabled_commands').filter(r => !(r.guild_id === guildId && r.command_name === commandName)));
}

export function isCommandDisabled(guildId, commandName) {
  return !!readCol('disabled_commands').find(r => r.guild_id === guildId && r.command_name === commandName);
}

export function getDisabledCommands(guildId) {
  return readCol('disabled_commands').filter(r => r.guild_id === guildId).map(r => r.command_name);
}

const DM_SENTINEL = '__DM__';

export function disableDmCommand(commandName) {
  disableCommand(DM_SENTINEL, commandName);
}

export function enableDmCommand(commandName) {
  enableCommand(DM_SENTINEL, commandName);
}

export function isDmCommandDisabled(commandName) {
  return isCommandDisabled(DM_SENTINEL, commandName);
}

export function getDmDisabledCommands() {
  return getDisabledCommands(DM_SENTINEL);
}

// ── Auto React ────────────────────────────────────────────────────────────────

export function setAutoReact(_guildId, userId, emojiId, emojiName, animated) {
  const rows = readCol('auto_reacts');
  const i = rows.findIndex(r => r.user_id === userId);
  const entry = { guild_id: 'global', user_id: userId, emoji_id: emojiId, emoji_name: emojiName, animated: animated ? 1 : 0 };
  if (i >= 0) rows[i] = { ...rows[i], ...entry }; else rows.push(entry);
  writeCol('auto_reacts', rows);
}

export function getAutoReact(_guildId, userId) {
  return readCol('auto_reacts').find(r => r.user_id === userId) ?? null;
}

export function clearAutoReact(_guildId, userId) {
  writeCol('auto_reacts', readCol('auto_reacts').filter(r => r.user_id !== userId));
}

export function getAllAutoReactEmojiIds() {
  return [...new Set(readCol('auto_reacts').filter(r => r.emoji_id).map(r => r.emoji_id))];
}

export function blockAutoReact(_guildId, userId) {
  const rows = readCol('auto_reacts');
  const i = rows.findIndex(r => r.user_id === userId);
  const entry = { guild_id: 'global', user_id: userId, emoji_id: null, emoji_name: '__blocked__', animated: 0 };
  if (i >= 0) rows[i] = { ...rows[i], ...entry }; else rows.push(entry);
  writeCol('auto_reacts', rows);
}

export function isAutoReactBlocked(_guildId, userId) {
  return readCol('auto_reacts').find(r => r.user_id === userId)?.emoji_name === '__blocked__';
}

export function getArExpiry(userId) {
  return readCol('auto_reacts').find(r => r.user_id === userId)?.ar_expires_at ?? null;
}

export function renewArSubscription(userId) {
  const rows = readCol('auto_reacts');
  const i = rows.findIndex(r => r.user_id === userId);
  const now = new Date();
  const base = (i >= 0 && rows[i].ar_expires_at) ? new Date(rows[i].ar_expires_at) : now;
  const newExpiry = new Date(Math.max(base.getTime(), now.getTime()) + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (i >= 0) rows[i].ar_expires_at = newExpiry;
  else rows.push({ guild_id: 'global', user_id: userId, emoji_id: '', emoji_name: '__pending__', animated: 0, ar_expires_at: newExpiry });
  writeCol('auto_reacts', rows);
  return newExpiry;
}

// ── Invite Blacklist ──────────────────────────────────────────────────────────

export function addInviteBlacklist(guildId, blockedGuildId, addedBy) {
  const rows = readCol('invite_blacklist');
  if (!rows.find(r => r.guild_id === guildId && r.blocked_guild_id === blockedGuildId)) {
    rows.push({ guild_id: guildId, blocked_guild_id: blockedGuildId, added_by: addedBy, added_at: ts() });
    writeCol('invite_blacklist', rows);
  }
}

export function removeInviteBlacklist(guildId, blockedGuildId) {
  writeCol('invite_blacklist', readCol('invite_blacklist').filter(r => !(r.guild_id === guildId && r.blocked_guild_id === blockedGuildId)));
}

export function isInviteBlacklisted(guildId, blockedGuildId) {
  return !!readCol('invite_blacklist').find(r => r.guild_id === guildId && r.blocked_guild_id === blockedGuildId);
}

// ── Network Applications ──────────────────────────────────────────────────────

export function saveNetworkApplication(targetGuildId, applicantId, applicantUsername, applicantAvatar, why, experience, timezone, age) {
  const rows = readCol('network_applications');
  const id = nextId('network_applications');
  rows.push({ id, target_guild_id: targetGuildId, applicant_id: applicantId, applicant_username: applicantUsername, applicant_avatar: applicantAvatar, why, experience, timezone, age, status: 'pending', created_at: ts() });
  writeCol('network_applications', rows);
  return id;
}

export function getNetworkApplication(id) {
  return readCol('network_applications').find(r => r.id === Number(id)) ?? null;
}

export function resolveNetworkApplication(id, status) {
  const rows = readCol('network_applications');
  const i = rows.findIndex(r => r.id === Number(id));
  if (i >= 0) { rows[i].status = status; writeCol('network_applications', rows); }
  return rows[i] ?? null;
}

// ── Sticky Messages ───────────────────────────────────────────────────────────

export function getStickyMessage(guildId, channelId) {
  return readCol('sticky_messages').find(r => r.guild_id === guildId && r.channel_id === channelId) ?? null;
}

export function setStickyMessage(guildId, channelId, message) {
  const rows = readCol('sticky_messages');
  const i = rows.findIndex(r => r.guild_id === guildId && r.channel_id === channelId);
  if (i >= 0) rows[i].message = message;
  else rows.push({ guild_id: guildId, channel_id: channelId, message });
  writeCol('sticky_messages', rows);
}

export function deleteStickyMessage(guildId, channelId) {
  writeCol('sticky_messages', readCol('sticky_messages').filter(r => !(r.guild_id === guildId && r.channel_id === channelId)));
  writeCol('sticky_channel_state', readCol('sticky_channel_state').filter(r => !(r.guild_id === guildId && r.channel_id === channelId)));
}

export function getStickyChannelState(guildId, channelId) {
  return readCol('sticky_channel_state').find(r => r.guild_id === guildId && r.channel_id === channelId) ?? null;
}

export function updateStickyChannelState(guildId, channelId, messageId) {
  const rows = readCol('sticky_channel_state');
  const i = rows.findIndex(r => r.guild_id === guildId && r.channel_id === channelId);
  if (i >= 0) rows[i].last_message_id = messageId;
  else rows.push({ guild_id: guildId, channel_id: channelId, last_message_id: messageId });
  writeCol('sticky_channel_state', rows);
}

// ── Hall of Shame ─────────────────────────────────────────────────────────────

export function isInHallOfShame(guildId, messageId) {
  return !!readCol('hall_of_shame').find(r => r.guild_id === guildId && r.message_id === messageId);
}

export function addToHallOfShame(guildId, messageId) {
  const rows = readCol('hall_of_shame');
  if (!rows.find(r => r.guild_id === guildId && r.message_id === messageId)) {
    rows.push({ guild_id: guildId, message_id: messageId });
    writeCol('hall_of_shame', rows);
  }
}

// ── Honeypot ──────────────────────────────────────────────────────────────────

export function getHoneypotConfig(guildId) {
  return readCol('honeypot_config').find(r => r.guild_id === guildId) ?? null;
}

export function setHoneypotConfig(guildId, channelId, alertChannelId, action, createdBy) {
  const rows = readCol('honeypot_config');
  const i = rows.findIndex(r => r.guild_id === guildId);
  const entry = { guild_id: guildId, channel_id: channelId, alert_channel_id: alertChannelId, action, created_at: ts(), created_by: createdBy };
  if (i >= 0) rows[i] = entry; else rows.push(entry);
  writeCol('honeypot_config', rows);
}

export function deleteHoneypotConfig(guildId) {
  writeCol('honeypot_config', readCol('honeypot_config').filter(r => r.guild_id !== guildId));
}

export function addHoneypotTrigger(guildId, userId, username, contentPreview, actionTaken) {
  const rows = readCol('honeypot_triggers');
  rows.push({ id: nextId('honeypot_triggers'), guild_id: guildId, user_id: userId, username, content_preview: contentPreview, triggered_at: ts(), action_taken: actionTaken });
  writeCol('honeypot_triggers', rows);
}

export function getHoneypotTriggers(guildId, limit = 50) {
  return readCol('honeypot_triggers').filter(r => r.guild_id === guildId).sort((a, b) => b.triggered_at - a.triggered_at).slice(0, limit);
}

// ── Export all JSON data for migration ───────────────────────────────────────

export function exportAllForMigration() {
  const tables = [
    'guilds', 'warns', 'ad_warns', 'strikes', 'jailed_users',
    'message_counts', 'snipe_cache', 'balances', 'breaks', 'bot_applications',
    'bot_blacklist', 'levels', 'disabled_commands', 'auto_reacts',
    'invite_blacklist', 'network_applications', 'sticky_messages',
    'sticky_channel_state', 'hall_of_shame', 'honeypot_config',
    'honeypot_triggers', 'ad_channels', 'ad_posts',
  ];
  const result = {};
  for (const t of tables) result[t] = readCol(t);
  return result;
}
