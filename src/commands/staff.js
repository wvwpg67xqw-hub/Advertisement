import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, deny } from './shared.js';
import { getGuild, saveApplication, getApplication, removeApplication } from '../database.js';
import { hasCommandPermission, buildStaffUpdateEmbed, sendLog } from '../utils.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('resign-request')
    .setDescription('Submit a resignation request — a form will open asking for your reason'),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Post a manual staff update announcement to the staff updates channel')
    .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption(o =>
      o.setName('type').setDescription('Type of update').setRequired(true)
        .addChoices(
          { name: 'hired — new staff member', value: 'hired' },
          { name: 'promoted — role promotion', value: 'promoted' },
          { name: 'demoted — role demotion', value: 'demoted' },
          { name: 'fired — removed from team', value: 'fired' },
          { name: 'transferred — moved to another team', value: 'transferred' },
          { name: 'welcomed — welcome announcement', value: 'welcomed' },
          { name: 'resigned — voluntary departure', value: 'resigned' },
        )
    )
    .addStringOption(o => o.setName('role').setDescription('Role name (e.g. Moderator)').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Optional extra note to include')),
];

export async function handleResignRequest(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`resign_request_modal_${interaction.guildId}`)
    .setTitle('📝 Resignation Request');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('resign_reason').setLabel('Reason for resigning')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Why are you resigning?')
    ),
  );
  await interaction.showModal(modal);
}


export async function handleUpdate(interaction) {
  if (!await hasCommandPermission(interaction.member, 'update')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const type   = interaction.options.getString('type');
  const role   = interaction.options.getString('role');
  const note   = interaction.options.getString('note');
  const config = await getGuild(interaction.guildId);
  if (!config.staff_updates_channel_id) {
    return interaction.reply({ content: '❌ No staff updates channel configured. Use `/setup` to set one.', flags: 64 });
  }
  const embed = buildStaffUpdateEmbed(type, { userId: target.id, moderatorId: interaction.user.id, role, reason: note || null });
  await sendLog(interaction.guild, config, 'staff_updates', embed);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Staff Update Posted')
      .setDescription(`Posted a **${type}** update for <@${target.id}> (${role}) to <#${config.staff_updates_channel_id}>.`)
      .setTimestamp()],
    flags: 64,
  });
}
