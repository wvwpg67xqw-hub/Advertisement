import discordPkg from 'discord.js';
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = discordPkg;

import { getBugReportChannel } from '../devLogger.js';

// ── Command Definition (global — not dev-only) ────────────────────────────────

export const defs = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a bug or issue with the bot'),
];

// ── /report — opens modal ─────────────────────────────────────────────────────

export async function handleReport(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('report:modal')
    .setTitle('🐛 Bug Report');

  const titleInput = new TextInputBuilder()
    .setCustomId('report_title')
    .setLabel('Bug Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Brief summary of the issue')
    .setMaxLength(100)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId('report_desc')
    .setLabel('What happened?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe the bug in detail...')
    .setMaxLength(1000)
    .setRequired(true);

  const stepsInput = new TextInputBuilder()
    .setCustomId('report_steps')
    .setLabel('Steps to reproduce (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('1. Run /command\n2. Click button\n3. Error appears')
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(stepsInput),
  );

  await interaction.showModal(modal);
}

// ── Modal Submit ───────────────────────────────────────────────────────────────

export async function handleReportModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const title = interaction.fields.getTextInputValue('report_title');
  const desc  = interaction.fields.getTextInputValue('report_desc');
  const steps = interaction.fields.getTextInputValue('report_steps') || null;

  const reportChannel = getBugReportChannel();
  if (!reportChannel) {
    return interaction.editReply({
      content: '❌ Bug report channel is not set up yet. Please run `/setup-dev` first.',
    });
  }

  const reportId = `${Date.now()}-${interaction.user.id}`;

  const reportEmbed = new EmbedBuilder()
    .setTitle(`🐛 Bug Report — ${title}`)
    .setColor(0xFEE75C)
    .setDescription(desc)
    .addFields(
      { name: '👤 Reporter',  value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: '🆔 User ID',   value: `\`${interaction.user.id}\``,                        inline: true },
      { name: '📍 Server',    value: interaction.guild ? `${interaction.guild.name} (\`${interaction.guildId}\`)` : 'DM', inline: true },
      ...(steps ? [{ name: '🔁 Steps to Reproduce', value: steps, inline: false }] : []),
    )
    .setFooter({ text: `Report ID: ${reportId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`report:accept:${reportId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`report:deny:${reportId}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger),
  );

  await reportChannel.send({ embeds: [reportEmbed], components: [row] });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Bug Report Submitted')
        .setColor(0x57F287)
        .setDescription('Thanks for the report! The dev team will review it shortly.')
        .setFooter({ text: `Report ID: ${reportId}` })
        .setTimestamp(),
    ],
  });
}

// ── Button Handler ─────────────────────────────────────────────────────────────

export async function handleReportButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('report:')) return;

  const [, action, ...idParts] = interaction.customId.split(':');
  const reportId = idParts.join(':');

  await interaction.deferUpdate();

  const isAccept = action === 'accept';

  const original = interaction.message.embeds[0];
  const updatedEmbed = EmbedBuilder.from(original)
    .setColor(isAccept ? 0x57F287 : 0xED4245)
    .setTitle(`${isAccept ? '✅ Accepted' : '❌ Denied'} — ${original.title?.replace('🐛 Bug Report — ', '') ?? 'Bug Report'}`)
    .setFooter({
      text: `${original.footer?.text ?? `Report ID: ${reportId}`} • ${isAccept ? 'Accepted' : 'Denied'} by ${interaction.user.tag}`,
    });

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`report:accept:${reportId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`report:deny:${reportId}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] });
}
