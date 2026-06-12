import pkg from 'discord.js';
const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = pkg;

export const contextMenuDefs = [
  new ContextMenuCommandBuilder()
    .setName('Warn User')
    .setType(ApplicationCommandType.User),

  new ContextMenuCommandBuilder()
    .setName('Ad-Warn Message')
    .setType(ApplicationCommandType.Message),
];

export async function handleWarnUserContextMenu(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`ctx_warn_${interaction.targetId}`)
    .setTitle('⚠️ Warn User');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('warn_reason')
        .setLabel('Reason for the warning')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Why is this user being warned?')
    )
  );
  await interaction.showModal(modal);
}

export async function handleAdWarnMessageContextMenu(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`ctx_adwarn_${interaction.targetId}_${interaction.channelId}`)
    .setTitle('🚫 Ad-Warn Message');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('adwarn_reason')
        .setLabel('Reason for the ad warning')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Why is this message being flagged as an ad?')
    )
  );
  await interaction.showModal(modal);
}
