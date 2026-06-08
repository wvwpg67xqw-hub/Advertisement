import { EmbedBuilder } from 'discord.js';
import { getCommandRoles, resolveNetworkRoleIds } from './database.js';

// ─── Staff Hierarchy ──────────────────────────────────────────────────────────

const RANK_LABELS = { 5: 'Owner', 4: 'Server Owner', 3: 'Administration', 2: 'Team Lead', 1: 'Mod', 0: 'Non-Staff' };

const COMMAND_MIN_RANK = {
  // MOD (1) ─────────────────────────────────────────────
  warn: 1, warns: 1, 'warn-leaderboard': 1,
  mute: 1, unmute: 1, 'ad-warn': 1,
  'message-leaderboard': 1, 'case-info': 1, balance: 1,
  apply: 1, update: 1,
  'break-request': 1, 'break-end': 1, 'current-breaks': 1,
  'ban-request': 1, 'blacklist-request': 1, 'network-ban-request': 1,
  'partnership-request': 1, 'resign-request': 1,

  // TEAM LEAD (2) ───────────────────────────────────────
  jail: 2, unjail: 2,
  strike: 2, 'strike-remove': 2,
  promote: 2, 'demote-user': 2,
  'manage-break': 2,
  'remove-ad-warn': 2,
  'reset-messages': 2, 'reset-messages-all': 2,
  snipe: 2,
  addbalance: 2,
  setbalance: 3,

  // ADMINISTRATION (3) ──────────────────────────────────
  ban: 3, fire: 3,
  'network-ban': 3, 'network-unban': 3, 'network-status': 3,
  setup: 3, 'setup-roles': 3, 'setup-roles-extra': 3, 'setup-roles-wizard': 3,
  'setup-roles-bulk': 3, 'setup-edit': 3, 'setup-status': 3,
  'setup-ad-channels': 3, 'setup-requests': 3, 'setup-network-hub': 3,
  'setup-network-join': 3, 'setup-network-reset': 3, 'setup-break': 3,
  'setup-resign': 3, 'setup-branding': 3,
  'setup-owner-role': 3,
};

/**
 * Returns the staff rank (0–3) of a guild member based on role ID env vars.
 * 3 = ADMINISTRATION, 2 = TEAM LEAD, 1 = MOD, 0 = non-staff.
 *
 * Falls back to Discord Administrator = rank 3 when no hierarchy env vars are set,
 * so the system keeps working out-of-the-box before roles are configured.
 */
export function getStaffRank(member, roleIds = null) {
  if (!member) return 0;

  if (member.id === member.guild.ownerId) return 5;

  const ownerRoleId    = roleIds?.ownerRoleId    ?? process.env.OWNER_ROLE_ID;
  const modRoleId      = roleIds?.modRoleId      ?? process.env.MOD_ROLE_ID;
  const teamLeadRoleId = roleIds?.teamLeadRoleId ?? process.env.TEAM_LEAD_ROLE_ID;
  const adminRoleId    = roleIds?.adminRoleId    ?? process.env.ADMIN_ROLE_ID;

  if (ownerRoleId && member.roles.cache.has(ownerRoleId)) return 5;

  const hierarchyEnabled = !!(modRoleId || teamLeadRoleId || adminRoleId);

  if (hierarchyEnabled) {
    if (adminRoleId      && member.roles.cache.has(adminRoleId))      return 3;
    if (teamLeadRoleId   && member.roles.cache.has(teamLeadRoleId))   return 2;
    if (modRoleId        && member.roles.cache.has(modRoleId))        return 1;
    return 0;
  }

  if (member.permissions.has('Administrator')) return 3;
  return 0;
}

export function getStaffRankLabel(member, roleIds = null) {
  return RANK_LABELS[getStaffRank(member, roleIds)] ?? 'Non-Staff';
}

/**
 * Sync rank check using passed-in roleIds (or env vars as fallback).
 */
export function canModerate(executorMember, targetMember, roleIds = null) {
  if (!targetMember) return true;
  return getStaffRank(executorMember, roleIds) > getStaffRank(targetMember, roleIds);
}

/**
 * Async rank check — resolves role IDs from the network hub DB config first.
 * Use this in all command handlers instead of the sync canModerate.
 */
export async function canModerateInGuild(executorMember, targetMember, guildId) {
  if (!targetMember) return true;
  const roleIds = await resolveNetworkRoleIds(guildId);
  return getStaffRank(executorMember, roleIds) > getStaffRank(targetMember, roleIds);
}

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

export async function hasCommandPermission(member, commandName) {
  if (!member) return false;
  const OWNER_IDS = ['1453592157607825595', process.env.OWNER_ID].filter(Boolean);
  if (OWNER_IDS.includes(member.user.id)) return true;

  const networkRoleIds = await resolveNetworkRoleIds(member.guild.id);
  const networkEnabled = !!(networkRoleIds.ownerRoleId || networkRoleIds.modRoleId || networkRoleIds.teamLeadRoleId || networkRoleIds.adminRoleId);
  const envEnabled     = !!(process.env.OWNER_ROLE_ID || process.env.MOD_ROLE_ID || process.env.TEAM_LEAD_ROLE_ID || process.env.ADMIN_ROLE_ID);
  const hierarchyEnabled = networkEnabled || envEnabled;

  if (hierarchyEnabled) {
    const roleIds  = networkEnabled ? networkRoleIds : null;
    const userRank = getStaffRank(member, roleIds);
    if (userRank >= 3) return true; // Admin and above can use any command
    const minRank  = COMMAND_MIN_RANK[commandName] ?? 3;
    return userRank >= minRank;
  }

  // Legacy fallback — use DB-configured role allowlists or Discord perms
  if (member.permissions.has('Administrator')) return true;
  const allowedRoles = await getCommandRoles(member.guild.id, commandName);
  if (!allowedRoles || allowedRoles.length === 0) {
    return member.permissions.has('ManageGuild');
  }
  return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

// ─── Log Channel Routing ──────────────────────────────────────────────────────

export async function sendLog(guild, config, type, embed, components = null) {
  const channelMap = {
    warn: config.warn_log_channel_id,
    strike: config.strike_log_channel_id,
    request: config.request_log_channel_id,
    ad_warn: config.ad_warn_log_channel_id,
    ad_warn_dm: config.ad_warn_dm_log_channel_id,
    level_up: config.level_log_channel_id,
    general: config.log_channel_id,
    staff_updates: config.staff_updates_channel_id,
    'ban-request': config.ban_request_channel_id || config.request_log_channel_id,
    'blacklist-request': config.blacklist_request_channel_id || config.request_log_channel_id,
    'network-ban-request': config.network_ban_request_channel_id || config.request_log_channel_id,
    'partnership-request': config.partnership_request_channel_id || config.request_log_channel_id,
  };
  const channelId = channelMap[type] || config.log_channel_id;
  if (!channelId) return null;
  const channel = await safeFetchChannel(guild, channelId);
  if (channel && channel.isTextBased()) {
    const payload = { embeds: [embed] };
    if (components) payload.components = components;
    return channel.send(payload).catch(() => null);
  }
  return null;
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
  const guildName = fields.guildName || 'Moderation';
  const moderatorDisplay = fields.moderatorUsername
    ? `${fields.moderatorUsername} (${fields.moderatorAdWarnCount ?? 0} adwarns issued)`
    : `<@${fields.moderatorId}>`;

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: `🚨 ${guildName} Moderation` })
    .setTitle("You've been warned")
    .setDescription('### Notice\nYou were found breaking a rule! DM Modmail to dispute this warn.')
    .addFields(
      { name: '🧑 Username',     value: `<@${fields.userId}> (${fields.userId})`, inline: false },
      { name: '🛡️ Moderated By', value: moderatorDisplay, inline: false },
      { name: '📁 Case ID',      value: fields.caseId, inline: true },
      { name: '⏰ Duration',     value: 'Permanent', inline: true },
      { name: '🔧 Warnings',     value: `${fields.totalWarns || 1}`, inline: true },
      { name: '📝 Reason',       value: fields.reason, inline: false },
      {
        name: 'Location',
        value: fields.channelId && fields.messageId
          ? `Channel: <#${fields.channelId}> (Message ID: ${fields.messageId})`
          : fields.channelId
            ? `Channel: <#${fields.channelId}>`
            : 'Unknown',
        inline: false,
      }
    )
    .setFooter({ text: `Powered by ${guildName}` })
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

export function buildStaffUpdateEmbed(type, fields) {
  const configs = {
    hired: {
      color: 0x57F287,
      title: '🎉 New Staff Member',
      desc: `Welcome <@${fields.userId}> to the team as **${fields.role}**!`,
    },
    promoted: {
      color: 0x5865F2,
      title: '⬆️ Staff Promotion',
      desc: `<@${fields.userId}> has been promoted to **${fields.role}**!`,
    },
    demoted: {
      color: 0xFFA500,
      title: '⬇️ Staff Demotion',
      desc: `<@${fields.userId}> has been demoted from **${fields.role}**.`,
    },
    fired: {
      color: 0xFF4500,
      title: '🔥 Staff Departure',
      desc: `<@${fields.userId}> has been removed from the staff team.`,
    },
    transferred: {
      color: 0x3B82F6,
      title: '🔄 Staff Transfer',
      desc: `<@${fields.userId}> has been transferred to **${fields.role}**.`,
    },
    welcomed: {
      color: 0x57F287,
      title: '👋 Staff Welcome',
      desc: `Please welcome <@${fields.userId}> to **${fields.role}**!`,
    },
    resigned: {
      color: 0x6B7280,
      title: '📝 Staff Resignation',
      desc: `<@${fields.userId}> has resigned from **${fields.role}**. Thank you for your service!`,
    },
  };
  const cfg = configs[type] || configs.fired;
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(cfg.title)
    .setDescription(cfg.desc)
    .setTimestamp();
  if (fields.reason) embed.addFields({ name: 'Reason', value: fields.reason });
  if (fields.moderatorId) embed.addFields({ name: 'By', value: `<@${fields.moderatorId}>`, inline: true });
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
