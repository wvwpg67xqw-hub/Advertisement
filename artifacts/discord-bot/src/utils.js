import { EmbedBuilder } from 'discord.js';
import { getCommandRoles } from './database.js';

// ─── Safe Fetchers ────────────────────────────────────────────────────────────

export async function safeFetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

export async function safeFetchChannel(guild, channelId) {
  if (!channelId) return null;
  try {
    return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
  } catch {
    return null;
  }
}

export async function safeFetchRole(guild, roleId) {
  if (!roleId) return null;
  try {
    return guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId);
  } catch {
    return null;
  }
}

// ─── Duration Parsing ─────────────────────────────────────────────────────────

export function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return val * multipliers[unit];
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

// ─── Permission Checking ──────────────────────────────────────────────────────

export function hasCommandPermission(member, commandName) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const allowedRoles = getCommandRoles(member.guild.id, commandName);
  if (!allowedRoles || allowedRoles.length === 0) {
    return member.permissions.has('ManageGuild');
  }
  return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

// ─── Log Channel Routing ──────────────────────────────────────────────────────

export async function sendLog(guild, config, type, embed) {
  const channelMap = {
    warn: config.warn_log_channel_id,
    strike: config.strike_log_channel_id,
    request: config.request_log_channel_id,
    ad_warn: config.ad_warn_log_channel_id,
    general: config.log_channel_id,
  };
  const channelId = channelMap[type] || config.log_channel_id;
  if (!channelId) return;
  const channel = await safeFetchChannel(guild, channelId);
  if (channel && channel.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

// ─── Embed Builders ───────────────────────────────────────────────────────────

export function buildWarnEmbed(fields) {
  return new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle('⚠️ Warning Issued')
    .addFields(
      { name: 'User', value: `<@${fields.userId}> (${fields.userId})`, inline: true },
      { name: 'Moderator', value: `<@${fields.moderatorId}>`, inline: true },
      { name: 'Case ID', value: fields.caseId, inline: true },
      { name: 'Reason', value: fields.reason }
    )
    .setTimestamp();
}

export function buildAdWarnEmbed(fields) {
  const embed = new EmbedBuilder()
    .setColor(0xFF6600)
    .setTitle('📢 Advertisement Warning Issued')
    .addFields(
      { name: 'User', value: `<@${fields.userId}> (${fields.userId})`, inline: true },
      { name: 'Moderator', value: `<@${fields.moderatorId}>`, inline: true },
      { name: 'Case ID', value: fields.caseId, inline: true },
      { name: 'Reason', value: fields.reason }
    )
    .setTimestamp();
  if (fields.messageContent) {
    embed.addFields({ name: 'Deleted Message', value: fields.messageContent.slice(0, 1024) });
  }
  return embed;
}

export function buildStrikeEmbed(fields) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚫 Strike Issued')
    .addFields(
      { name: 'User', value: `<@${fields.userId}> (${fields.userId})`, inline: true },
      { name: 'Moderator', value: `<@${fields.moderatorId}>`, inline: true },
      { name: 'Case ID', value: fields.caseId, inline: true },
      { name: 'Reason', value: fields.reason }
    )
    .setTimestamp();
}

export function buildRequestEmbed(fields) {
  const colors = {
    ban: 0xFF0000,
    blacklist: 0x800000,
    'network-ban': 0x8B0000,
    partnership: 0x00AA00,
  };
  const titles = {
    ban: '🔨 Ban Request',
    blacklist: '⛔ Blacklist Request',
    'network-ban': '🌐 Network Ban Request',
    partnership: '🤝 Partnership Request',
  };
  const embed = new EmbedBuilder()
    .setColor(colors[fields.type] || 0x5865F2)
    .setTitle(titles[fields.type] || 'Request')
    .addFields(
      { name: 'Requested By', value: `<@${fields.requesterId}>`, inline: true },
      { name: 'Target User', value: `<@${fields.targetId}> (${fields.targetId})`, inline: true },
      { name: 'Reason', value: fields.reason }
    )
    .setTimestamp();
  if (fields.proof) {
    embed.addFields({ name: 'Proof', value: fields.proof });
  }
  return embed;
}

export function buildModEmbed(action, fields) {
  const colors = {
    mute: 0x808080, unmute: 0x00FF00, ban: 0xFF0000,
    fire: 0xFF4500, promote: 0x00AA00, demote: 0xFFA500,
    jail: 0x333333, unjail: 0x00AA00,
  };
  const icons = {
    mute: '🔇', unmute: '🔊', ban: '🔨', fire: '🔥',
    promote: '⬆️', demote: '⬇️', jail: '🔒', unjail: '🔓',
  };
  const embed = new EmbedBuilder()
    .setColor(colors[action] || 0x5865F2)
    .setTitle(`${icons[action] || '⚙️'} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .addFields(
      { name: 'User', value: `<@${fields.userId}> (${fields.userId})`, inline: true },
      { name: 'Moderator', value: `<@${fields.moderatorId}>`, inline: true }
    )
    .setTimestamp();
  if (fields.reason) embed.addFields({ name: 'Reason', value: fields.reason });
  if (fields.duration) embed.addFields({ name: 'Duration', value: fields.duration, inline: true });
  if (fields.role) embed.addFields({ name: 'Role', value: fields.role, inline: true });
  return embed;
}
