import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  addWarn, getWarns, getWarnCount, getWarnLeaderboard,
  addAdWarn, getAdWarns, removeAdWarn,
  addStrike, getStrikes, getStrikeCount, removeStrike,
  jailUser, unjailUser, isJailed,
  getMessageCount, getMessageLeaderboard, resetMessages, resetMessagesAll,
  getSnipeCache, getBalance, setBalance,
  startBreak, endBreak, getCurrentBreaks, isOnBreak,
  getCaseInfo, getGuild, getNetworkMembers,
  addBlacklist,
} from './database.js';
import {
  safeFetchMember, safeFetchChannel, safeFetchRole,
  parseDuration, formatDuration,
  hasCommandPermission, sendLog,
  buildWarnEmbed, buildAdWarnEmbed, buildStrikeEmbed,
  buildRequestEmbed, buildModEmbed,
} from './utils.js';

// ─── Command Definitions ──────────────────────────────────────────────────────

export const commandDefs = [
  // WARNINGS
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('View warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn-leaderboard')
    .setDescription('Show the top warned users in this server'),

  // AD WARNINGS
  new SlashCommandBuilder()
    .setName('ad-warn')
    .setDescription('Warn a user for advertising and optionally delete their message')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('message-id').setDescription('ID of the ad message to delete')),

  new SlashCommandBuilder()
    .setName('remove-ad-warn')
    .setDescription('Remove an ad warning by case ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID (e.g. CASE-0001)').setRequired(true)),

  // MODERATION
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addIntegerOption(o => o.setName('delete-days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7)),

  new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Fire a staff member (remove all roles and ban)')
    .addUserOption(o => o.setName('user').setDescription('User to fire').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Give a user a role')
    .addUserOption(o => o.setName('user').setDescription('User to promote').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('demote-user')
    .setDescription('Remove a role from a user')
    .addUserOption(o => o.setName('user').setDescription('User to demote').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  // STRIKES
  new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Issue a strike to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('strike-remove')
    .setDescription('Remove a strike by case ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID').setRequired(true)),

  // JAIL
  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail a user (remove roles and apply jail role)')
    .addUserOption(o => o.setName('user').setDescription('User to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Release a user from jail (restore their roles)')
    .addUserOption(o => o.setName('user').setDescription('User to unjail').setRequired(true)),

  // NETWORK BAN
  new SlashCommandBuilder()
    .setName('network-ban')
    .setDescription('Ban a user from ALL servers in the network (hub only)')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  // NETWORK UNBAN
  new SlashCommandBuilder()
    .setName('network-unban')
    .setDescription('Remove a ban from a user across ALL servers in the network (hub only)')
    .addStringOption(o => o.setName('user-id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  // REQUESTS
  new SlashCommandBuilder()
    .setName('ban-request')
    .setDescription('Submit a ban request')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('blacklist-request')
    .setDescription('Submit a blacklist request')
    .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('network-ban-request')
    .setDescription('Submit a network-wide ban request')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('partnership-request')
    .setDescription('Submit a partnership request')
    .addUserOption(o => o.setName('user').setDescription('Representative user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Partnership details').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Server link or additional info')),

  // UTILITY
  new SlashCommandBuilder()
    .setName('messages')
    .setDescription('Check message count for a user')
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),

  new SlashCommandBuilder()
    .setName('message-leaderboard')
    .setDescription('Show the message count leaderboard'),

  new SlashCommandBuilder()
    .setName('case-info')
    .setDescription('Look up a case by ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID (e.g. CASE-0001)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check the coin balance of a user')
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),

  new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show the last deleted message in this channel'),

  new SlashCommandBuilder()
    .setName('current-breaks')
    .setDescription('List all staff currently on break'),

  new SlashCommandBuilder()
    .setName('break')
    .setDescription('Mark yourself as on break')
    .addStringOption(o => o.setName('reason').setDescription('Reason for break')),

  new SlashCommandBuilder()
    .setName('break-end')
    .setDescription('End your current break'),

  new SlashCommandBuilder()
    .setName('reset-messages')
    .setDescription('Reset message count for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reset-messages-all')
    .setDescription('Reset message counts for ALL users in this server'),
];

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function deny(interaction) {
  return interaction.reply({
    content: '❌ You do not have permission to use this command.',
    flags: 64,
  });
}

async function noConfig(interaction, field) {
  return interaction.reply({
    content: `❌ Bot is not fully configured. Please run \`/setup\` and set a **${field}** first.`,
    flags: 64,
  });
}

// WARN
export async function handleWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'warn')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const caseId = addWarn(interaction.guildId, target.id, interaction.user.id, reason);
  const totalWarns = getWarnCount(interaction.guildId, target.id);
  const embed = buildWarnEmbed({ userId: target.id, moderatorId: interaction.user.id, caseId, reason });
  embed.setFooter({ text: `Total warnings: ${totalWarns}` });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'warn', embed);
}

// WARNS
export async function handleWarns(interaction) {
  if (!hasCommandPermission(interaction.member, 'warns')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const warns = getWarns(interaction.guildId, target.id);
  if (warns.length === 0) {
    return interaction.reply({ content: `✅ **${target.tag}** has no warnings.`, flags: 64 });
  }
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`⚠️ Warnings for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(warns.slice(0, 10).map(w =>
      `**${w.case_id}** — ${w.reason}\n*By <@${w.moderator_id}> • <t:${w.created_at}:R>*`
    ).join('\n\n'))
    .setFooter({ text: `Total: ${warns.length}` })
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: 64 });
}

// WARN LEADERBOARD
export async function handleWarnLeaderboard(interaction) {
  const top = getWarnLeaderboard(interaction.guildId, 10);
  if (top.length === 0) {
    return interaction.reply({ content: '✅ No warnings have been issued yet.', flags: 64 });
  }
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle('⚠️ Warn Leaderboard')
    .setDescription(top.map((row, i) => `**${i + 1}.** <@${row.user_id}> — ${row.count} warns`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// AD WARN
export async function handleAdWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'ad-warn')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const messageId = interaction.options.getString('message-id');

  let deletedContent = null;
  if (messageId) {
    const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      deletedContent = msg.content;
      await msg.delete().catch(() => {});
    }
  }

  const caseId = addAdWarn(interaction.guildId, target.id, interaction.user.id, reason, messageId, deletedContent);
  const embed = buildAdWarnEmbed({
    userId: target.id,
    moderatorId: interaction.user.id,
    caseId,
    reason,
    messageContent: deletedContent,
  });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'ad_warn', embed);
}

// REMOVE AD WARN
export async function handleRemoveAdWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'remove-ad-warn')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = removeAdWarn(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No ad-warn found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Ad-Warn Removed')
        .setDescription(`Case **${caseId}** has been removed.`)
        .setTimestamp()
    ]
  });
}

// MUTE
export async function handleMute(interaction) {
  if (!hasCommandPermission(interaction.member, 'mute')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const durationStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const seconds = parseDuration(durationStr);
  if (!seconds) return interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, `1d`.', flags: 64 });

  const config = getGuild(interaction.guildId);
  if (!config.muted_role_id) return noConfig(interaction, 'muted-role');

  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  await member.roles.add(config.muted_role_id, reason).catch(() => {});
  setTimeout(async () => {
    const m = await safeFetchMember(interaction.guild, target.id);
    if (m) await m.roles.remove(config.muted_role_id).catch(() => {});
  }, seconds * 1000);

  const embed = buildModEmbed('mute', {
    userId: target.id,
    moderatorId: interaction.user.id,
    reason,
    duration: formatDuration(seconds),
  });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// UNMUTE
export async function handleUnmute(interaction) {
  if (!hasCommandPermission(interaction.member, 'unmute')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const config = getGuild(interaction.guildId);
  if (!config.muted_role_id) return noConfig(interaction, 'muted-role');

  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  await member.roles.remove(config.muted_role_id, reason).catch(() => {});
  const embed = buildModEmbed('unmute', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// BAN
export async function handleBan(interaction) {
  if (!hasCommandPermission(interaction.member, 'ban')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const deleteDays = interaction.options.getInteger('delete-days') || 0;

  await interaction.guild.members.ban(target.id, { reason, deleteMessageDays: deleteDays }).catch(e => {
    return interaction.reply({ content: `❌ Failed to ban: ${e.message}`, flags: 64 });
  });

  const embed = buildModEmbed('ban', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'general', embed);
}

// FIRE
export async function handleFire(interaction) {
  if (!hasCommandPermission(interaction.member, 'fire')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  const manageable = member.roles.cache.filter(r => r.id !== interaction.guild.id && r.editable);
  if (manageable.size > 0) await member.roles.remove(manageable, reason).catch(() => {});
  await interaction.guild.members.ban(target.id, { reason }).catch(() => {});

  const embed = buildModEmbed('fire', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'general', embed);
}

// PROMOTE
export async function handlePromote(interaction) {
  if (!hasCommandPermission(interaction.member, 'promote')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  await member.roles.add(role.id, reason).catch(e => {
    return interaction.reply({ content: `❌ Failed to add role: ${e.message}`, flags: 64 });
  });

  const embed = buildModEmbed('promote', {
    userId: target.id, moderatorId: interaction.user.id, reason, role: role.name,
  });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'general', embed);
}

// DEMOTE USER
export async function handleDemoteUser(interaction) {
  if (!hasCommandPermission(interaction.member, 'demote-user')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  await member.roles.remove(role.id, reason).catch(e => {
    return interaction.reply({ content: `❌ Failed to remove role: ${e.message}`, flags: 64 });
  });

  const embed = buildModEmbed('demote', {
    userId: target.id, moderatorId: interaction.user.id, reason, role: role.name,
  });
  await interaction.reply({ embeds: [embed] });
  const config = getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, 'general', embed);
}

// STRIKE
export async function handleStrike(interaction) {
  if (!hasCommandPermission(interaction.member, 'strike')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const caseId = addStrike(interaction.guildId, target.id, interaction.user.id, reason);
  const total = getStrikeCount(interaction.guildId, target.id);
  const config = getGuild(interaction.guildId);

  const embed = buildStrikeEmbed({ userId: target.id, moderatorId: interaction.user.id, caseId, reason });
  embed.setFooter({ text: `Total strikes: ${total}${total >= 3 ? ' — AUTO-FIRE TRIGGERED' : ''}` });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'strike', embed);

  // Auto-fire at 3 strikes: remove all roles (except Verified) and kick
  if (total >= 3) {
    const member = await safeFetchMember(interaction.guild, target.id);
    if (member) {
      const rolesToRemove = member.roles.cache.filter(
        r => r.name !== 'Verified' && r.name !== '@everyone'
      );
      await member.roles.remove(rolesToRemove, '3 strikes — auto-fire').catch(() => {});
      await member.kick('Auto-fired: 3 strikes reached').catch(() => {});

      const fireEmbed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle('🔥 Staff Member Auto-Fired')
        .setDescription('3 strikes reached — staff roles removed and user kicked.')
        .addFields(
          { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
          { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Final Strike Reason', value: reason },
        )
        .setFooter({ text: 'The Verified role was preserved.' })
        .setTimestamp();

      await sendLog(interaction.guild, config, 'general', fireEmbed);
    }
  }
}

// STRIKE REMOVE
export async function handleStrikeRemove(interaction) {
  if (!hasCommandPermission(interaction.member, 'strike-remove')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = removeStrike(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No strike found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Strike Removed')
        .setDescription(`Strike **${caseId}** has been removed.`)
        .setTimestamp()
    ]
  });
}

// JAIL
export async function handleJail(interaction) {
  if (!hasCommandPermission(interaction.member, 'jail')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const config = getGuild(interaction.guildId);
  if (!config.jail_role_id) return noConfig(interaction, 'jail-role');

  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  if (isJailed(interaction.guildId, target.id)) {
    return interaction.reply({ content: `❌ **${target.tag}** is already jailed.`, flags: 64 });
  }

  const originalRoles = member.roles.cache
    .filter(r => r.id !== interaction.guild.id && r.editable)
    .map(r => r.id);

  await member.roles.remove(originalRoles, reason).catch(() => {});
  await member.roles.add(config.jail_role_id, reason).catch(() => {});
  jailUser(interaction.guildId, target.id, originalRoles);

  const embed = buildModEmbed('jail', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// UNJAIL
export async function handleUnjail(interaction) {
  if (!hasCommandPermission(interaction.member, 'unjail')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const config = getGuild(interaction.guildId);
  const originalRoles = unjailUser(interaction.guildId, target.id);
  if (!originalRoles) {
    return interaction.reply({ content: `❌ **${target.tag}** is not jailed.`, flags: 64 });
  }

  const member = await safeFetchMember(interaction.guild, target.id);
  if (member) {
    if (config.jail_role_id) await member.roles.remove(config.jail_role_id).catch(() => {});
    const rolesToRestore = originalRoles.filter(id => interaction.guild.roles.cache.has(id));
    if (rolesToRestore.length > 0) await member.roles.add(rolesToRestore).catch(() => {});
  }

  const embed = buildModEmbed('unjail', { userId: target.id, moderatorId: interaction.user.id });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// Build Accept / Deny buttons for a request
function buildRequestButtons(type, targetId, originGuildId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req:accept:${type}:${targetId}:${originGuildId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`req:deny:${type}:${targetId}:${originGuildId}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// REQUEST HANDLER (shared)
async function handleRequest(interaction, type) {
  if (!hasCommandPermission(interaction.member, `${type}-request`)) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const proof = interaction.options.getString('proof');
  const embed = buildRequestEmbed({
    type, requesterId: interaction.user.id, targetId: target.id, reason, proof,
  });

  const config = getGuild(interaction.guildId);
  const buttons = [buildRequestButtons(type, target.id, interaction.guildId)];

  // Always log in the current server if it has a channel set
  await sendLog(interaction.guild, config, `${type}-request`, embed, buttons);

  // If this server is linked to a hub, also forward to the hub's request channel
  if (config.hub_guild_id) {
    const hubGuild = interaction.client.guilds.cache.get(config.hub_guild_id);
    if (hubGuild) {
      const hubConfig = getGuild(config.hub_guild_id);
      const forwardedEmbed = buildRequestEmbed({
        type, requesterId: interaction.user.id, targetId: target.id, reason, proof,
      }).addFields({ name: '📡 Origin Server', value: `${interaction.guild.name} (${interaction.guildId})`, inline: true });
      // Buttons in hub still use originGuildId so Accept bans from the correct server
      await sendLog(hubGuild, hubConfig, `${type}-request`, forwardedEmbed, buttons);
    }
  }

  await interaction.reply({ content: '✅ Request submitted.', flags: 64 });
}

// BUTTON HANDLER for request Accept / Deny
export async function handleRequestButton(interaction) {
  const [, action, type, targetId, originGuildId] = interaction.customId.split(':');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Only Administrators can accept or deny requests.', flags: 64 });
  }

  await interaction.deferUpdate();

  const originalEmbed = interaction.message.embeds[0];
  const reason = originalEmbed?.fields?.find(f => f.name === 'Reason')?.value ?? 'No reason provided';

  let resultText = '';
  let resultColor = 0x5865F2;

  if (action === 'accept') {
    resultColor = 0x57F287;
    try {
      if (type === 'ban') {
        const targetGuild = interaction.client.guilds.cache.get(originGuildId);
        if (targetGuild) {
          await targetGuild.members.ban(targetId, { reason: `[Accepted Ban Request] by ${interaction.user.tag}: ${reason}` });
          resultText = `Banned from **${targetGuild.name}**`;
        } else {
          resultText = '⚠️ Origin server unreachable — ban was NOT applied';
          resultColor = 0xFEE75C;
        }
      } else if (type === 'blacklist') {
        addBlacklist(originGuildId, targetId, interaction.user.id, reason);
        resultText = 'Added to blacklist';
      } else if (type === 'network-ban') {
        const members = getNetworkMembers(interaction.guildId);
        const results = [];
        for (const { guild_id } of members) {
          const g = interaction.client.guilds.cache.get(guild_id);
          if (!g) { results.push(`⚠️ Unknown (${guild_id})`); continue; }
          try {
            await g.members.ban(targetId, { reason: `[Network Ban] ${reason}` });
            results.push(`✅ ${g.name}`);
          } catch (e) {
            results.push(`❌ ${g.name}: ${e.message}`);
          }
        }
        try {
          await interaction.guild.members.ban(targetId, { reason: `[Network Ban] ${reason}` });
          results.push(`✅ ${interaction.guild.name} (hub)`);
        } catch (e) {
          results.push(`❌ ${interaction.guild.name} (hub): ${e.message}`);
        }
        resultText = results.join('\n') || 'No linked servers.';
      } else if (type === 'partnership') {
        resultText = 'Partnership accepted';
      }
    } catch (err) {
      resultText = `Error: ${err.message}`;
      resultColor = 0xFF0000;
    }
  } else {
    resultColor = 0xED4245;
    resultText = 'Request denied';
  }

  const updatedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor(resultColor)
    .addFields(
      { name: action === 'accept' ? '✅ Accepted By' : '❌ Denied By', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Outcome', value: resultText },
    );

  const disabledRow = buildRequestButtons(type, targetId, originGuildId, true);

  await interaction.editReply({ embeds: [updatedEmbed], components: [disabledRow] });
}

export const handleBanRequest = i => handleRequest(i, 'ban');
export const handleBlacklistRequest = i => handleRequest(i, 'blacklist');
export const handleNetworkBanRequest = i => handleRequest(i, 'network-ban');
export const handlePartnershipRequest = i => handleRequest(i, 'partnership');

// NETWORK UNBAN
export async function handleNetworkUnban(interaction) {
  if (!hasCommandPermission(interaction.member, 'network-unban')) return deny(interaction);

  const config = getGuild(interaction.guildId);
  if (!config.is_hub) {
    return interaction.reply({
      content: '❌ `/network-unban` can only be used in the network hub (staff server).',
      flags: 64,
    });
  }

  await interaction.deferReply();

  const userId = interaction.options.getString('user-id').trim();
  const reason = interaction.options.getString('reason');
  const members = getNetworkMembers(interaction.guildId);

  const results = [];

  for (const { guild_id } of members) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) {
      results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`);
      continue;
    }
    try {
      await guild.members.unban(userId, `[Network Unban] ${reason}`);
      results.push(`✅ **${guild.name}**`);
    } catch (e) {
      const msg = e.code === 10026 ? 'not banned' : e.message;
      results.push(`➖ **${guild.name}** — ${msg}`);
    }
  }

  // Also unban in the hub itself
  try {
    await interaction.guild.members.unban(userId, `[Network Unban] ${reason}`);
    results.push(`✅ **${interaction.guild.name}** (hub)`);
  } catch (e) {
    const msg = e.code === 10026 ? 'not banned' : e.message;
    results.push(`➖ **${interaction.guild.name}** (hub) — ${msg}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🌐 Network Unban Executed')
    .addFields(
      { name: 'User ID', value: userId, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No linked servers.' }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// NETWORK BAN
export async function handleNetworkBan(interaction) {
  if (!hasCommandPermission(interaction.member, 'network-ban')) return deny(interaction);

  const config = getGuild(interaction.guildId);
  if (!config.is_hub) {
    return interaction.reply({
      content: '❌ `/network-ban` can only be used in the network hub (staff server). Use `/ban-request` from a main server instead.',
      flags: 64,
    });
  }

  await interaction.deferReply();

  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const members = getNetworkMembers(interaction.guildId);

  const results = [];

  for (const { guild_id } of members) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) {
      results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`);
      continue;
    }
    try {
      await guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` });
      results.push(`✅ **${guild.name}**`);
    } catch (e) {
      results.push(`❌ **${guild.name}** — ${e.message}`);
    }
  }

  // Also ban in the hub itself
  try {
    await interaction.guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` });
    results.push(`✅ **${interaction.guild.name}** (hub)`);
  } catch (e) {
    results.push(`❌ **${interaction.guild.name}** (hub) — ${e.message}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🌐 Network Ban Executed')
    .addFields(
      { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No linked servers.' }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

// MESSAGES
export async function handleMessages(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const count = getMessageCount(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💬 Message Count')
        .setDescription(`**${target.tag}** has sent **${count.toLocaleString()}** messages in this server.`)
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()
    ],
    flags: 64,
  });
}

// MESSAGE LEADERBOARD
export async function handleMessageLeaderboard(interaction) {
  const top = getMessageLeaderboard(interaction.guildId, 10);
  if (top.length === 0) {
    return interaction.reply({ content: '📭 No messages have been counted yet.', flags: 64 });
  }
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💬 Message Leaderboard')
    .setDescription(top.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.count.toLocaleString()} msgs`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// CASE INFO
export async function handleCaseInfo(interaction) {
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const info = getCaseInfo(interaction.guildId, caseId);
  if (!info) return interaction.reply({ content: `❌ No case found with ID **${caseId}**.`, flags: 64 });

  const typeLabel = { warn: '⚠️ Warning', ad_warn: '📢 Ad Warning', strike: '🚫 Strike' }[info.type] || 'Case';
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${typeLabel} — ${info.case_id}`)
    .addFields(
      { name: 'User', value: `<@${info.user_id}>`, inline: true },
      { name: 'Moderator', value: `<@${info.moderator_id}>`, inline: true },
      { name: 'Date', value: `<t:${info.created_at}:F>`, inline: true },
      { name: 'Reason', value: info.reason },
    )
    .setTimestamp();
  if (info.message_content) {
    embed.addFields({ name: 'Deleted Message', value: info.message_content.slice(0, 1024) });
  }
  await interaction.reply({ embeds: [embed], flags: 64 });
}

// BALANCE
export async function handleBalance(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const bal = getBalance(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('💰 Balance')
        .setDescription(`**${target.tag}** has **${bal.toLocaleString()} coins**.`)
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()
    ],
    flags: 64,
  });
}

// SNIPE
export async function handleSnipe(interaction) {
  const cached = getSnipeCache(interaction.guildId, interaction.channelId);
  if (!cached) {
    return interaction.reply({ content: '📭 No recently deleted messages in this channel.', flags: 64 });
  }
  const embed = new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle('🔍 Sniped Message')
    .setDescription(cached.content || '*[no text content]*')
    .setAuthor({ name: cached.author_name, iconURL: cached.author_avatar || undefined })
    .setFooter({ text: `Deleted` })
    .setTimestamp(cached.deleted_at * 1000);
  await interaction.reply({ embeds: [embed] });
}

// CURRENT BREAKS
export async function handleCurrentBreaks(interaction) {
  const breaks = getCurrentBreaks(interaction.guildId);
  if (breaks.length === 0) {
    return interaction.reply({ content: '✅ No staff are currently on break.', flags: 64 });
  }
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('☕ Staff On Break')
    .setDescription(breaks.map(b =>
      `**${b.username}** — ${b.reason || 'No reason'}\n*Started <t:${b.started_at}:R>*`
    ).join('\n\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// BREAK
export async function handleBreak(interaction) {
  const reason = interaction.options.getString('reason');
  const started = startBreak(interaction.guildId, interaction.user.id, interaction.user.tag, reason);
  if (!started) {
    return interaction.reply({ content: '❌ You are already on break. Use `/break-end` to end it first.', flags: 64 });
  }
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('☕ Break Started')
        .setDescription(`**${interaction.user.tag}** is now on break.${reason ? `\nReason: ${reason}` : ''}`)
        .setTimestamp()
    ]
  });
}

// BREAK END
export async function handleBreakEnd(interaction) {
  const row = endBreak(interaction.guildId, interaction.user.id);
  if (!row) {
    return interaction.reply({ content: '❌ You are not currently on break.', flags: 64 });
  }
  const duration = Math.floor(Date.now() / 1000) - row.started_at;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Break Ended')
        .setDescription(`**${interaction.user.tag}** is back from break.\nDuration: **${formatDuration(duration)}**`)
        .setTimestamp()
    ]
  });
}

// RESET MESSAGES
export async function handleResetMessages(interaction) {
  if (!hasCommandPermission(interaction.member, 'reset-messages')) return deny(interaction);
  const target = interaction.options.getUser('user');
  resetMessages(interaction.guildId, target.id);
  await interaction.reply({
    content: `✅ Message count reset for **${target.tag}**.`,
    flags: 64,
  });
}

// RESET MESSAGES ALL
export async function handleResetMessagesAll(interaction) {
  if (!hasCommandPermission(interaction.member, 'reset-messages-all')) return deny(interaction);
  resetMessagesAll(interaction.guildId);
  await interaction.reply({ content: '✅ All message counts have been reset.', flags: 64 });
}
