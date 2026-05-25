import { readCol, writeCol, nextId, ts } from '../jsondb.js';

// ─── Guild Config ──────────────────────────────────────────────────────────────

export function getGuild(guildId) {
  const rows = readCol('guilds');
  let row = rows.find(g => g.guild_id === guildId);
  if (!row) {
    row = {
      guild_id: guildId, log_channel_id: null, warn_log_channel_id: null,
      strike_log_channel_id: null, request_log_channel_id: null, ad_warn_log_channel_id: null,
      jail_role_id: null, muted_role_id: null, command_roles: {},
      ban_request_channel_id: null, blacklist_request_channel_id: null,
      network_ban_request_channel_id: null, partnership_request_channel_id: null,
      is_hub: 0, hub_guild_id: null,
    };
    rows.push(row);
    writeCol('guilds', rows);
  }
  return row;
}

export function setGuildConfig(guildId, fields) {
  const rows = readCol('guilds');
  getGuild(guildId);
  const i = rows.findIndex(g => g.guild_id === guildId);
  const allowed = [
    'log_channel_id', 'warn_log_channel_id', 'strike_log_channel_id',
    'request_log_channel_id', 'ad_warn_log_channel_id', 'jail_role_id', 'muted_role_id',
    'ban_request_channel_id', 'blacklist_request_channel_id',
    'network_ban_request_channel_id', 'partnership_request_channel_id',
  ];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) rows[i][key] = val;
  }
  writeCol('guilds', rows);
}

export function setNetworkHub(guildId, isHub) {
  const rows = readCol('guilds');
  getGuild(guildId);
  const i = rows.findIndex(g => g.guild_id === guildId);
  rows[i].is_hub = isHub ? 1 : 0;
  writeCol('guilds', rows);
}

export function setHubGuildId(guildId, hubGuildId) {
  const rows = readCol('guilds');
  getGuild(guildId);
  const i = rows.findIndex(g => g.guild_id === guildId);
  rows[i].hub_guild_id = hubGuildId;
  writeCol('guilds', rows);
}

export function clearNetworkHub(guildId) {
  setNetworkHub(guildId, false);
}

export function clearHubGuildId(guildId) {
  const rows = readCol('guilds');
  getGuild(guildId);
  const i = rows.findIndex(g => g.guild_id === guildId);
  rows[i].hub_guild_id = null;
  writeCol('guilds', rows);
}

export function getNetworkMembers(hubGuildId) {
  return readCol('guilds').filter(g => g.hub_guild_id === hubGuildId).map(g => ({ guild_id: g.guild_id }));
}

export function setCommandRoles(guildId, command, roleIds) {
  const rows = readCol('guilds');
  getGuild(guildId);
  const i = rows.findIndex(g => g.guild_id === guildId);
  if (!rows[i].command_roles) rows[i].command_roles = {};
  rows[i].command_roles[command] = roleIds;
  writeCol('guilds', rows);
}

export function getCommandRoles(guildId, command) {
  const guild = getGuild(guildId);
  return (guild.command_roles || {})[command] || [];
}

// ─── Case ID ──────────────────────────────────────────────────────────────────

function generateCaseId(guildId) {
  const w = readCol('warns').filter(r => r.guild_id === guildId).length;
  const a = readCol('ad_warns').filter(r => r.guild_id === guildId).length;
  const s = readCol('strikes').filter(r => r.guild_id === guildId).length;
  return `CASE-${String(w + a + s + 1).padStart(4, '0')}`;
}

// ─── Warns ────────────────────────────────────────────────────────────────────

export function addWarn(guildId, userId, moderatorId, reason) {
  const rows = readCol('warns');
  const caseId = generateCaseId(guildId);
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

export function getWarnLeaderboard(guildId, limit = 10) {
  const counts = {};
  readCol('warns').filter(r => r.guild_id === guildId).forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  return Object.entries(counts).map(([user_id, count]) => ({ user_id, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export function getCaseInfo(guildId, caseId) {
  return (
    readCol('warns').find(r => r.guild_id === guildId && r.case_id === caseId && (r.type = 'warn')) ||
    readCol('ad_warns').find(r => r.guild_id === guildId && r.case_id === caseId && (r.type = 'ad_warn')) ||
    readCol('strikes').find(r => r.guild_id === guildId && r.case_id === caseId && (r.type = 'strike')) ||
    null
  );
}

// ─── Ad Warns ─────────────────────────────────────────────────────────────────

export function addAdWarn(guildId, userId, moderatorId, reason, messageId, messageContent) {
  const rows = readCol('ad_warns');
  const caseId = generateCaseId(guildId);
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

// ─── Strikes ──────────────────────────────────────────────────────────────────

export function addStrike(guildId, userId, moderatorId, reason) {
  const rows = readCol('strikes');
  const caseId = generateCaseId(guildId);
  rows.push({ id: nextId('strikes'), case_id: caseId, guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, created_at: ts() });
  writeCol('strikes', rows);
  return caseId;
}

export function getStrikes(guildId, userId) {
  return readCol('strikes').filter(r => r.guild_id === guildId && r.user_id === userId).sort((a, b) => b.created_at - a.created_at);
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

// ─── Jail ─────────────────────────────────────────────────────────────────────

export function jailUser(guildId, userId, originalRoles) {
  const rows = readCol('jailed_users').filter(r => !(r.guild_id === guildId && r.user_id === userId));
  rows.push({ guild_id: guildId, user_id: userId, original_roles: originalRoles, jailed_at: ts() });
  writeCol('jailed_users', rows);
}

export function unjailUser(guildId, userId) {
  const rows = readCol('jailed_users');
  const entry = rows.find(r => r.guild_id === guildId && r.user_id === userId);
  if (!entry) return null;
  writeCol('jailed_users', rows.filter(r => !(r.guild_id === guildId && r.user_id === userId)));
  return entry.original_roles;
}

export function isJailed(guildId, userId) {
  return !!readCol('jailed_users').find(r => r.guild_id === guildId && r.user_id === userId);
}

// ─── Message Counts ───────────────────────────────────────────────────────────

export function incrementMessageCount(guildId, userId) {
  const rows = readCol('message_counts');
  const i = rows.findIndex(r => r.guild_id === guildId && r.user_id === userId);
  if (i >= 0) rows[i].count++;
  else rows.push({ guild_id: guildId, user_id: userId, count: 1 });
  writeCol('message_counts', rows);
}

export function getMessageCount(guildId, userId) {
  return readCol('message_counts').find(r => r.guild_id === guildId && r.user_id === userId)?.count || 0;
}

export function getMessageLeaderboard(guildId, limit = 10) {
  return readCol('message_counts').filter(r => r.guild_id === guildId).sort((a, b) => b.count - a.count).slice(0, limit);
}

export function resetMessages(guildId, userId) {
  writeCol('message_counts', readCol('message_counts').filter(r => !(r.guild_id === guildId && r.user_id === userId)));
}

export function resetMessagesAll(guildId) {
  writeCol('message_counts', readCol('message_counts').filter(r => r.guild_id !== guildId));
}

// ─── Snipe Cache ──────────────────────────────────────────────────────────────

export function setSnipeCache(guildId, channelId, content, authorId, authorName, authorAvatar) {
  const rows = readCol('snipe_cache').filter(r => !(r.guild_id === guildId && r.channel_id === channelId));
  rows.push({ guild_id: guildId, channel_id: channelId, content, author_id: authorId, author_name: authorName, author_avatar: authorAvatar, deleted_at: ts() });
  writeCol('snipe_cache', rows);
}

export function getSnipeCache(guildId, channelId) {
  return readCol('snipe_cache').find(r => r.guild_id === guildId && r.channel_id === channelId) ?? null;
}

// ─── Balances ─────────────────────────────────────────────────────────────────

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

// ─── Breaks ───────────────────────────────────────────────────────────────────

export function startBreak(guildId, userId, username, reason) {
  const rows = readCol('breaks');
  if (rows.find(r => r.guild_id === guildId && r.user_id === userId)) return false;
  rows.push({ id: nextId('breaks'), guild_id: guildId, user_id: userId, username, reason: reason ?? null, started_at: ts() });
  writeCol('breaks', rows);
  return true;
}

export function endBreak(guildId, userId) {
  const rows = readCol('breaks');
  const entry = rows.find(r => r.guild_id === guildId && r.user_id === userId);
  if (!entry) return null;
  writeCol('breaks', rows.filter(r => !(r.guild_id === guildId && r.user_id === userId)));
  return entry;
}

export function getCurrentBreaks(guildId) {
  return readCol('breaks').filter(r => r.guild_id === guildId).sort((a, b) => a.started_at - b.started_at);
}

export function isOnBreak(guildId, userId) {
  return !!readCol('breaks').find(r => r.guild_id === guildId && r.user_id === userId);
}

// ─── Blacklist (bot) ──────────────────────────────────────────────────────────

export function addBlacklist(guildId, userId, moderatorId, reason) {
  const rows = readCol('bot_blacklist').filter(r => !(r.guild_id === guildId && r.user_id === userId));
  rows.push({ id: nextId('bot_blacklist'), guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason, created_at: ts() });
  writeCol('bot_blacklist', rows);
}

export function isBlacklisted(guildId, userId) {
  return !!readCol('bot_blacklist').find(r => r.guild_id === guildId && r.user_id === userId);
}

export function getBlacklistEntry(guildId, userId) {
  return readCol('bot_blacklist').find(r => r.guild_id === guildId && r.user_id === userId) ?? null;
}

// ─── Ad Channels ──────────────────────────────────────────────────────────────

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

// ─── Ad Posts ─────────────────────────────────────────────────────────────────

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
