import pkg from 'discord.js';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = pkg;
import { getGuild, setGuildConfig, setCommandRoles, setNetworkHub, setHubGuildId, clearNetworkHub, clearHubGuildId, getNetworkMembers, addAdChannel, removeAdChannel, getAdChannels } from './database.js';

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
    .addChannelOption(o => o.setName('staff-updates').setDescription('Channel for staff hire/fire/promotion announcements'))
    .addRoleOption(o => o.setName('jail-role').setDescription('Role applied to jailed users'))
    .addRoleOption(o => o.setName('muted-role').setDescription('Role applied to muted users'))
    .addChannelOption(o => o.setName('break-request-channel').setDescription('Channel where break requests are sent for approval'))
    .addRoleOption(o => o.setName('break-role').setDescription('Role given to staff on break in this server'))
    .addRoleOption(o => o.setName('main-break-role').setDescription('Role given to staff on break in the main server')),

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
          { name: 'staff-updates', value: 'staff_updates_channel_id' },
          { name: 'jail-role', value: 'jail_role_id' },
          { name: 'muted-role', value: 'muted_role_id' },
          { name: 'break-request-channel', value: 'break_request_channel_id' },
          { name: 'break-role', value: 'break_role_id' },
          { name: 'main-break-role', value: 'main_break_role_id' },
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

  // /setup-ad-channels — manage which channels are ad channels
  new SlashCommandBuilder()
    .setName('setup-ad-channels')
    .setDescription('Add, remove, or list ad channels (bot replies with promo links + tracks posts for cleanup on leave)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('action').setDescription('What to do').setRequired(true)
        .addChoices(
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'list', value: 'list' },
        )
    )
    .addChannelOption(o => o.setName('channel').setDescription('The ad channel (required for add/remove)')),

  // /setup-requests — auto-create request channels category
  new SlashCommandBuilder()
    .setName('setup-requests')
    .setDescription('Auto-create a Requests category with ban, blacklist, network-ban, partnership, and ad-warn channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('category-name')
        .setDescription('Name for the category (default: 📋 Requests)')
    ),

  // /setup-network-hub — mark this server as the network hub
  new SlashCommandBuilder()
    .setName('setup-network-hub')
    .setDescription('Mark this server as the network hub (staff server). All request logs will route here.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /setup-network-join — link a main server to the hub
  new SlashCommandBuilder()
    .setName('setup-network-join')
    .setDescription('Link this server to the network hub so requests forward to the staff server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('hub-server-id')
        .setDescription('The server ID of your staff/hub server')
        .setRequired(true)
    ),

  // /setup-network-reset — clear hub or member link from this server
  new SlashCommandBuilder()
    .setName('setup-network-reset')
    .setDescription('Remove this server\'s network role (hub or linked member)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /network-status — show all linked servers and their reachability
  new SlashCommandBuilder()
    .setName('network-status')
    .setDescription('Show the network hub and all linked servers with their bot reachability')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /setup-break — dedicated break configuration
  new SlashCommandBuilder()
    .setName('setup-break')
    .setDescription('Configure the break system (request channel + break roles)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('request-channel').setDescription('Channel where break requests are posted for approval'))
    .addRoleOption(o => o.setName('staff-break-role').setDescription('Role given to staff while on break in THIS server'))
    .addRoleOption(o => o.setName('main-break-role').setDescription('Role given to staff while on break in the MAIN server')),

  // /setup-resign — configure resign, applications, referral link and modmail test
  new SlashCommandBuilder()
    .setName('setup-resign')
    .setDescription('Configure resign system, applications, referral link and modmail test channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('resign-channel').setDescription('Channel where resignation requests are posted for approval'))
    .addRoleOption(o => o.setName('verified-role').setDescription('Role kept in the main server when a member resigns (all others removed)'))
    .addChannelOption(o => o.setName('applications-channel').setDescription('Channel where staff applications are posted for review'))
    .addStringOption(o => o.setName('referral-link').setDescription('Referral/invite link shown in the staff panel (paste full URL)'))
    .addChannelOption(o => o.setName('modmail-test-channel').setDescription('Channel where modmail test applications are posted')),

  // /setup-branding — configure server PFP and banner URL
  new SlashCommandBuilder()
    .setName('setup-branding')
    .setDescription('Set a custom server profile picture and banner URL for the staff portal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('pfp-url').setDescription('Full URL to the server profile picture (PNG/JPG/GIF)'))
    .addStringOption(o => o.setName('banner-url').setDescription('Full URL to the server banner image (PNG/JPG/GIF)'))
    .addStringOption(o =>
      o.setName('clear').setDescription('Clear a branding field')
        .addChoices(
          { name: 'pfp', value: 'pfp' },
          { name: 'banner', value: 'banner' },
          { name: 'both', value: 'both' },
        )
    ),

  // /setup-roles-bulk — assign roles to a whole group of commands at once
  new SlashCommandBuilder()
    .setName('setup-roles-bulk')
    .setDescription('Set allowed roles for a whole group of commands at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('group').setDescription('Which group of commands to configure').setRequired(true)
        .addChoices(
          { name: 'moderation  (warn, mute, unmute, ban, ad-warn)', value: 'moderation' },
          { name: 'staff-management  (fire, promote, demote, strike, jail)', value: 'staff-management' },
          { name: 'requests  (ban-req, blacklist-req, network-ban-req, partnership-req)', value: 'requests' },
          { name: 'admin  (leaderboards, case-info, reset-messages)', value: 'admin' },
          { name: 'all  (every command above)', value: 'all' },
        )
    )
    .addRoleOption(o => o.setName('role1').setDescription('Allowed role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Allowed role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Allowed role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Allowed role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Allowed role 5')),
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSetup(interaction) {
  const fields = {};
  const logChannel = interaction.options.getChannel('log-channel');
  const warnLog = interaction.options.getChannel('warn-log');
  const strikeLog = interaction.options.getChannel('strike-log');
  const requestLog = interaction.options.getChannel('request-log');
  const adWarnLog = interaction.options.getChannel('ad-warn-log');
  const staffUpdates = interaction.options.getChannel('staff-updates');
  const jailRole = interaction.options.getRole('jail-role');
  const mutedRole = interaction.options.getRole('muted-role');
  const breakRequestChannel = interaction.options.getChannel('break-request-channel');
  const breakRole = interaction.options.getRole('break-role');
  const mainBreakRole = interaction.options.getRole('main-break-role');

  if (logChannel) fields.log_channel_id = logChannel.id;
  if (warnLog) fields.warn_log_channel_id = warnLog.id;
  if (strikeLog) fields.strike_log_channel_id = strikeLog.id;
  if (requestLog) fields.request_log_channel_id = requestLog.id;
  if (adWarnLog) fields.ad_warn_log_channel_id = adWarnLog.id;
  if (staffUpdates) fields.staff_updates_channel_id = staffUpdates.id;
  if (jailRole) fields.jail_role_id = jailRole.id;
  if (mutedRole) fields.muted_role_id = mutedRole.id;
  if (breakRequestChannel) fields.break_request_channel_id = breakRequestChannel.id;
  if (breakRole) fields.break_role_id = breakRole.id;
  if (mainBreakRole) fields.main_break_role_id = mainBreakRole.id;

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
      { name: 'Staff Updates', value: ch(config.staff_updates_channel_id), inline: true },
      { name: 'Jail Role', value: rl(config.jail_role_id), inline: true },
      { name: 'Muted Role', value: rl(config.muted_role_id), inline: true },
      { name: 'Break Request Channel', value: ch(config.break_request_channel_id), inline: true },
      { name: 'Break Role (Staff Server)', value: rl(config.break_role_id), inline: true },
      { name: 'Break Role (Main Server)', value: rl(config.main_break_role_id), inline: true },
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

// ─── Command groups for bulk role assignment ───────────────────────────────────

const COMMAND_GROUPS = {
  moderation: ['warn', 'warn-leaderboard', 'ad-warn', 'remove-ad-warn', 'mute', 'unmute', 'ban'],
  'staff-management': ['fire', 'promote', 'demote-user', 'strike', 'strike-remove', 'jail', 'unjail'],
  requests: ['ban-request', 'blacklist-request', 'network-ban-request', 'partnership-request'],
  admin: ['message-leaderboard', 'case-info', 'reset-messages', 'reset-messages-all'],
};
COMMAND_GROUPS.all = Object.values(COMMAND_GROUPS).flat();

export async function handleSetupBreak(interaction) {
  const requestChannel = interaction.options.getChannel('request-channel');
  const staffBreakRole = interaction.options.getRole('staff-break-role');
  const mainBreakRole  = interaction.options.getRole('main-break-role');

  if (!requestChannel && !staffBreakRole && !mainBreakRole) {
    const config = getGuild(interaction.guildId);
    const ch = id => id ? `<#${id}>` : '`Not set`';
    const rl = id => id ? `<@&${id}>` : '`Not set`';
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('☕ Break Configuration')
          .setDescription('Current break settings. Run this command with options to update them.')
          .addFields(
            { name: '📢 Request Channel', value: ch(config.break_request_channel_id), inline: true },
            { name: '🏷️ Break Role (Staff Server)', value: rl(config.break_role_id), inline: true },
            { name: '🏷️ Break Role (Main Server)', value: rl(config.main_break_role_id), inline: true },
          )
          .setTimestamp()
      ],
      flags: 64,
    });
  }

  const fields = {};
  if (requestChannel) fields.break_request_channel_id = requestChannel.id;
  if (staffBreakRole) fields.break_role_id = staffBreakRole.id;
  if (mainBreakRole)  fields.main_break_role_id = mainBreakRole.id;

  setGuildConfig(interaction.guildId, fields);

  const saved = getGuild(interaction.guildId);
  const ch = id => id ? `<#${id}>` : '`Not set`';
  const rl = id => id ? `<@&${id}>` : '`Not set`';

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Break System Configured')
        .addFields(
          { name: '📢 Request Channel', value: ch(saved.break_request_channel_id), inline: true },
          { name: '🏷️ Break Role (Staff Server)', value: rl(saved.break_role_id), inline: true },
          { name: '🏷️ Break Role (Main Server)', value: rl(saved.main_break_role_id), inline: true },
        )
        .setFooter({ text: 'Staff can now use /break to submit a break request.' })
        .setTimestamp()
    ],
  });
}

export async function handleSetupResign(interaction) {
  const resignChannel       = interaction.options.getChannel('resign-channel');
  const verifiedRole        = interaction.options.getRole('verified-role');
  const applicationsChannel = interaction.options.getChannel('applications-channel');
  const referralLink        = interaction.options.getString('referral-link');
  const modmailTestChannel  = interaction.options.getChannel('modmail-test-channel');

  if (!resignChannel && !verifiedRole && !applicationsChannel && !referralLink && !modmailTestChannel) {
    const config = getGuild(interaction.guildId);
    const ch = id => id ? `<#${id}>` : '`Not set`';
    const rl = id => id ? `<@&${id}>` : '`Not set`';
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📝 Resign & Applications Configuration')
          .setDescription('Current resign and application settings. Run this command with options to update them.')
          .addFields(
            { name: '📢 Resign Channel', value: ch(config.resign_channel_id), inline: true },
            { name: '✅ Verified Role (kept on resign)', value: rl(config.verified_role_id), inline: true },
            { name: '📋 Applications Channel', value: ch(config.applications_channel_id), inline: true },
            { name: '🔗 Referral Link', value: config.referral_link || '`Not set`', inline: false },
            { name: '📬 Modmail Test Channel', value: ch(config.modmail_test_channel_id), inline: true },
          )
          .setTimestamp()
      ],
      flags: 64,
    });
  }

  const fields = {};
  if (resignChannel)       fields.resign_channel_id = resignChannel.id;
  if (verifiedRole)        fields.verified_role_id = verifiedRole.id;
  if (applicationsChannel) fields.applications_channel_id = applicationsChannel.id;
  if (referralLink)        fields.referral_link = referralLink;
  if (modmailTestChannel)  fields.modmail_test_channel_id = modmailTestChannel.id;

  setGuildConfig(interaction.guildId, fields);

  const saved = getGuild(interaction.guildId);
  const ch = id => id ? `<#${id}>` : '`Not set`';
  const rl = id => id ? `<@&${id}>` : '`Not set`';

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Resign & Applications Configured')
        .addFields(
          { name: '📢 Resign Channel', value: ch(saved.resign_channel_id), inline: true },
          { name: '✅ Verified Role', value: rl(saved.verified_role_id), inline: true },
          { name: '📋 Applications Channel', value: ch(saved.applications_channel_id), inline: true },
          { name: '🔗 Referral Link', value: saved.referral_link || '`Not set`', inline: false },
          { name: '📬 Modmail Test Channel', value: ch(saved.modmail_test_channel_id), inline: true },
        )
        .setTimestamp()
    ],
    flags: 64,
  });
}

export async function handleSetupRolesBulk(interaction) {
  const group = interaction.options.getString('group');
  const roles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r) roles.push(r.id);
  }

  const commands = COMMAND_GROUPS[group] || [];
  for (const cmd of commands) {
    setCommandRoles(interaction.guildId, cmd, roles);
  }

  const roleList = roles.map(id => `<@&${id}>`).join(', ');
  const cmdList  = commands.map(c => `\`/${c}\``).join(', ');

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`✅ Bulk Roles Set — ${group}`)
        .addFields(
          { name: '🏷️ Roles', value: roleList, inline: false },
          { name: `📋 Commands updated (${commands.length})`, value: cmdList.slice(0, 1024), inline: false },
        )
        .setFooter({ text: 'Use /setup-roles to fine-tune individual commands.' })
        .setTimestamp()
    ],
  });
}

export async function handleNetworkStatus(interaction) {
  const config = getGuild(interaction.guildId);

  // Determine the hub guild ID to inspect
  let hubGuildId = null;
  let viewingAsHub = false;

  if (config.is_hub) {
    hubGuildId = interaction.guildId;
    viewingAsHub = true;
  } else if (config.hub_guild_id) {
    hubGuildId = config.hub_guild_id;
  } else {
    return interaction.reply({
      content: '❌ This server is not part of a network. Run `/setup-network-hub` or `/setup-network-join` first.',
      flags: 64,
    });
  }

  const hubGuild = interaction.client.guilds.cache.get(hubGuildId);
  const hubName = hubGuild ? hubGuild.name : `Unknown (${hubGuildId})`;
  const hubReachable = !!hubGuild;

  const members = getNetworkMembers(hubGuildId);

  const memberLines = members.map(({ guild_id }) => {
    const g = interaction.client.guilds.cache.get(guild_id);
    if (g) return `✅ **${g.name}** (${guild_id})`;
    return `⚠️ **Unreachable** (${guild_id}) — bot may have left`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌐 Network Status')
    .addFields(
      {
        name: 'Hub Server',
        value: `${hubReachable ? '✅' : '⚠️'} **${hubName}** (${hubGuildId})${viewingAsHub ? ' — **(this server)**' : ''}`,
      },
      {
        name: `Linked Servers (${members.length})`,
        value: memberLines.length ? memberLines.join('\n') : '*No servers linked yet. Run `/setup-network-join` in each main server.*',
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupNetworkReset(interaction) {
  const config = getGuild(interaction.guildId);
  const wasHub = config.is_hub;
  const wasLinked = !!config.hub_guild_id;

  if (!wasHub && !wasLinked) {
    return interaction.reply({
      content: '❌ This server has no network role to clear — it is neither a hub nor linked to one.',
      flags: 64,
    });
  }

  if (wasHub) clearNetworkHub(interaction.guildId);
  if (wasLinked) clearHubGuildId(interaction.guildId);

  const lines = [];
  if (wasHub) lines.push('• Removed **hub** status from this server');
  if (wasLinked) lines.push('• Unlinked this server from its hub');

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('🔄 Network Reset')
    .setDescription(lines.join('\n') + '\n\nYou can now run `/setup-network-hub` in the correct server and `/setup-network-join` here if needed.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupNetworkHub(interaction) {
  setNetworkHub(interaction.guildId, true);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌐 Network Hub Configured')
    .setDescription(
      `**${interaction.guild.name}** is now the **network hub** (staff server).\n\n` +
      `All request logs from linked main servers will be forwarded here.\n\n` +
      `Run \`/setup-requests\` here to create the request channels, then run \`/setup-network-join\` in each of your main servers using this server's ID:\n\n` +
      `\`\`\`${interaction.guildId}\`\`\``
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupNetworkJoin(interaction) {
  const hubGuildId = interaction.options.getString('hub-server-id');

  // Verify the bot is actually in the hub server
  const hubGuild = interaction.client.guilds.cache.get(hubGuildId);
  if (!hubGuild) {
    return interaction.reply({
      content: `❌ The bot is not in server \`${hubGuildId}\`, or that ID is wrong. Make sure the bot has been added to your staff server first.`,
      flags: 64,
    });
  }

  // Verify the hub is actually configured as a hub
  const hubConfig = getGuild(hubGuildId);
  if (!hubConfig.is_hub) {
    return interaction.reply({
      content: `❌ Server \`${hubGuildId}\` (**${hubGuild.name}**) has not been set up as a network hub. Run \`/setup-network-hub\` in that server first.`,
      flags: 64,
    });
  }

  setHubGuildId(interaction.guildId, hubGuildId);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Joined Network')
    .setDescription(
      `**${interaction.guild.name}** is now linked to the network hub **${hubGuild.name}**.\n\n` +
      `Request commands (\`/ban-request\`, \`/blacklist-request\`, etc.) used in this server will automatically forward to the hub's request channels.`
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupAdChannels(interaction) {
  const action = interaction.options.getString('action');
  const channel = interaction.options.getChannel('channel');
  const guildId = interaction.guildId;

  if (action === 'list') {
    const ids = getAdChannels(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📢 Ad Channels')
      .setDescription(
        ids.length
          ? ids.map(id => `<#${id}>`).join('\n')
          : '*No ad channels configured. Use `/setup-ad-channels add #channel` to add one.*'
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (!channel) {
    return interaction.reply({ content: '❌ Please specify a channel.', flags: 64 });
  }

  if (action === 'add') {
    addAdChannel(guildId, channel.id);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Ad Channel Added')
          .setDescription(`<#${channel.id}> is now an ad channel.\n\nThe bot will:\n• Reply to every post with partner server invite links\n• Delete posts from members who leave the server`)
          .setTimestamp()
      ]
    });
  }

  if (action === 'remove') {
    const removed = removeAdChannel(guildId, channel.id);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? 0xFEE75C : 0xED4245)
          .setTitle(removed ? '✅ Ad Channel Removed' : '❌ Not Found')
          .setDescription(removed ? `<#${channel.id}> is no longer an ad channel.` : `<#${channel.id}> was not an ad channel.`)
          .setTimestamp()
      ]
    });
  }
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

export async function handleSetupBranding(interaction) {
  const pfpUrl    = interaction.options.getString('pfp-url');
  const bannerUrl = interaction.options.getString('banner-url');
  const clear     = interaction.options.getString('clear');

  const fields = {};

  if (clear === 'pfp' || clear === 'both') fields.pfp_url = null;
  if (clear === 'banner' || clear === 'both') fields.banner_url = null;
  if (pfpUrl) fields.pfp_url = pfpUrl;
  if (bannerUrl) fields.banner_url = bannerUrl;

  if (Object.keys(fields).length === 0) {
    const current = getGuild(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎨 Current Branding')
      .addFields(
        { name: 'Profile Picture', value: current.pfp_url ? `[View URL](${current.pfp_url})` : 'Not set', inline: true },
        { name: 'Banner', value: current.banner_url ? `[View URL](${current.banner_url})` : 'Not set', inline: true },
      )
      .setDescription('Use `/setup-branding pfp-url:` or `banner-url:` to update branding shown in the staff portal.')
      .setTimestamp();
    if (current.pfp_url) embed.setThumbnail(current.pfp_url);
    if (current.banner_url) embed.setImage(current.banner_url);
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  setGuildConfig(interaction.guildId, fields);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Branding Updated')
    .setTimestamp();

  const after = getGuild(interaction.guildId);
  embed.addFields(
    { name: 'Profile Picture', value: after.pfp_url ? `[View URL](${after.pfp_url})` : 'Cleared', inline: true },
    { name: 'Banner', value: after.banner_url ? `[View URL](${after.banner_url})` : 'Cleared', inline: true },
  );
  if (after.pfp_url) embed.setThumbnail(after.pfp_url);
  if (after.banner_url) embed.setImage(after.banner_url);

  await interaction.reply({ embeds: [embed], flags: 64 });
}
