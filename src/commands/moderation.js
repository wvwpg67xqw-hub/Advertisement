import { SlashCommandBuilder, EmbedBuilder, deny, noConfig, STAFF_ROLE_ID } from './shared.js';
import {
  addWarn, getWarns, getWarnCount, getWarnLeaderboard,
  addAdWarn, getAdWarns, removeAdWarn, getAdWarnCountByModerator,
  jailUser, unjailUser, isJailed, getGuild,
} from '../database.js';
import {
  safeFetchMember, parseDuration, formatDuration,
  hasCommandPermission, sendLog,
  buildWarnEmbed, buildAdWarnEmbed, buildModEmbed,
} from '../utils.js';

export const defs = [
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
    .setDescription('Fire a staff member (remove staff role and ban)')
    .addUserOption(o => o.setName('user').setDescription('User to fire').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail a user (remove roles and apply jail role)')
    .addUserOption(o => o.setName('user').setDescription('User to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Release a user from jail (restore their roles)')
    .addUserOption(o => o.setName('user').setDescription('User to unjail').setRequired(true)),
];

export async function handleWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'warn')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const caseId = addWarn(interaction.guildId, target.id, interaction.user.id, reason);
  const totalWarns = getWarnCount(interaction.guildId, target.id);
  const embed = buildWarnEmbed({ userId: target.id, moderatorId: interaction.user.id, caseId, reason });
  embed.setFooter({ text: `Total warnings: ${totalWarns}` });
  await interaction.reply({ embeds: [embed], flags: 64 });
  await sendLog(interaction.guild, getGuild(interaction.guildId), 'warn', embed);
}

export async function handleWarns(interaction) {
  if (!hasCommandPermission(interaction.member, 'warns')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const warns = getWarns(interaction.guildId, target.id);
  if (warns.length === 0) return interaction.reply({ content: `✅ **${target.tag}** has no warnings.`, flags: 64 });
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00).setTitle(`⚠️ Warnings for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(warns.slice(0, 10).map(w =>
      `**${w.case_id}** — ${w.reason}\n*By <@${w.moderator_id}> • <t:${w.created_at}:R>*`
    ).join('\n\n'))
    .setFooter({ text: `Total: ${warns.length}` }).setTimestamp();
  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleWarnLeaderboard(interaction) {
  const top = getWarnLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '✅ No warnings have been issued yet.', flags: 64 });
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00).setTitle('⚠️ Warn Leaderboard')
    .setDescription(top.map((row, i) => `**${i + 1}.** <@${row.user_id}> — ${row.count} warns`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleAdWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'ad-warn')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const messageId = interaction.options.getString('message-id');

  let deletedContent = null;
  if (messageId) {
    const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (msg) { deletedContent = msg.content; await msg.delete().catch(() => {}); }
  }

  const caseId = addAdWarn(interaction.guildId, target.id, interaction.user.id, reason, messageId, deletedContent);
  const totalWarns = getAdWarns(interaction.guildId, target.id).length;
  const moderatorAdWarnCount = getAdWarnCountByModerator(interaction.guildId, interaction.user.id);

  const embed = buildAdWarnEmbed({
    userId: target.id, moderatorId: interaction.user.id,
    moderatorUsername: interaction.user.username, moderatorAdWarnCount,
    guildName: interaction.guild?.name || 'Moderation',
    caseId, reason, messageContent: deletedContent,
    channelId: interaction.channelId, messageId, totalWarns,
  });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, getGuild(interaction.guildId), 'ad_warn', embed);
}

export async function handleRemoveAdWarn(interaction) {
  if (!hasCommandPermission(interaction.member, 'remove-ad-warn')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = removeAdWarn(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No ad-warn found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Ad-Warn Removed')
      .setDescription(`Case **${caseId}** has been removed.`).setTimestamp()]
  });
}

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
  const embed = buildModEmbed('mute', { userId: target.id, moderatorId: interaction.user.id, reason, duration: formatDuration(seconds) });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

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
  await sendLog(interaction.guild, getGuild(interaction.guildId), 'general', embed);
}

export async function handleFire(interaction) {
  if (!hasCommandPermission(interaction.member, 'fire')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });

  const staffRole = member.roles.cache.get(STAFF_ROLE_ID);
  if (staffRole?.editable) await member.roles.remove(STAFF_ROLE_ID, reason).catch(() => {});
  await interaction.guild.members.ban(target.id, { reason }).catch(() => {});

  const config = getGuild(interaction.guildId);
  const { buildStaffUpdateEmbed, sendLog: sl } = await import('../utils.js');
  const embed = buildModEmbed('fire', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  await sl(interaction.guild, config, 'staff_updates', buildStaffUpdateEmbed('fired', { userId: target.id, moderatorId: interaction.user.id, reason }));
}

export async function handleJail(interaction) {
  if (!hasCommandPermission(interaction.member, 'jail')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const config = getGuild(interaction.guildId);
  if (!config.jail_role_id) return noConfig(interaction, 'jail-role');
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  if (isJailed(interaction.guildId, target.id)) return interaction.reply({ content: `❌ **${target.tag}** is already jailed.`, flags: 64 });
  const originalRoles = member.roles.cache.filter(r => r.id !== interaction.guild.id && r.editable).map(r => r.id);
  await member.roles.remove(originalRoles, reason).catch(() => {});
  await member.roles.add(config.jail_role_id, reason).catch(() => {});
  jailUser(interaction.guildId, target.id, originalRoles);
  const embed = buildModEmbed('jail', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

export async function handleUnjail(interaction) {
  if (!hasCommandPermission(interaction.member, 'unjail')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const config = getGuild(interaction.guildId);
  const originalRoles = unjailUser(interaction.guildId, target.id);
  if (!originalRoles) return interaction.reply({ content: `❌ **${target.tag}** is not jailed.`, flags: 64 });
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
