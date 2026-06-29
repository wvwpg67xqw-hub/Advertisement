import { SlashCommandBuilder, EmbedBuilder, deny, noConfig, STAFF_ROLE_ID } from './shared.js';
import {
  addWarn, getWarns, getWarnCount, getWarnLeaderboard, removeWarn, getLastWarnTime,
  addAdWarn, getAdWarns, removeAdWarn, getAdWarnCountByModerator,
  jailUser, unjailUser, isJailed, getGuild,
} from '../database.js';
import {
  safeFetchMember, parseDuration, formatDuration,
  hasCommandPermission, canModerateInGuild, sendLog,
  buildWarnEmbed, buildAdWarnEmbed, buildModEmbed, buildStaffUpdateEmbed,
} from '../utils.js';
import { trackAbuse } from '../abuseDetector.js';

const RANK_ERR = '❌ You cannot use this command on a user of equal or higher rank.';
const WARN_COOLDOWN_MS = 60 * 60 * 1000;

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
    .setDescription('Warn the author of an ad message or thread')
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
    .addStringOption(o => o.setName('message-id').setDescription('Message ID, thread ID, or Discord message link').setRequired(true)),

  new SlashCommandBuilder()
    .setName('remove-warn')
    .setDescription('Remove a warning by case ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID (e.g. CASE-0001)').setRequired(true)),

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
    .setDescription('Fire a staff member (remove staff role and kick)')
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
  if (!await hasCommandPermission(interaction.member, 'warn')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  const lastWarnTime = await getLastWarnTime(interaction.guildId, target.id);
  if (lastWarnTime) {
    const elapsed = Date.now() - lastWarnTime * 1000;
    if (elapsed < WARN_COOLDOWN_MS) {
      const remaining = Math.ceil((WARN_COOLDOWN_MS - elapsed) / 60000);
      return interaction.reply({
        content: `⏳ **${target.username}** was already warned recently. Please wait **${remaining} minute${remaining !== 1 ? 's' : ''}** before warning them again.`,
        flags: 64,
      });
    }
  }

  const caseId = await addWarn(interaction.guildId, target.id, interaction.user.id, reason);
  const totalWarns = await getWarnCount(interaction.guildId, target.id);
  const embed = buildWarnEmbed({ userId: target.id, moderatorId: interaction.user.id, caseId, reason });
  embed.setFooter({ text: `Total warnings: ${totalWarns}` });
  await interaction.reply({ embeds: [embed], flags: 64 });
  await sendLog(interaction.guild, await getGuild(interaction.guildId), 'ad_warn', embed);
  trackAbuse({ guild: interaction.guild, action: 'warn', moderatorId: interaction.user.id, targetId: target.id }).catch(() => {});

  const dmEmbed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle('⚠️ You have received a warning')
    .setDescription(`You were warned in **${interaction.guild?.name || 'a server'}**.`)
    .addFields(
      { name: '📋 Reason', value: reason, inline: false },
      { name: '🛡️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: '🗂️ Case ID', value: caseId, inline: true },
      { name: '⚠️ Total Warnings', value: String(totalWarns), inline: true },
    )
    .setFooter({ text: 'Please review the server rules to avoid further action.' })
    .setTimestamp();
  await target.send({ embeds: [dmEmbed] }).catch(() => null);
}

export async function handleRemoveWarn(interaction) {
  if (!await hasCommandPermission(interaction.member, 'remove-warn')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = await removeWarn(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No warning found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Warning Removed')
      .setDescription(`Case **${caseId}** has been removed from the database.`)
      .setTimestamp()],
  });
}

export async function handleWarns(interaction) {
  if (!await hasCommandPermission(interaction.member, 'warns')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const warns = await getWarns(interaction.guildId, target.id);
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
  const top = await getWarnLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '✅ No warnings have been issued yet.', flags: 64 });
  const embed = new EmbedBuilder()
    .setColor(0xFFAA00).setTitle('⚠️ Warn Leaderboard')
    .setDescription(top.map((row, i) => `**${i + 1}.** <@${row.user_id}> — ${row.count} warns`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleAdWarn(interaction) {
  if (!await hasCommandPermission(interaction.member, 'ad-warn')) return deny(interaction);
  const reason = interaction.options.getString('reason');
  const rawId = interaction.options.getString('message-id').trim();

  await interaction.deferReply({ flags: 64 });

  let target = null;
  let deletedContent = null;
  let resolvedMessageId = rawId;
  let resolvedChannelId = interaction.channelId;

  // Parse Discord message links: discord.com/channels/GUILD/CHANNEL/MESSAGE
  const linkMatch = rawId.match(/(?:https?:\/\/)?(?:(?:ptb|canary)\.)?discord\.com\/channels\/\d+\/(\d+)\/(\d+)/);
  if (linkMatch) {
    resolvedChannelId = linkMatch[1];
    resolvedMessageId = linkMatch[2];
    const linkChannel = await interaction.guild.channels.fetch(resolvedChannelId).catch(() => null);
    if (linkChannel) {
      const linkMsg = await linkChannel.messages.fetch(resolvedMessageId).catch(() => null);
      if (linkMsg) {
        target = linkMsg.author;
        deletedContent = linkMsg.content || null;
        await linkMsg.delete().catch(() => null);
      }
    }
  } else {
    // Plain ID — try current channel first, then all guild text channels
    const tryChannels = [
      interaction.channel,
      ...interaction.guild.channels.cache
        .filter(c => c.isTextBased() && c.id !== interaction.channelId)
        .values(),
    ];
    for (const ch of tryChannels) {
      if (!ch) continue;
      const fetchedCh = ch.messages ? ch : await interaction.guild.channels.fetch(ch.id).catch(() => null);
      if (!fetchedCh?.messages) continue;
      const msg = await fetchedCh.messages.fetch(rawId).catch(() => null);
      if (msg) {
        target = msg.author;
        deletedContent = msg.content || null;
        resolvedMessageId = msg.id;
        resolvedChannelId = fetchedCh.id;
        await msg.delete().catch(() => null);
        break;
      }
    }

    // If still not found, try as a thread ID
    if (!target) {
      const thread = await interaction.guild.channels.fetch(rawId).catch(() => null);
      if (thread && thread.isThread()) {
        const starterMsg = await thread.fetchStarterMessage().catch(() => null);
        if (starterMsg) {
          target = starterMsg.author;
          deletedContent = starterMsg.content || null;
          resolvedMessageId = starterMsg.id;
          resolvedChannelId = thread.id;
          await starterMsg.delete().catch(() => null);
        } else {
          target = thread.owner ?? null;
          resolvedChannelId = thread.id;
        }
      }
    }
  }

  if (!target) {
    return interaction.editReply({ content: `❌ Could not find a message or thread with ID **${rawId}**. Try right-clicking the message → Copy Message Link and paste that instead.` });
  }

  const caseId = await addAdWarn(interaction.guildId, target.id, interaction.user.id, reason, resolvedMessageId, deletedContent);
  const adWarns = await getAdWarns(interaction.guildId, target.id);
  const totalWarns = adWarns.length;
  const moderatorAdWarnCount = await getAdWarnCountByModerator(interaction.guildId, interaction.user.id);

  const guildConfig = await getGuild(interaction.guildId);

  const timeoutMinutes = totalWarns * 5;
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  let timedOut = false;
  if (member) {
    await member.timeout(timeoutMs, `Ad-warn #${totalWarns} — ${reason}`).catch(() => null);
    timedOut = true;
  }

  const logEmbed = buildAdWarnEmbed({
    userId: target.id, moderatorId: interaction.user.id,
    moderatorUsername: interaction.user.username, moderatorAdWarnCount,
    guildName: interaction.guild?.name || 'Moderation',
    caseId, reason, messageContent: null,
    channelId: resolvedChannelId, messageId: resolvedMessageId, totalWarns,
  });
  if (timedOut) logEmbed.addFields({ name: '⏱️ Timeout Applied', value: `${timeoutMinutes} minute${timeoutMinutes !== 1 ? 's' : ''}`, inline: true });
  await interaction.editReply({ embeds: [logEmbed] });
  await sendLog(interaction.guild, guildConfig, 'ad_warn', logEmbed);

  const dmEmbed = new EmbedBuilder()
    .setColor(0xFF5555)
    .setTitle('🚫 You have received an ad warning')
    .setDescription(`You were warned for advertising in **${interaction.guild?.name || 'a server'}**.`)
    .addFields(
      { name: '📋 Reason', value: reason, inline: false },
      ...(deletedContent ? [{ name: '🗑️ Deleted Message', value: deletedContent.length > 1024 ? deletedContent.slice(0, 1021) + '...' : deletedContent, inline: false }] : []),
      { name: '🛡️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: '🗂️ Case ID', value: caseId, inline: true },
      { name: '⚠️ Total Ad Warnings', value: String(totalWarns), inline: true },
      ...(timedOut ? [{ name: '⏱️ Timeout', value: `${timeoutMinutes} minute${timeoutMinutes !== 1 ? 's' : ''}`, inline: true }] : []),
    )
    .setFooter({ text: 'Please review the server advertising rules.' })
    .setTimestamp();
  const dmSent = await target.send({ embeds: [dmEmbed] }).catch(() => null);

  const dmLogEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📬 Ad-Warn DM Log')
    .addFields(
      { name: '👤 User', value: `<@${target.id}> (${target.id})`, inline: false },
      { name: '🗂️ Case ID', value: caseId, inline: true },
      { name: '🛡️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: '✉️ DM Delivered', value: dmSent ? 'Yes' : 'No (DMs closed)', inline: true },
      { name: '📋 Reason', value: reason, inline: false },
      ...(deletedContent ? [{ name: '🗑️ Deleted Message', value: deletedContent.length > 1024 ? deletedContent.slice(0, 1021) + '...' : deletedContent, inline: false }] : []),
    )
    .setTimestamp();
  await sendLog(interaction.guild, guildConfig, 'ad_warn_dm', dmLogEmbed);
  trackAbuse({ guild: interaction.guild, action: 'ad-warn', moderatorId: interaction.user.id, targetId: target.id }).catch(() => {});
}

export async function handleRemoveAdWarn(interaction) {
  if (!await hasCommandPermission(interaction.member, 'remove-ad-warn')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = await removeAdWarn(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No ad-warn found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Ad-Warn Removed')
      .setDescription(`Case **${caseId}** has been removed.`).setTimestamp()]
  });
}

export async function handleMute(interaction) {
  if (!await hasCommandPermission(interaction.member, 'mute')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const durationStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const seconds = parseDuration(durationStr);
  if (!seconds) return interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, `1d`.', flags: 64 });
  const MAX_TIMEOUT = 28 * 24 * 60 * 60;
  if (seconds > MAX_TIMEOUT) return interaction.reply({ content: '❌ Maximum timeout duration is 28 days.', flags: 64 });
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  if (!await canModerateInGuild(interaction.member, member, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }
  try {
    await member.timeout(seconds * 1000, reason);
  } catch {
    return interaction.reply({ content: '❌ Failed to timeout that member. Check my permissions and role position.', flags: 64 });
  }
  const config = await getGuild(interaction.guildId);
  const embed = buildModEmbed('mute', { userId: target.id, moderatorId: interaction.user.id, reason, duration: formatDuration(seconds) });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  trackAbuse({ guild: interaction.guild, action: 'mute', moderatorId: interaction.user.id, targetId: target.id }).catch(() => {});
}

export async function handleUnmute(interaction) {
  if (!await hasCommandPermission(interaction.member, 'unmute')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  if (!await canModerateInGuild(interaction.member, member, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }
  if (!member.isCommunicationDisabled()) {
    return interaction.reply({ content: '❌ That user is not currently timed out.', flags: 64 });
  }
  try {
    await member.timeout(null, reason);
  } catch {
    return interaction.reply({ content: '❌ Failed to remove timeout. Check my permissions and role position.', flags: 64 });
  }
  const config = await getGuild(interaction.guildId);
  const embed = buildModEmbed('unmute', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

export async function handleBan(interaction) {
  if (!await hasCommandPermission(interaction.member, 'ban')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const deleteDays = interaction.options.getInteger('delete-days') || 0;

  const targetMember = await safeFetchMember(interaction.guild, target.id);
  if (!await canModerateInGuild(interaction.member, targetMember, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }

  await interaction.guild.members.ban(target.id, { reason, deleteMessageDays: deleteDays }).catch(e => {
    return interaction.reply({ content: `❌ Failed to ban: ${e.message}`, flags: 64 });
  });
  const embed = buildModEmbed('ban', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, await getGuild(interaction.guildId), 'general', embed);
  trackAbuse({ guild: interaction.guild, action: 'ban', moderatorId: interaction.user.id, targetId: target.id }).catch(() => {});
}

export async function handleFire(interaction) {
  if (!await hasCommandPermission(interaction.member, 'fire')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  if (!await canModerateInGuild(interaction.member, member, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }

  const staffRole = member.roles.cache.get(STAFF_ROLE_ID);
  if (staffRole?.editable) await member.roles.remove(STAFF_ROLE_ID, reason).catch(() => {});
  await interaction.guild.members.kick(target.id, reason).catch(() => {});

  const config = await getGuild(interaction.guildId);
  const embed = buildModEmbed('fire', { userId: target.id, moderatorId: interaction.user.id, reason });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  await sendLog(interaction.guild, config, 'staff_updates', buildStaffUpdateEmbed('fired', { userId: target.id, moderatorId: interaction.user.id, reason }));
}
export async function handleJail(interaction) {
  if (!await hasCommandPermission(interaction.member, 'jail')) return deny(interaction);

  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const config = await getGuild(interaction.guildId);
  if (!config.jail_role_id) return noConfig(interaction, 'jail-role');

  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) {
    return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  }

  if (!await canModerateInGuild(interaction.member, member, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }

  if (await isJailed(interaction.guildId, target.id)) {
    return interaction.reply({
      content: `❌ **${target.username}** is already jailed.`,
      flags: 64
    });
  }

  const originalRoles = member.roles.cache
    .filter(r => r.id !== interaction.guild.id && r.editable)
    .map(r => r.id);

  await member.roles.remove(originalRoles, reason).catch(() => {});
  await member.roles.add(config.jail_role_id, reason).catch(() => {});
  await jailUser(interaction.guildId, target.id, originalRoles);

  const embed = buildModEmbed('jail', {
    userId: target.id,
    moderatorId: interaction.user.id,
    reason
  });

  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  trackAbuse({ guild: interaction.guild, action: 'jail', moderatorId: interaction.user.id, targetId: target.id }).catch(() => {});

  // ─── SOAP PING ────────────────────────────────────
  await interaction.followUp({
    content: `<@${target.id}> don't drop the soap 🧼\nhttps://tenor.com/view/dont-drop-the-soap-prison-mike-gif-11313792`,
  }).catch(() => {});

  // ─── ENV JAIL CHANNEL ─────────────────────────────
  const jailChannelId = process.env.JAIL_CHANNEL_ID;

  if (jailChannelId) {
    const jailChannel = await interaction.guild.channels
      .fetch(jailChannelId)
      .catch(() => null);

    if (jailChannel && jailChannel.isTextBased()) {
      await jailChannel.send({
        content: `🚨 <@${target.id}> has been jailed!`,
        embeds: [
          new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('🔒 Jail Notice')
            .setDescription('How is jail? 😏')
            .setImage('https://media.tenor.com/bsh-in-jail-bongo-behind-the-bars-bsh-jailed-gif-1144882224180518713')
            .setFooter({ text: `Reason: ${reason}` })
            .setTimestamp()
        ]
      }).catch(() => {});
    }
  }
}

export async function handleUnjail(interaction) {
  if (!await hasCommandPermission(interaction.member, 'unjail')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const config = await getGuild(interaction.guildId);
  const originalRoles = await unjailUser(interaction.guildId, target.id);
  if (!originalRoles) return interaction.reply({ content: `❌ **${target.tag}** is not jailed.`, flags: 64 });
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!await canModerateInGuild(interaction.member, member, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }
  if (member) {
    if (config.jail_role_id) await member.roles.remove(config.jail_role_id).catch(() => {});
    const rolesToRestore = originalRoles.filter(id => interaction.guild.roles.cache.has(id));
    if (rolesToRestore.length > 0) await member.roles.add(rolesToRestore).catch(() => {});
  }
  const embed = buildModEmbed('unjail', { userId: target.id, moderatorId: interaction.user.id });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}
