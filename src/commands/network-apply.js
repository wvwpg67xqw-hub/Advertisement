import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = pkg;
import { getGuild, getNetworkMembers } from '../database.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('setup-network-apply')
    .setDescription('Configure the server application system — sets the review channel and roles given on acceptance')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('log-channel').setDescription('Channel where applications are reviewed by admins').setRequired(true))
    .addRoleOption(o => o.setName('role1').setDescription('Role to give on acceptance').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Role to give on acceptance (optional)'))
    .addRoleOption(o => o.setName('role3').setDescription('Role to give on acceptance (optional)'))
    .addRoleOption(o => o.setName('role4').setDescription('Role to give on acceptance (optional)'))
    .addRoleOption(o => o.setName('role5').setDescription('Role to give on acceptance (optional)')),

  new SlashCommandBuilder()
    .setName('network-apply-post')
    .setDescription('Post the server listing with Apply buttons for every server in the network')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post the server listing in').setRequired(true)),
];

export async function handleSetupNetworkApply(interaction) {
  const logChannel = interaction.options.getChannel('log-channel');
  const roles = [1, 2, 3, 4, 5]
    .map(n => interaction.options.getRole(`role${n}`))
    .filter(Boolean)
    .map(r => r.id);

  const { setNetworkApplyConfig } = await import('../database.js');
  setNetworkApplyConfig(interaction.guildId, logChannel.id, roles);

  const roleList = roles.map(id => `<@&${id}>`).join(', ');
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Server Apply System Configured')
      .addFields(
        { name: '📋 Review Channel', value: `<#${logChannel.id}>`, inline: true },
        { name: '🎭 Roles on Acceptance', value: roleList, inline: true },
      )
      .setDescription('When a user applies to this server and is accepted, the configured roles will be given to them automatically.')
      .setTimestamp()
    ],
    flags: 64,
  });
}

export async function handleNetworkApplyPost(interaction) {
  const channel = interaction.options.getChannel('channel');
  const members = getNetworkMembers(interaction.guildId);

  if (members.length === 0) {
    return interaction.reply({
      content: '❌ No servers are linked to this network hub. Use `/setup-network-join` in each server first.',
      flags: 64,
    });
  }

  // Build server list — resolve guild names from bot cache
  const servers = [];
  for (const { guild_id } of members) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    const config = getGuild(guild_id);
    servers.push({
      guild_id,
      name: guild?.name || `Server (${guild_id})`,
      icon: guild?.iconURL({ size: 64 }) || null,
      configured: !!config.network_apply_log_channel_id,
    });
  }

  // Chunk into rows of up to 5 buttons (Discord max)
  const rows = [];
  for (let i = 0; i < Math.min(servers.length, 25); i += 5) {
    const row = new ActionRowBuilder();
    for (const server of servers.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`napply_${server.guild_id}`)
          .setLabel(`Apply — ${server.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!server.configured)
      );
    }
    rows.push(row);
  }

  const configuredCount = servers.filter(s => s.configured).length;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌐 Network Server Applications')
    .setDescription(
      'Click the button below for the server you want to apply to join.\nYou will be asked a few short questions, and an admin will review your application.'
    )
    .addFields(
      ...servers.map(s => ({
        name: s.name,
        value: s.configured ? '🟢 Applications Open' : '🔴 Not Configured',
        inline: true,
      }))
    )
    .setFooter({ text: `${configuredCount}/${servers.length} servers accepting applications` })
    .setTimestamp();

  await channel.send({ embeds: [embed], components: rows });
  await interaction.reply({ content: `✅ Server listing posted in <#${channel.id}>.`, flags: 64 });
}
