import { SlashCommandBuilder, EmbedBuilder, deny } from './shared.js';
import { getNetworkMembers, getGuild } from '../database.js';
import { hasCommandPermission, sendLog } from '../utils.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('network-ban')
    .setDescription('Ban a user from ALL servers in the network (hub only)')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('network-unban')
    .setDescription('Remove a ban from a user across ALL servers in the network (hub only)')
    .addStringOption(o => o.setName('user-id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
];

export async function handleNetworkBan(interaction) {
  if (!await hasCommandPermission(interaction.member, 'network-ban')) return deny(interaction);
  const config = await getGuild(interaction.guildId);
  if (!config.is_hub) return interaction.reply({ content: '❌ `/network-ban` can only be used in the network hub.', flags: 64 });
  await interaction.deferReply();
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const members = await getNetworkMembers(interaction.guildId);
  const results = [];
  for (const { guild_id } of members) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) { results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`); continue; }
    try { await guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` }); results.push(`✅ **${guild.name}**`); }
    catch (e) { results.push(`❌ **${guild.name}** — ${e.message}`); }
  }
  try { await interaction.guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` }); results.push(`✅ **${interaction.guild.name}** (hub)`); }
  catch (e) { results.push(`❌ **${interaction.guild.name}** (hub) — ${e.message}`); }
  const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('🌐 Network Ban Executed')
    .addFields(
      { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No linked servers.' }
    ).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

export async function handleNetworkUnban(interaction) {
  if (!await hasCommandPermission(interaction.member, 'network-unban')) return deny(interaction);
  const config = await getGuild(interaction.guildId);
  if (!config.is_hub) return interaction.reply({ content: '❌ `/network-unban` can only be used in the network hub.', flags: 64 });
  await interaction.deferReply();
  const userId = interaction.options.getString('user-id').trim();
  const reason = interaction.options.getString('reason');
  const members = await getNetworkMembers(interaction.guildId);
  const results = [];
  for (const { guild_id } of members) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) { results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`); continue; }
    try { await guild.members.unban(userId, `[Network Unban] ${reason}`); results.push(`✅ **${guild.name}**`); }
    catch (e) { results.push(`➖ **${guild.name}** — ${e.code === 10026 ? 'not banned' : e.message}`); }
  }
  try { await interaction.guild.members.unban(userId, `[Network Unban] ${reason}`); results.push(`✅ **${interaction.guild.name}** (hub)`); }
  catch (e) { results.push(`➖ **${interaction.guild.name}** (hub) — ${e.code === 10026 ? 'not banned' : e.message}`); }
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle('🌐 Network Unban Executed')
    .addFields(
      { name: 'User ID', value: userId, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No linked servers.' }
    ).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}
