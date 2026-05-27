import pkg from 'discord.js';
export const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = pkg;

export const STAFF_ROLE_ID = '1502594799683895346';

export async function deny(interaction) {
  return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
}

export async function noConfig(interaction, field) {
  return interaction.reply({
    content: `❌ Bot is not fully configured. Please run \`/setup\` and set a **${field}** first.`,
    flags: 64,
  });
}
