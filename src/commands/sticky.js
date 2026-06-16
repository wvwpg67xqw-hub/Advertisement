import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { deny } from './shared.js';
import { hasCommandPermission } from '../utils.js';
import { getStickyMessage, setStickyMessage, deleteStickyMessage } from '../database.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Manage sticky messages in channels or categories')
    .addSubcommandGroup(group =>
      group
        .setName('message')
        .setDescription('Sticky message management')
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Set a sticky message for a channel or category')
            .addChannelOption(o =>
              o.setName('channel')
                .setDescription('The channel or category to stick the message in')
                .setRequired(true)
            )
            .addStringOption(o =>
              o.setName('message')
                .setDescription('The message to keep pinned at the bottom')
                .setRequired(true)
                .setMaxLength(1900)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('edit')
            .setDescription('Edit the sticky message in a channel or category')
            .addChannelOption(o =>
              o.setName('channel')
                .setDescription('The channel or category with an existing sticky')
                .setRequired(true)
            )
            .addStringOption(o =>
              o.setName('message')
                .setDescription('The new sticky message text')
                .setRequired(true)
                .setMaxLength(1900)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('remove')
            .setDescription('Remove the sticky message from a channel or category')
            .addChannelOption(o =>
              o.setName('channel')
                .setDescription('The channel or category to remove the sticky from')
                .setRequired(true)
            )
        )
    ),
];

export async function handleSticky(interaction) {
  if (!await hasCommandPermission(interaction.member, 'sticky')) return deny(interaction);

  const sub = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('channel');
  const guildId = interaction.guildId;

  const isCategory = channel.type === ChannelType.GuildCategory;
  const label = isCategory ? `category **${channel.name}**` : `<#${channel.id}>`;

  if (sub === 'set') {
    const message = interaction.options.getString('message');
    const existing = await getStickyMessage(guildId, channel.id);
    if (existing) {
      return interaction.reply({
        content: `❌ There is already a sticky message in ${label}. Use \`/sticky message edit\` to change it.`,
        flags: 64,
      });
    }
    await setStickyMessage(guildId, channel.id, message);
    return interaction.reply({
      content: `📌 Sticky message set in ${label}:\n\n${message}`,
      flags: 64,
    });
  }

  if (sub === 'edit') {
    const message = interaction.options.getString('message');
    const existing = await getStickyMessage(guildId, channel.id);
    if (!existing) {
      return interaction.reply({
        content: `❌ No sticky message found in ${label}. Use \`/sticky message set\` to create one.`,
        flags: 64,
      });
    }
    await setStickyMessage(guildId, channel.id, message);
    return interaction.reply({
      content: `✏️ Sticky message updated in ${label}:\n\n${message}`,
      flags: 64,
    });
  }

  if (sub === 'remove') {
    const existing = await getStickyMessage(guildId, channel.id);
    if (!existing) {
      return interaction.reply({
        content: `❌ No sticky message found in ${label}.`,
        flags: 64,
      });
    }
    await deleteStickyMessage(guildId, channel.id);
    return interaction.reply({
      content: `🗑️ Sticky message removed from ${label}.`,
      flags: 64,
    });
  }
}
