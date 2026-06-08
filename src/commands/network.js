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

// Returns all guilds to act on — linked members first, falls back to all bot guilds
async function resolveNetworkGuilds(interaction) {
  const linked = await getNetworkMembers(interaction.guildId);
  if (linked.length > 0) return linked.map(r => r.guild_id);
  // No hub config — use every guild the bot is in except the current one
  return [...interaction.client.guilds.cache.keys()].filter(id => id !== interaction.guildId);
}

export async function handleNetworkBan(interaction) {
  if (!await hasCommandPermission(interaction.member, 'network-ban')) return deny(interaction);
  const config = await getGuild(interaction.guildId);
  await interaction.deferReply();
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const guildIds = await resolveNetworkGuilds(interaction);
  const results = [];
  for (const guild_id of guildIds) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) { results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`); continue; }
    try { await guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` }); results.push(`✅ **${guild.name}**`); }
    catch (e) { results.push(`❌ **${guild.name}** — ${e.message}`); }
  }
  try { await interaction.guild.members.ban(target.id, { reason: `[Network Ban] ${reason}` }); results.push(`✅ **${interaction.guild.name}**`); }
  catch (e) { results.push(`❌ **${interaction.guild.name}** — ${e.message}`); }
  const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('🌐 Network Ban Executed')
    .addFields(
      { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No servers found.' }
    ).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}

export async function handleNetworkUnban(interaction) {
  if (!await hasCommandPermission(interaction.member, 'network-unban')) return deny(interaction);
  const config = await getGuild(interaction.guildId);
  await interaction.deferReply();
  const userId = interaction.options.getString('user-id').trim();
  const reason = interaction.options.getString('reason');
  const guildIds = await resolveNetworkGuilds(interaction);
  const results = [];
  for (const guild_id of guildIds) {
    const guild = interaction.client.guilds.cache.get(guild_id);
    if (!guild) { results.push(`⚠️ **Unknown server** (\`${guild_id}\`) — bot may have left`); continue; }
    try { await guild.members.unban(userId, `[Network Unban] ${reason}`); results.push(`✅ **${guild.name}**`); }
    catch (e) { results.push(`➖ **${guild.name}** — ${e.code === 10026 ? 'not banned' : e.message}`); }
  }
  try { await interaction.guild.members.unban(userId, `[Network Unban] ${reason}`); results.push(`✅ **${interaction.guild.name}**`); }
  catch (e) { results.push(`➖ **${interaction.guild.name}** — ${e.code === 10026 ? 'not banned' : e.message}`); }
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle('🌐 Network Unban Executed')
    .addFields(
      { name: 'User ID', value: userId, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason },
      { name: `Results (${results.length} servers)`, value: results.join('\n') || 'No servers found.' }
    ).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
}
