import { SlashCommandBuilder, EmbedBuilder, deny } from './shared.js';
import { addStrike, getStrikeCount, removeStrike, getGuild } from '../database.js';
import { safeFetchMember, hasCommandPermission, sendLog, buildModEmbed, buildStrikeEmbed, buildStaffUpdateEmbed } from '../utils.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Give a user a role')
    .addUserOption(o => o.setName('user').setDescription('User to promote').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('demote-user')
    .setDescription('Remove a role from a user')
    .addUserOption(o => o.setName('user').setDescription('User to demote').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Issue a strike to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('strike-remove')
    .setDescription('Remove a strike by case ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID').setRequired(true)),
];

export async function handlePromote(interaction) {
  if (!hasCommandPermission(interaction.member, 'promote')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  await member.roles.add(role.id, reason).catch(e => {
    return interaction.reply({ content: `❌ Failed to add role: ${e.message}`, flags: 64 });
  });
  const config = getGuild(interaction.guildId);
  const embed = buildModEmbed('promote', { userId: target.id, moderatorId: interaction.user.id, reason, role: role.name });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  await sendLog(interaction.guild, config, 'staff_updates',
    buildStaffUpdateEmbed('promoted', { userId: target.id, moderatorId: interaction.user.id, role: role.name }));
}

export async function handleDemoteUser(interaction) {
  if (!hasCommandPermission(interaction.member, 'demote-user')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const member = await safeFetchMember(interaction.guild, target.id);
  if (!member) return interaction.reply({ content: '❌ Could not find that member.', flags: 64 });
  await member.roles.remove(role.id, reason).catch(e => {
    return interaction.reply({ content: `❌ Failed to remove role: ${e.message}`, flags: 64 });
  });
  const config = getGuild(interaction.guildId);
  const embed = buildModEmbed('demote', { userId: target.id, moderatorId: interaction.user.id, reason, role: role.name });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'general', embed);
  await sendLog(interaction.guild, config, 'staff_updates',
    buildStaffUpdateEmbed('demoted', { userId: target.id, moderatorId: interaction.user.id, role: role.name }));
}

export async function handleStrike(interaction) {
  if (!hasCommandPermission(interaction.member, 'strike')) return deny(interaction);
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const caseId = addStrike(interaction.guildId, target.id, interaction.user.id, reason);
  const total = getStrikeCount(interaction.guildId, target.id);
  const config = getGuild(interaction.guildId);

  const embed = buildStrikeEmbed({ userId: target.id, moderatorId: interaction.user.id, caseId, reason });
  embed.setFooter({ text: `Total strikes: ${total}${total >= 3 ? ' — AUTO-FIRE TRIGGERED' : ''}` });
  await interaction.reply({ embeds: [embed] });
  await sendLog(interaction.guild, config, 'strike', embed);

  if (total >= 3) {
    const member = await safeFetchMember(interaction.guild, target.id);
    if (member) {
      const rolesToRemove = member.roles.cache.filter(r => r.name !== 'Verified' && r.name !== '@everyone');
      await member.roles.remove(rolesToRemove, '3 strikes — auto-fire').catch(() => {});
      await member.kick('Auto-fired: 3 strikes reached').catch(() => {});
      const fireEmbed = new EmbedBuilder()
        .setColor(0xFF4500).setTitle('🔥 Staff Member Auto-Fired')
        .setDescription('3 strikes reached — staff roles removed and user kicked.')
        .addFields(
          { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
          { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Final Strike Reason', value: reason },
        )
        .setFooter({ text: 'The Verified role was preserved.' }).setTimestamp();
      await sendLog(interaction.guild, config, 'general', fireEmbed);
    }
  }
}

export async function handleStrikeRemove(interaction) {
  if (!hasCommandPermission(interaction.member, 'strike-remove')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const removed = removeStrike(interaction.guildId, caseId);
  if (!removed) return interaction.reply({ content: `❌ No strike found with case ID **${caseId}**.`, flags: 64 });
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Strike Removed')
      .setDescription(`Strike **${caseId}** has been removed.`).setTimestamp()]
  });
}
