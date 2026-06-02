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

  new SlashCommandBuilder()
    .setName('release-notes')
    .setDescription('Post a release notes announcement — auto-fills from GitHub if linked')
    .addStringOption(o => o.setName('version').setDescription('Version tag (e.g. v1.2.3)').setRequired(true))
    .addStringOption(o => o.setName('changes').setDescription('Override: manually write what changed (leave blank to pull from GitHub)'))
    .addStringOption(o => o.setName('since').setDescription('Previous version tag to compare from (e.g. v1.2.2) — used for GitHub diff'))
    .addStringOption(o => o.setName('title').setDescription('Short release title (e.g. "Performance improvements")'))
    .addStringOption(o => o.setName('type').setDescription('Release type').addChoices(
      { name: '🚀 Major Release', value: 'major' },
      { name: '✨ Update', value: 'update' },
      { name: '🔧 Minor Fix', value: 'minor' },
      { name: '🔥 Hotfix', value: 'hotfix' },
    ))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (defaults to current channel)')),
];

export async function handleMessages(interaction) {
  if (!await hasCommandPermission(interaction.member, 'messages')) return deny(interaction);
  const target = interaction.options.getUser('user') || interaction.user;
  const count = await getMessageCount(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Count')
      .setDescription(`**${target.tag}** has sent **${count.toLocaleString()}** messages in this server.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleMessageLeaderboard(interaction) {
  if (!await hasCommandPermission(interaction.member, 'message-leaderboard')) return deny(interaction);
  const top = await getMessageLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '📭 No messages have been counted yet.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Leaderboard')
    .setDescription(top.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.count.toLocaleString()} msgs`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleCaseInfo(interaction) {
  if (!await hasCommandPermission(interaction.member, 'case-info')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const info = await getCaseInfo(interaction.guildId, caseId);
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
  if (!await hasCommandPermission(interaction.member, 'balance')) return deny(interaction);
  const target = interaction.options.getUser('user') || interaction.user;
  const bal = await getBalance(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('💰 Balance')
      .setDescription(`**${target.tag}** has **${bal.toLocaleString()} coins**.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleSnipe(interaction) {
  if (!await hasCommandPermission(interaction.member, 'snipe')) return deny(interaction);
  const cached = await getSnipeCache(interaction.guildId, interaction.channelId);
  if (!cached) return interaction.reply({ content: '📭 No recently deleted messages in this channel.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('🔍 Sniped Message')
    .setDescription(cached.content || '*[no text content]*')
    .setAuthor({ name: cached.author_name, iconURL: cached.author_avatar || undefined })
    .setFooter({ text: 'Deleted' }).setTimestamp(cached.deleted_at * 1000);
  await interaction.reply({ embeds: [embed] });
}

export async function handleResetMessages(interaction) {
  if (!await hasCommandPermission(interaction.member, 'reset-messages')) return deny(interaction);
  const target = interaction.options.getUser('user');
  await resetMessages(interaction.guildId, target.id);
  await interaction.reply({ content: `✅ Message count reset for **${target.tag}**.`, flags: 64 });
}

export async function handleResetMessagesAll(interaction) {
  if (!await hasCommandPermission(interaction.member, 'reset-messages-all')) return deny(interaction);
  await resetMessagesAll(interaction.guildId);
  await interaction.reply({ content: '✅ All message counts have been reset.', flags: 64 });
}

const RELEASE_COLORS = { major: 0x5865F2, update: 0x57F287, minor: 0xFEE75C, hotfix: 0xED4245 };
const RELEASE_LABELS = { major: '🚀 Major Release', update: '✨ Update', minor: '🔧 Minor Fix', hotfix: '🔥 Hotfix' };

async function fetchGithubChanges(repo, version, since) {
  const headers = { 'User-Agent': 'discord-bot' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let commits = [];

  if (since) {
    const url = `https://api.github.com/repos/${repo}/compare/${since}...${version}`;
    const res = await fetch(url, { headers }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      commits = data.commits || [];
    }
  }

  if (!commits.length) {
    const url = `https://api.github.com/repos/${repo}/commits?per_page=15`;
    const res = await fetch(url, { headers }).catch(() => null);
    if (res?.ok) commits = await res.json();
  }

  if (!Array.isArray(commits) || !commits.length) return null;

  return commits
    .map(c => c.commit?.message?.split('\n')[0].trim())
    .filter(msg => msg && !msg.startsWith('Merge '))
    .slice(0, 20)
    .map(msg => `• ${msg}`)
    .join('\n');
}

export async function handleReleaseNotes(interaction) {
  if (!await hasCommandPermission(interaction.member, 'release-notes')) return deny(interaction);
  await interaction.deferReply({ flags: 64 });

  const version = interaction.options.getString('version');
  const manualChanges = interaction.options.getString('changes');
  const since = interaction.options.getString('since');
  const title = interaction.options.getString('title');
  const type = interaction.options.getString('type') || 'update';
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

  let formatted;

  if (manualChanges) {
    const lines = manualChanges.replace(/\\n/g, '\n').split('\n').filter(l => l.trim());
    formatted = lines.map(l => l.startsWith('-') || l.startsWith('•') ? l : `• ${l}`).join('\n');
  } else {
    const config = await getGuild(interaction.guildId);
    if (!config.github_repo) {
      return interaction.editReply({ content: '❌ No GitHub repo linked. Run `/setup-github` first, or manually provide the `changes` option.' });
    }
    const auto = await fetchGithubChanges(config.github_repo, version, since);
    if (!auto) {
      return interaction.editReply({ content: `❌ Could not fetch commits from \`${config.github_repo}\`. Check the repo name and try again.` });
    }
    formatted = auto;
  }

  const embed = new EmbedBuilder()
    .setColor(RELEASE_COLORS[type])
    .setTitle(`${RELEASE_LABELS[type]}  —  ${version}`)
    .setTimestamp()
    .setFooter({ text: `Posted by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  if (title) embed.setDescription(`**${title}**`);
  embed.addFields({ name: '📋 What\'s Changed', value: formatted.slice(0, 1024) });

  try {
    await targetChannel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Release notes posted in ${targetChannel}.` });
  } catch {
    await interaction.editReply({ content: '❌ Could not post in that channel. Check my permissions.' });
  }
}
