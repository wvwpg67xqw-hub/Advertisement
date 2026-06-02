import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, deny } from './shared.js';
import { addBlacklist, getNetworkMembers, getGuild } from '../database.js';
import { hasCommandPermission, getStaffRank, sendLog, buildRequestEmbed } from '../utils.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('ban-request')
    .setDescription('Submit a ban request')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('blacklist-request')
    .setDescription('Submit a blacklist request')
    .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('network-ban-request')
    .setDescription('Submit a network-wide ban request')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Image URL or description of proof')),

  new SlashCommandBuilder()
    .setName('partnership-request')
    .setDescription('Submit a partnership request')
    .addUserOption(o => o.setName('user').setDescription('Representative user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Partnership details').setRequired(true))
    .addStringOption(o => o.setName('proof').setDescription('Server link or additional info')),
];

function buildRequestButtons(type, targetId, originGuildId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req:accept:${type}:${targetId}:${originGuildId}`)
      .setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`req:deny:${type}:${targetId}:${originGuildId}`)
      .setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

async function handleRequest(interaction, type) {
  if (!await hasCommandPermission(interaction.member, `${type}-request`)) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const proof = interaction.options.getString('proof');
  const embed = buildRequestEmbed({ type, requesterId: interaction.user.id, targetId: target.id, reason, proof });
  const config = await getGuild(interaction.guildId);
  await sendLog(interaction.guild, config, `${type}-request`, embed, [buildRequestButtons(type, target.id, interaction.guildId)]);
  await interaction.reply({ content: '✅ Request submitted.', flags: 64 });
}

export const handleBanRequest = i => handleRequest(i, 'ban');
export const handleBlacklistRequest = i => handleRequest(i, 'blacklist');
export const handleNetworkBanRequest = i => handleRequest(i, 'network-ban');
export const handlePartnershipRequest = i => handleRequest(i, 'partnership');

export async function handleRequestButton(interaction) {
  if (!interaction.isButton() || !interaction.customId?.startsWith('req:')) return;
  const [, action, type, targetId, originGuildId] = interaction.customId.split(':');

  if (getStaffRank(interaction.member) < 3 && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Only Administration can accept or deny requests.', flags: 64 });
  }

  await interaction.deferUpdate();
  const originalEmbed = interaction.message.embeds[0];
  const reason = originalEmbed?.fields?.find(f => f.name === 'Reason')?.value ?? 'No reason provided';
  let resultText = '', resultColor = 0x5865F2;

  if (action === 'accept') {
    resultColor = 0x57F287;
    try {
      if (type === 'ban') {
        const targetGuild = interaction.client.guilds.cache.get(originGuildId);
        if (targetGuild) {
          await targetGuild.members.ban(targetId, { reason: `[Accepted Ban Request] by ${interaction.user.tag}: ${reason}` });
          resultText = `Banned from **${targetGuild.name}**`;
        } else { resultText = '⚠️ Origin server unreachable — ban was NOT applied'; resultColor = 0xFEE75C; }
      } else if (type === 'blacklist') {
        await addBlacklist(originGuildId, targetId, interaction.user.id, reason);
        resultText = 'Added to blacklist';
      } else if (type === 'network-ban') {
        const members = await getNetworkMembers(interaction.guildId);
        const results = [];
        for (const { guild_id } of members) {
          const g = interaction.client.guilds.cache.get(guild_id);
          if (!g) { results.push(`⚠️ Unknown (${guild_id})`); continue; }
          try { await g.members.ban(targetId, { reason: `[Network Ban] ${reason}` }); results.push(`✅ ${g.name}`); }
          catch (e) { results.push(`❌ ${g.name}: ${e.message}`); }
        }
        try { await interaction.guild.members.ban(targetId, { reason: `[Network Ban] ${reason}` }); results.push(`✅ ${interaction.guild.name} (hub)`); }
        catch (e) { results.push(`❌ ${interaction.guild.name} (hub): ${e.message}`); }
        resultText = results.join('\n') || 'No linked servers.';
      } else if (type === 'partnership') { resultText = 'Partnership accepted'; }
    } catch (err) { resultText = `Error: ${err.message}`; resultColor = 0xFF0000; }
  } else { resultColor = 0xED4245; resultText = 'Request denied'; }

  const updatedEmbed = EmbedBuilder.from(originalEmbed).setColor(resultColor).addFields(
    { name: action === 'accept' ? '✅ Accepted By' : '❌ Denied By', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Outcome', value: resultText },
  );
  await interaction.editReply({ embeds: [updatedEmbed], components: [buildRequestButtons(type, targetId, originGuildId, true)] });
}
