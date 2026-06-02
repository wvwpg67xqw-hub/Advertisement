import { SlashCommandBuilder, EmbedBuilder, deny } from './shared.js';
import {
  getUserLevel, addUserXp, setUserXp, getLevelLeaderboard,
  computeLevel, xpForLevel,
} from '../database.js';
import { hasCommandPermission } from '../utils.js';

function progressBar(current, needed, length = 12) {
  const pct = Math.min(current / needed, 1);
  const filled = Math.round(pct * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function xpForTargetLevel(targetLevel) {
  let total = 0;
  for (let l = 0; l < targetLevel; l++) total += xpForLevel(l);
  return total;
}

export const defs = [
  new SlashCommandBuilder()
    .setName('level')
    .setDescription("Check your level or another user's level")
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),

  new SlashCommandBuilder()
    .setName('level-leaderboard')
    .setDescription('Show the top users by level in this server'),

  new SlashCommandBuilder()
    .setName('add-xp')
    .setDescription('Add XP to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of XP to add').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('remove-xp')
    .setDescription('Remove XP from a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of XP to remove').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('add-level')
    .setDescription('Add levels to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Number of levels to add').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('set-level')
    .setDescription("Set a user's level exactly")
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('Level to set').setRequired(true).setMinValue(0)),
];

export async function handleLevel(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const row = await getUserLevel(interaction.guildId, target.id);
  const totalXp = Number(row?.total_xp) || 0;
  const { level, currentXp, xpNeeded } = computeLevel(totalXp);
  const bar = progressBar(currentXp, xpNeeded);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setTitle(`Level ${level}`)
    .setDescription(`**${bar}** ${currentXp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`)
    .addFields(
      { name: '🏆 Level', value: String(level), inline: true },
      { name: '✨ Total XP', value: totalXp.toLocaleString(), inline: true },
      { name: '📈 Next Level', value: `${(xpNeeded - currentXp).toLocaleString()} XP to go`, inline: true },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleLevelLeaderboard(interaction) {
  const top = await getLevelLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '✅ No XP has been earned in this server yet.', flags: 64 });
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏆 Level Leaderboard')
    .setDescription(top.map((row, i) => {
      const { level } = computeLevel(Number(row.total_xp));
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[i] || `**${i + 1}.**`;
      return `${prefix} <@${row.user_id}> — Level ${level} (${Number(row.total_xp).toLocaleString()} XP)`;
    }).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleAddXp(interaction) {
  if (!await hasCommandPermission(interaction.member, 'add-xp')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const newTotal = await addUserXp(interaction.guildId, target.id, amount);
  const { level } = computeLevel(newTotal);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287)
      .setTitle('✅ XP Added')
      .setDescription(`Added **${amount.toLocaleString()} XP** to <@${target.id}>.\nThey now have **${newTotal.toLocaleString()} XP** (Level **${level}**).`)
      .setTimestamp()],
    flags: 64,
  });
}

export async function handleRemoveXp(interaction) {
  if (!await hasCommandPermission(interaction.member, 'remove-xp')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const row = await getUserLevel(interaction.guildId, target.id);
  const current = Number(row?.total_xp) || 0;
  const newTotal = Math.max(0, current - amount);
  await setUserXp(interaction.guildId, target.id, newTotal);
  const { level } = computeLevel(newTotal);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xED4245)
      .setTitle('✅ XP Removed')
      .setDescription(`Removed **${Math.min(amount, current).toLocaleString()} XP** from <@${target.id}>.\nThey now have **${newTotal.toLocaleString()} XP** (Level **${level}**).`)
      .setTimestamp()],
    flags: 64,
  });
}

export async function handleAddLevel(interaction) {
  if (!await hasCommandPermission(interaction.member, 'add-level')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const row = await getUserLevel(interaction.guildId, target.id);
  const currentTotal = Number(row?.total_xp) || 0;
  const { level: currentLevel } = computeLevel(currentTotal);
  const targetLevel = currentLevel + amount;
  const newXp = xpForTargetLevel(targetLevel);
  await setUserXp(interaction.guildId, target.id, newXp);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287)
      .setTitle('✅ Level Added')
      .setDescription(`Added **${amount} level${amount !== 1 ? 's' : ''}** to <@${target.id}>.\nThey are now **Level ${targetLevel}** (${newXp.toLocaleString()} XP).`)
      .setTimestamp()],
    flags: 64,
  });
}

export async function handleSetLevel(interaction) {
  if (!await hasCommandPermission(interaction.member, 'set-level')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const targetLevel = interaction.options.getInteger('level');
  const newXp = xpForTargetLevel(targetLevel);
  await setUserXp(interaction.guildId, target.id, newXp);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287)
      .setTitle('✅ Level Set')
      .setDescription(`Set <@${target.id}>'s level to **Level ${targetLevel}** (${newXp.toLocaleString()} XP).`)
      .setTimestamp()],
    flags: 64,
  });
}
