import { SlashCommandBuilder, EmbedBuilder, deny } from './shared.js';
import {
  getMessageCount, getMessageLeaderboard, resetMessages, resetMessagesAll,
  getSnipeCache, getBalance, getCaseInfo, getGuild,
} from '../database.js';
import { hasCommandPermission } from '../utils.js';

export const defs = [
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
    .setName('reset-messages')
    .setDescription('Reset message count for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reset-messages-all')
    .setDescription('Reset message counts for ALL users in this server'),
];

export async function handleMessages(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const count = getMessageCount(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Count')
      .setDescription(`**${target.tag}** has sent **${count.toLocaleString()}** messages in this server.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleMessageLeaderboard(interaction) {
  const top = getMessageLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '📭 No messages have been counted yet.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Leaderboard')
    .setDescription(top.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.count.toLocaleString()} msgs`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleCaseInfo(interaction) {
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const info = getCaseInfo(interaction.guildId, caseId);
  if (!info) return interaction.reply({ content: `❌ No case found with ID **${caseId}**.`, flags: 64 });
  const typeLabel = { warn: '⚠️ Warning', ad_warn: '📢 Ad Warning', strike: '🚫 Strike' }[info.type] || 'Case';
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${typeLabel} — ${info.case_id}`)
    .addFields(
      { name: 'User', value: `<@${info.user_id}>`, inline: true },
      { name: 'Moderator', value: `<@${info.moderator_id}>`, inline: true },
      { name: 'Date', value: `<t:${info.created_at}:F>`, inline: true },
      { name: 'Reason', value: info.reason },
    ).setTimestamp();
  if (info.message_content) embed.addFields({ name: 'Deleted Message', value: info.message_content.slice(0, 1024) });
  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleBalance(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const bal = getBalance(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('💰 Balance')
      .setDescription(`**${target.tag}** has **${bal.toLocaleString()} coins**.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleSnipe(interaction) {
  const cached = getSnipeCache(interaction.guildId, interaction.channelId);
  if (!cached) return interaction.reply({ content: '📭 No recently deleted messages in this channel.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('🔍 Sniped Message')
    .setDescription(cached.content || '*[no text content]*')
    .setAuthor({ name: cached.author_name, iconURL: cached.author_avatar || undefined })
    .setFooter({ text: 'Deleted' }).setTimestamp(cached.deleted_at * 1000);
  await interaction.reply({ embeds: [embed] });
}

export async function handleResetMessages(interaction) {
  if (!hasCommandPermission(interaction.member, 'reset-messages')) return deny(interaction);
  const target = interaction.options.getUser('user');
  resetMessages(interaction.guildId, target.id);
  await interaction.reply({ content: `✅ Message count reset for **${target.tag}**.`, flags: 64 });
}

export async function handleResetMessagesAll(interaction) {
  if (!hasCommandPermission(interaction.member, 'reset-messages-all')) return deny(interaction);
  resetMessagesAll(interaction.guildId);
  await interaction.reply({ content: '✅ All message counts have been reset.', flags: 64 });
}
