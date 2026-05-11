import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { getGuild, setGuildConfig, setCommandRoles } from './database.js';

// Max 25 choices per Discord string option — only include commands that need role restrictions.
// Utility commands open to all (warns, messages, balance, snipe, break, break-end, current-breaks)
// are intentionally omitted here.
const ALL_COMMANDS = [
  'warn', 'warn-leaderboard',
  'ad-warn', 'remove-ad-warn',
  'mute', 'unmute', 'ban', 'fire', 'promote', 'demote-user',
  'strike', 'strike-remove',
  'jail', 'unjail',
  'ban-request', 'blacklist-request', 'network-ban-request', 'partnership-request',
  'message-leaderboard', 'case-info',
  'reset-messages', 'reset-messages-all',
];

export const setupCommands = [
  // /setup
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('log-channel').setDescription('General log channel'))
    .addChannelOption(o => o.setName('warn-log').setDescription('Warning log channel'))
    .addChannelOption(o => o.setName('strike-log').setDescription('Strike log channel'))
    .addChannelOption(o => o.setName('request-log').setDescription('Request log channel'))
    .addChannelOption(o => o.setName('ad-warn-log').setDescription('Ad-warn log channel'))
    .addRoleOption(o => o.setName('jail-role').setDescription('Role applied to jailed users'))
    .addRoleOption(o => o.setName('muted-role').setDescription('Role applied to muted users')),

  // /setup-roles — set roles for a single command
  new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Set which roles can use a specific command')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('command').setDescription('Command name').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Role 5')),

  // /setup-roles-extra — add more roles to an existing command
  new SlashCommandBuilder()
    .setName('setup-roles-extra')
    .setDescription('Add extra roles to a command (appends, does not replace)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('command').setDescription('Command name').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Role 5')),

  // /setup-status — show current bot config
  new SlashCommandBuilder()
    .setName('setup-status')
    .setDescription('Show the current bot configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /setup-edit — edit a single config field
  new SlashCommandBuilder()
    .setName('setup-edit')
    .setDescription('Edit a single bot configuration field')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('field').setDescription('Field to edit').setRequired(true)
        .addChoices(
          { name: 'log-channel', value: 'log_channel_id' },
          { name: 'warn-log', value: 'warn_log_channel_id' },
          { name: 'strike-log', value: 'strike_log_channel_id' },
          { name: 'request-log', value: 'request_log_channel_id' },
          { name: 'ad-warn-log', value: 'ad_warn_log_channel_id' },
          { name: 'jail-role', value: 'jail_role_id' },
          { name: 'muted-role', value: 'muted_role_id' },
        )
    )
    .addChannelOption(o => o.setName('channel').setDescription('New channel value'))
    .addRoleOption(o => o.setName('role').setDescription('New role value')),

  // /setup-roles-wizard — interactive wizard to set roles for all commands
  new SlashCommandBuilder()
    .setName('setup-roles-wizard')
    .setDescription('Interactive wizard: set allowed roles for every command')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('command').setDescription('Which command to configure').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Allowed role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Allowed role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Allowed role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Allowed role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Allowed role 5')),

  // /setup-requests — auto-create request channels category
  new SlashCommandBuilder()
    .setName('setup-requests')
    .setDescription('Auto-create a Requests category with ban, blacklist, network-ban, and partnership channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('category-name')
        .setDescription('Name for the category (default: 📋 Requests)')
    ),
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSetup(interaction) {
  const fields = {};
  const logChannel = interaction.options.getChannel('log-channel');
  const warnLog = interaction.options.getChannel('warn-log');
  const strikeLog = interaction.options.getChannel('strike-log');
  const requestLog = interaction.options.getChannel('request-log');
  const adWarnLog = interaction.options.getChannel('ad-warn-log');
  const jailRole = interaction.options.getRole('jail-role');
  const mutedRole = interaction.options.getRole('muted-role');

  if (logChannel) fields.log_channel_id = logChannel.id;
  if (warnLog) fields.warn_log_channel_id = warnLog.id;
  if (strikeLog) fields.strike_log_channel_id = strikeLog.id;
  if (requestLog) fields.request_log_channel_id = requestLog.id;
  if (adWarnLog) fields.ad_warn_log_channel_id = adWarnLog.id;
  if (jailRole) fields.jail_role_id = jailRole.id;
  if (mutedRole) fields.muted_role_id = mutedRole.id;

  if (Object.keys(fields).length === 0) {
    return interaction.reply({ content: '❌ You must provide at least one option to configure.', flags: 64 });
  }

  setGuildConfig(interaction.guildId, fields);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Bot Configured')
    .setDescription('The following settings have been saved:')
    .addFields(
      Object.entries(fields).map(([k, v]) => ({
        name: k.replace(/_/g, ' ').replace(/\bid\b/, '').trim(),
        value: k.includes('role') ? `<@&${v}>` : `<#${v}>`,
        inline: true,
      }))
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupRoles(interaction) {
  const command = interaction.options.getString('command');
  const roles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r) roles.push(r.id);
  }
  setCommandRoles(interaction.guildId, command, roles);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Roles Updated')
        .setDescription(`**/${command}** can now be used by: ${roles.map(id => `<@&${id}>`).join(', ')}`)
        .setTimestamp()
    ]
  });
}

export async function handleSetupRolesExtra(interaction) {
  const command = interaction.options.getString('command');
  const { getCommandRoles } = await import('./database.js');
  const existing = getCommandRoles(interaction.guildId, command);
  const newRoles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r && !existing.includes(r.id)) newRoles.push(r.id);
  }
  const merged = [...existing, ...newRoles];
  setCommandRoles(interaction.guildId, command, merged);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Roles Appended')
        .setDescription(`**/${command}** roles:\n${merged.map(id => `<@&${id}>`).join('\n')}`)
        .setTimestamp()
    ]
  });
}

export async function handleSetupStatus(interaction) {
  const config = getGuild(interaction.guildId);
  const ch = id => id ? `<#${id}>` : 'Not set';
  const rl = id => id ? `<@&${id}>` : 'Not set';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚙️ Bot Configuration')
    .addFields(
      { name: 'General Log', value: ch(config.log_channel_id), inline: true },
      { name: 'Warn Log', value: ch(config.warn_log_channel_id), inline: true },
      { name: 'Strike Log', value: ch(config.strike_log_channel_id), inline: true },
      { name: 'Request Log', value: ch(config.request_log_channel_id), inline: true },
      { name: 'Ad-Warn Log', value: ch(config.ad_warn_log_channel_id), inline: true },
      { name: 'Jail Role', value: rl(config.jail_role_id), inline: true },
      { name: 'Muted Role', value: rl(config.muted_role_id), inline: true },
    )
    .setTimestamp();

  const roles = config.command_roles;
  const roleLines = Object.entries(roles).map(([cmd, ids]) =>
    `**/${cmd}**: ${ids.map(id => `<@&${id}>`).join(', ') || 'None'}`
  );
  if (roleLines.length > 0) {
    embed.addFields({ name: 'Command Role Permissions', value: roleLines.join('\n').slice(0, 1024) });
  }

  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleSetupEdit(interaction) {
  const field = interaction.options.getString('field');
  const channel = interaction.options.getChannel('channel');
  const role = interaction.options.getRole('role');

  let value;
  let displayValue;
  if (field.includes('role') && role) {
    value = role.id;
    displayValue = `<@&${role.id}>`;
  } else if (channel) {
    value = channel.id;
    displayValue = `<#${channel.id}>`;
  } else {
    return interaction.reply({ content: '❌ Provide a channel or role value.', flags: 64 });
  }

  setGuildConfig(interaction.guildId, { [field]: value });
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Configuration Updated')
        .addFields({ name: field.replace(/_/g, ' ').replace(/\bid\b/, '').trim(), value: displayValue })
        .setTimestamp()
    ]
  });
}

export async function handleSetupRolesWizard(interaction) {
  return handleSetupRoles(interaction);
}

export async function handleSetupRequests(interaction) {
  await interaction.deferReply();

  const categoryName = interaction.options.getString('category-name') || '📋 Requests';
  const guild = interaction.guild;

  const channels = [
    { key: 'ban_request_channel_id',         name: 'ban-requests',         label: '🔨 Ban Requests' },
    { key: 'blacklist_request_channel_id',    name: 'blacklist-requests',   label: '⛔ Blacklist Requests' },
    { key: 'network_ban_request_channel_id',  name: 'network-ban-requests', label: '🌐 Network Ban Requests' },
    { key: 'partnership_request_channel_id',  name: 'partnership-requests', label: '🤝 Partnership Requests' },
  ];

  try {
    // Create the category
    const category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
    });

    const created = [];
    const dbFields = {};

    for (const ch of channels) {
      const channel = await guild.channels.create({
        name: ch.name,
        type: ChannelType.GuildText,
        parent: category.id,
      });
      dbFields[ch.key] = channel.id;
      created.push({ label: ch.label, channel });
    }

    // Save all channel IDs to the DB
    setGuildConfig(interaction.guildId, dbFields);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Request Channels Created')
      .setDescription(`Category **${categoryName}** has been set up with the following channels:`)
      .addFields(
        created.map(c => ({
          name: c.label,
          value: `<#${c.channel.id}>`,
          inline: true,
        }))
      )
      .setFooter({ text: 'Each request type now routes to its own dedicated channel.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('setup-requests error:', err);
    await interaction.editReply({ content: `❌ Failed to create channels: ${err.message}` });
  }
}
