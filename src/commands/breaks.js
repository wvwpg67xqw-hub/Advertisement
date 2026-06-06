import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from './shared.js';
import {
  extendBreak, getCurrentBreaks, isOnBreak,
} from '../database.js';
import { safeFetchMember, formatDuration, hasCommandPermission, canModerateInGuild } from '../utils.js';
import { deny } from './shared.js';

const RANK_ERR = '❌ You cannot use this command on a user of equal or higher rank.';

export const defs = [
  new SlashCommandBuilder()
    .setName('current-breaks')
    .setDescription('List all staff currently on break'),

  new SlashCommandBuilder()
    .setName('break-request')
    .setDescription('Submit a break request — a form will open asking for duration and reason'),

  new SlashCommandBuilder()
    .setName('manage-break')
    .setDescription("End or extend a staff member's break")
    .addStringOption(o =>
      o.setName('action').setDescription('What to do').setRequired(true)
        .addChoices(
          { name: 'end — end their break immediately', value: 'end' },
          { name: 'extend — add more days to their break', value: 'extend' },
        )
    )
    .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
    .addIntegerOption(o =>
      o.setName('days').setDescription('Days to add (required for extend)').setMinValue(1).setMaxValue(365)
    ),
];

export async function handleCurrentBreaks(interaction) {
  if (!await hasCommandPermission(interaction.member, 'current-breaks')) return deny(interaction);
  const breaks = await getCurrentBreaks(interaction.guildId);
  if (breaks.length === 0) return interaction.reply({ content: '✅ No staff are currently on break.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0xFFA500).setTitle('☕ Staff On Break')
    .setDescription(breaks.map(b => {
      const endLine = b.end_at ? `\nEnds <t:${b.end_at}:R>` : '';
      return `**${b.username}** — ${b.reason || 'No reason'}\n*Started <t:${b.started_at}:R>*${endLine}`;
    }).join('\n\n')).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleBreakRequest(interaction) {
  if (!await hasCommandPermission(interaction.member, 'break-request')) return deny(interaction);
  if (await isOnBreak(interaction.guildId, interaction.user.id)) {
    return interaction.reply({ content: '❌ You are already on break. Your break will end automatically when your approved duration expires.', flags: 64 });
  }
  const modal = new ModalBuilder()
    .setCustomId(`break_request_modal_${interaction.guildId}`)
    .setTitle('☕ Break Request');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('break_days').setLabel('How many days do you need off?')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. 3').setRequired(true).setMinLength(1).setMaxLength(3)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('break_reason').setLabel('Reason (optional)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
    ),
  );
  await interaction.showModal(modal);
}

export async function handleManageBreak(interaction) {
  if (!await hasCommandPermission(interaction.member, 'manage-break')) return deny(interaction);
  const action = interaction.options.getString('action');
  const target = interaction.options.getUser('user');
  const days   = interaction.options.getInteger('days');

  const targetMember = await safeFetchMember(interaction.guild, target.id);
  if (!await canModerateInGuild(interaction.member, targetMember, interaction.guildId)) {
    return interaction.reply({ content: RANK_ERR, flags: 64 });
  }

  if (!await isOnBreak(interaction.guildId, target.id)) {
    return interaction.reply({ content: `❌ **${target.tag}** is not currently on break.`, flags: 64 });
  }

  const config = await getGuild(interaction.guildId);

  if (action === 'end') {
    const entry = await endBreak(interaction.guildId, target.id);
    if (!entry) return interaction.reply({ content: '❌ Could not find that break record.', flags: 64 });
    const member = targetMember || await safeFetchMember(interaction.guild, target.id);
    if (member) {
      if (config.break_role_id) await member.roles.remove(config.break_role_id).catch(() => null);
      for (const roleId of (entry.saved_roles || [])) await member.roles.add(roleId).catch(() => null);
    }
    const mainGuildId = process.env.MAIN_GUILD_ID;
    if (mainGuildId && config.main_break_role_id) {
      const mainGuild = interaction.client.guilds.cache.get(mainGuildId);
      if (mainGuild) {
        const mainMember = await mainGuild.members.fetch(target.id).catch(() => null);
        if (mainMember) await mainMember.roles.remove(config.main_break_role_id).catch(() => null);
      }
    }
    await target.send({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('☕ Break Ended Early')
      .setDescription(`Your break was ended early by **${interaction.user.tag}**. Your roles have been restored.`).setTimestamp()]
    }).catch(() => null);
    const duration = Math.floor(Date.now() / 1000) - entry.started_at;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Break Ended')
      .setDescription(`**${target.tag}**'s break has been ended.\nDuration: **${formatDuration(duration)}**`).setTimestamp()] });
  }

  if (action === 'extend') {
    if (!days) return interaction.reply({ content: '❌ You must provide the number of days to extend.', flags: 64 });
    const updated = await extendBreak(interaction.guildId, target.id, days * 86400);
    if (!updated) return interaction.reply({ content: '❌ Could not find that break record.', flags: 64 });
    await target.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('☕ Break Extended')
      .setDescription(`Your break has been extended by **${days} day${days !== 1 ? 's' : ''}** by **${interaction.user.tag}**.\nNew end: <t:${updated.end_at}:F>`).setTimestamp()]
    }).catch(() => null);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Break Extended')
      .setDescription(`**${target.tag}**'s break extended by **${days} day${days !== 1 ? 's' : ''}**.\nNew end: <t:${updated.end_at}:F>`).setTimestamp()] });
  }
}
