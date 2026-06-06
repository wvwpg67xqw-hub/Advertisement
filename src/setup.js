import pkg from 'discord.js';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, ButtonBuilder, ActionRowBuilder, ButtonStyle } = pkg;
import { getGuild, setGuildConfig, setCommandRoles, setNetworkHub, setHubGuildId, clearNetworkHub, clearHubGuildId, getNetworkMembers, addAdChannel, removeAdChannel, getAdChannels, disableCommand, enableCommand, getDisabledCommands, setHubStaffRoles, autoLinkGuilds, getNetworkHub, setGithubRepo, setAsStaffServer, unsetStaffServer, getStaffServer, disableDmCommand, enableDmCommand, getDmDisabledCommands } from './database.js';
import { hasCommandPermission } from './utils.js';

const ALL_COMMANDS = [
  'warn',
  'ad-warn', 'remove-ad-warn',
  'mute', 'unmute', 'ban', 'fire', 'promote', 'demote-user',
  'strike', 'strike-remove',
  'jail', 'unjail',
  'ban-request', 'blacklist-request', 'network-ban-request', 'partnership-request',
  'message-leaderboard', 'case-info',
  'reset-messages', 'reset-messages-all',
  'add-xp', 'remove-xp', 'add-level', 'set-level',
];

export const setupCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server')
    .addChannelOption(o => o.setName('log-channel').setDescription('General log channel'))
    .addChannelOption(o => o.setName('warn-log').setDescription('Warning log channel'))
    .addChannelOption(o => o.setName('strike-log').setDescription('Strike log channel'))
    .addChannelOption(o => o.setName('request-log').setDescription('Request log channel'))
    .addChannelOption(o => o.setName('ad-warn-log').setDescription('Ad-warn log channel'))
    .addChannelOption(o => o.setName('ad-warn-dm-log').setDescription('Channel to log DMs sent when a user is ad-warned'))
    .addChannelOption(o => o.setName('staff-updates').setDescription('Channel for staff hire/fire/promotion announcements'))
    .addRoleOption(o => o.setName('jail-role').setDescription('Role applied to jailed users'))
    .addRoleOption(o => o.setName('muted-role').setDescription('Role applied to muted users'))
    .addChannelOption(o => o.setName('break-request-channel').setDescription('Channel where break requests are sent for approval'))
    .addRoleOption(o => o.setName('break-role').setDescription('Role given to staff on break in this server'))
    .addRoleOption(o => o.setName('main-break-role').setDescription('Role given to staff on break in the main server'))
    .addChannelOption(o => o.setName('level-log').setDescription('Channel where level-up announcements are posted'))
    .addChannelOption(o => o.setName('level-channel').setDescription('Channel where messages earn XP (leave blank = all channels)')),

  new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Set which roles can use a specific command')
    .addStringOption(o =>
      o.setName('command').setDescription('Command name').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Role 5')),

  new SlashCommandBuilder()
    .setName('setup-roles-extra')
    .setDescription('Add extra roles to a command (appends, does not replace)')
    .addStringOption(o =>
      o.setName('command').setDescription('Command name').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Role 5')),

  new SlashCommandBuilder()
    .setName('setup-status')
    .setDescription('Show the current bot configuration'),

  new SlashCommandBuilder()
    .setName('setup-edit')
    .setDescription('Edit a single bot configuration field')
    .addStringOption(o =>
      o.setName('field').setDescription('Field to edit').setRequired(true)
        .addChoices(
          { name: 'log-channel', value: 'log_channel_id' },
          { name: 'warn-log', value: 'warn_log_channel_id' },
          { name: 'strike-log', value: 'strike_log_channel_id' },
          { name: 'request-log', value: 'request_log_channel_id' },
          { name: 'ad-warn-log', value: 'ad_warn_log_channel_id' },
          { name: 'ad-warn-dm-log', value: 'ad_warn_dm_log_channel_id' },
          { name: 'level-log', value: 'level_log_channel_id' },
          { name: 'level-channel', value: 'level_xp_channel_id' },
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

  new SlashCommandBuilder()
    .setName('setup-roles-wizard')
    .setDescription('Interactive wizard: set allowed roles for every command')
    .addStringOption(o =>
      o.setName('command').setDescription('Which command to configure').setRequired(true)
        .addChoices(...ALL_COMMANDS.map(c => ({ name: c, value: c })))
    )
    .addRoleOption(o => o.setName('role1').setDescription('Allowed role 1').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Allowed role 2'))
    .addRoleOption(o => o.setName('role3').setDescription('Allowed role 3'))
    .addRoleOption(o => o.setName('role4').setDescription('Allowed role 4'))
    .addRoleOption(o => o.setName('role5').setDescription('Allowed role 5')),

  new SlashCommandBuilder()
    .setName('setup-ad-channels')
    .setDescription('Add, remove, or list ad channels (bot replies with promo links + tracks posts for cleanup on leave)')
    .addStringOption(o =>
      o.setName('action').setDescription('What to do').setRequired(true)
        .addChoices(
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'list', value: 'list' },
        )
    )
    .addChannelOption(o => o.setName('channel').setDescription('The ad channel (required for add/remove)')),

  new SlashCommandBuilder()
    .setName('setup-requests')
    .setDescription('Auto-create a Requests category with ban, blacklist, network-ban, partnership, and ad-warn channels')
    .addStringOption(o =>
      o.setName('category-name')
        .setDescription('Name for the category (default: 📋 Requests)')
    ),

  new SlashCommandBuilder()
    .setName('setup-network-hub')
    .setDescription('Mark this server as the network hub (staff server). All request logs will route here.'),

  new SlashCommandBuilder()
    .setName('setup-staff-roles')
    .setDescription('Set which roles count as Mod, Team Lead, and Admin — replaces the need for env vars')
    .addRoleOption(o => o.setName('mod-role').setDescription('Role for Mods (Rank 1 — can warn, mute, etc.)'))
    .addRoleOption(o => o.setName('team-lead-role').setDescription('Role for Team Leads (Rank 2 — can strike, promote, etc.)'))
    .addRoleOption(o => o.setName('admin-role').setDescription('Role for Admins (Rank 3 — can ban, fire, setup, etc.)')),

  new SlashCommandBuilder()
    .setName('setup-network-roles')
    .setDescription('Set the staff rank roles for the entire network — must be run in the hub server')
    .addRoleOption(o => o.setName('mod-role').setDescription('Role for Mods (Rank 1)').setRequired(true))
    .addRoleOption(o => o.setName('team-lead-role').setDescription('Role for Team Leads (Rank 2)').setRequired(true))
    .addRoleOption(o => o.setName('admin-role').setDescription('Role for Admins (Rank 3)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setup-network-join')
    .setDescription('Link this server to the network hub so requests forward to the staff server')
    .addStringOption(o =>
      o.setName('hub-server-id')
        .setDescription('The server ID of your staff/hub server')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setup-network-reset')
    .setDescription('Remove this server\'s network role (hub or linked member)'),

  new SlashCommandBuilder()
    .setName('network-status')
    .setDescription('Show the network hub and all linked servers with their bot reachability'),

  new SlashCommandBuilder()
    .setName('setup-break')
    .setDescription('Configure the break system (request channel + break roles)')
    .addChannelOption(o => o.setName('request-channel').setDescription('Channel where break requests are posted for approval'))
    .addRoleOption(o => o.setName('staff-break-role').setDescription('Role given to staff while on break in THIS server'))
    .addRoleOption(o => o.setName('main-break-role').setDescription('Role given to staff while on break in the MAIN server')),

  new SlashCommandBuilder()
    .setName('setup-resign')
    .setDescription('Configure resign system, applications, referral link and modmail test channel')
    .addChannelOption(o => o.setName('resign-channel').setDescription('Channel where resignation requests are posted for approval'))
    .addRoleOption(o => o.setName('verified-role').setDescription('Role kept in the main server when a member resigns (all others removed)'))
    .addChannelOption(o => o.setName('applications-channel').setDescription('Channel where staff applications are posted for review'))
    .addStringOption(o => o.setName('referral-link').setDescription('Referral/invite link shown in the staff panel (paste full URL)'))
    .addChannelOption(o => o.setName('modmail-test-channel').setDescription('Channel where modmail test applications are posted')),

  new SlashCommandBuilder()
    .setName('setup-branding')
    .setDescription('Set a custom server profile picture and banner URL for the staff portal')
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

  new SlashCommandBuilder()
    .setName('toggle-command')
    .setDescription('Enable or disable a slash command in this server')
    .addStringOption(o => o.setName('command').setDescription('Command name (e.g. warn, mute, add-xp)').setRequired(true))
    .addBooleanOption(o => o.setName('enabled').setDescription('true = enable, false = disable').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setup-roles-bulk')
    .setDescription('Set allowed roles for a whole group of commands at once')
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

  new SlashCommandBuilder()
    .setName('setup-github')
    .setDescription('Link a GitHub repository so /release-notes auto-fills commit history')
    .addStringOption(o => o.setName('repo').setDescription('Repository in owner/repo format (e.g. myname/mybot)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setup-wizard')
    .setDescription('Interactive setup wizard — see what\'s configured and what still needs attention'),

  new SlashCommandBuilder()
    .setName('setup-staff-server')
    .setDescription('Mark this server as the network staff server (saves its ID to the database)')
    .addBooleanOption(o =>
      o.setName('unset').setDescription('Remove the staff-server designation from this server')
    ),

  new SlashCommandBuilder()
    .setName('setup-dm-command')
    .setDescription('Disable or enable a bot command in DMs globally')
    .addStringOption(o =>
      o.setName('action').setDescription('What to do').setRequired(true)
        .addChoices(
          { name: 'disable', value: 'disable' },
          { name: 'enable', value: 'enable' },
          { name: 'list', value: 'list' },
        )
    )
    .addStringOption(o =>
      o.setName('command').setDescription('Command name to disable/enable in DMs (not needed for list)')
    ),
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSetup(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const fields = {};
  const logChannel = interaction.options.getChannel('log-channel');
  const warnLog = interaction.options.getChannel('warn-log');
  const strikeLog = interaction.options.getChannel('strike-log');
  const requestLog = interaction.options.getChannel('request-log');
  const adWarnLog = interaction.options.getChannel('ad-warn-log');
  const adWarnDmLog = interaction.options.getChannel('ad-warn-dm-log');
  const levelLog = interaction.options.getChannel('level-log');
  const levelChannel = interaction.options.getChannel('level-channel');
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
  if (adWarnDmLog) fields.ad_warn_dm_log_channel_id = adWarnDmLog.id;
  if (levelLog) fields.level_log_channel_id = levelLog.id;
  if (levelChannel) fields.level_xp_channel_id = levelChannel.id;
  if (staffUpdates) fields.staff_updates_channel_id = staffUpdates.id;
  if (jailRole) fields.jail_role_id = jailRole.id;
  if (mutedRole) fields.muted_role_id = mutedRole.id;
  if (breakRequestChannel) fields.break_request_channel_id = breakRequestChannel.id;
  if (breakRole) fields.break_role_id = breakRole.id;
  if (mainBreakRole) fields.main_break_role_id = mainBreakRole.id;

  if (Object.keys(fields).length === 0) {
    return interaction.reply({ content: '❌ You must provide at least one option to configure.', flags: 64 });
  }

  await setGuildConfig(interaction.guildId, fields);

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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const command = interaction.options.getString('command');
  const roles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r) roles.push(r.id);
  }
  await setCommandRoles(interaction.guildId, command, roles);
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const command = interaction.options.getString('command');
  const { getCommandRoles } = await import('./database.js');
  const existing = await getCommandRoles(interaction.guildId, command);
  const newRoles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r && !existing.includes(r.id)) newRoles.push(r.id);
  }
  const merged = [...existing, ...newRoles];
  await setCommandRoles(interaction.guildId, command, merged);
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const config = await getGuild(interaction.guildId);
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
      { name: 'Ad-Warn DM Log', value: ch(config.ad_warn_dm_log_channel_id), inline: true },
      { name: 'Level Log', value: ch(config.level_log_channel_id), inline: true },
      { name: 'Level XP Channel', value: ch(config.level_xp_channel_id) + (config.level_xp_channel_id ? '' : ' *(all channels)*'), inline: true },
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
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

  await setGuildConfig(interaction.guildId, { [field]: value });
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const requestChannel = interaction.options.getChannel('request-channel');
  const staffBreakRole = interaction.options.getRole('staff-break-role');
  const mainBreakRole  = interaction.options.getRole('main-break-role');

  if (!requestChannel && !staffBreakRole && !mainBreakRole) {
    const config = await getGuild(interaction.guildId);
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

  await setGuildConfig(interaction.guildId, fields);

  const saved = await getGuild(interaction.guildId);
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const resignChannel       = interaction.options.getChannel('resign-channel');
  const verifiedRole        = interaction.options.getRole('verified-role');
  const applicationsChannel = interaction.options.getChannel('applications-channel');
  const referralLink        = interaction.options.getString('referral-link');
  const modmailTestChannel  = interaction.options.getChannel('modmail-test-channel');

  if (!resignChannel && !verifiedRole && !applicationsChannel && !referralLink && !modmailTestChannel) {
    const config = await getGuild(interaction.guildId);
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

  await setGuildConfig(interaction.guildId, fields);

  const saved = await getGuild(interaction.guildId);
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
  });
}

export async function handleSetupRolesBulk(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const group = interaction.options.getString('group');
  const roles = [];
  for (let i = 1; i <= 5; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r) roles.push(r.id);
  }

  const commands = COMMAND_GROUPS[group] || [];
  for (const cmd of commands) {
    await setCommandRoles(interaction.guildId, cmd, roles);
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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const config = await getGuild(interaction.guildId);

  // Standalone mode — server hasn't joined a network, show per-server status
  if (!config.is_hub && !config.hub_guild_id) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🖥️ Server Status — Standalone')
      .setDescription(
        `**${interaction.guild.name}** is running in standalone mode.\n\n` +
        `Staff roles and channels are configured just for this server.\n` +
        `Run \`/setup-staff-roles\` to set your rank roles, or \`/setup-network-hub\` to enable multi-server networking.`
      )
      .addFields(
        { name: '🔹 Mod Role',       value: config.hub_mod_role_id       ? `<@&${config.hub_mod_role_id}>` : '`Not set`', inline: true },
        { name: '🔸 Team Lead Role', value: config.hub_team_lead_role_id ? `<@&${config.hub_team_lead_role_id}>` : '`Not set`', inline: true },
        { name: '🔴 Admin Role',     value: config.hub_admin_role_id     ? `<@&${config.hub_admin_role_id}>` : '`Not set`', inline: true },
        { name: '👑 Owner Role',     value: config.hub_owner_role_id     ? `<@&${config.hub_owner_role_id}>` : '`Not set`', inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  let hubGuildId = null;
  let viewingAsHub = false;

  if (config.is_hub) {
    hubGuildId = interaction.guildId;
    viewingAsHub = true;
  } else {
    hubGuildId = config.hub_guild_id;
  }

  const hubGuild = interaction.client.guilds.cache.get(hubGuildId);
  const hubName = hubGuild ? hubGuild.name : `Unknown (${hubGuildId})`;
  const hubReachable = !!hubGuild;

  const members = await getNetworkMembers(hubGuildId);

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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const config = await getGuild(interaction.guildId);
  const wasHub = config.is_hub;
  const wasLinked = !!config.hub_guild_id;

  if (!wasHub && !wasLinked) {
    return interaction.reply({
      content: '❌ This server has no network role to clear — it is neither a hub nor linked to one.',
      flags: 64,
    });
  }

  if (wasHub) await clearNetworkHub(interaction.guildId);
  if (wasLinked) await clearHubGuildId(interaction.guildId);

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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  await interaction.deferReply();

  const previousHub = await getNetworkHub();
  if (previousHub && previousHub.guild_id !== interaction.guildId) {
    await clearNetworkHub(previousHub.guild_id);
  }

  await setNetworkHub(interaction.guildId, true);

  const allGuildIds = [...interaction.client.guilds.cache.keys()];
  await autoLinkGuilds(interaction.guildId, allGuildIds);

  const linked = allGuildIds.filter(id => id !== interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌐 Network Hub Set')
    .setDescription(
      `**${interaction.guild.name}** is now the **staff/hub server**.\n\n` +
      `✅ **${linked.length} server${linked.length !== 1 ? 's' : ''}** automatically linked to this hub.\n\n` +
      `Any server the bot joins in the future will also be linked automatically.\n\n` +
      `Run \`/setup-network-roles\` here to set which roles count as Mod/Team Lead/Admin across the whole network.`
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function handleSetupStaffRoles(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const modRole      = interaction.options.getRole('mod-role');
  const teamLeadRole = interaction.options.getRole('team-lead-role');
  const adminRole    = interaction.options.getRole('admin-role');

  if (!modRole && !teamLeadRole && !adminRole) {
    const config = await getGuild(interaction.guildId);
    const rl = id => id ? `<@&${id}>` : '`Not set`';
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🏷️ Staff Role Configuration')
        .setDescription('Current staff rank roles for this server. Run this command with options to update them.')
        .addFields(
          { name: '🟡 Mod (Rank 1)',       value: rl(config.hub_mod_role_id),       inline: true },
          { name: '🟠 Team Lead (Rank 2)', value: rl(config.hub_team_lead_role_id), inline: true },
          { name: '🔴 Admin (Rank 3)',     value: rl(config.hub_admin_role_id),     inline: true },
        )
        .setFooter({ text: 'These override MOD_ROLE_ID / TEAM_LEAD_ROLE_ID / ADMIN_ROLE_ID env vars.' })
        .setTimestamp()],
      flags: 64,
    });
  }

  const current = await getGuild(interaction.guildId);
  await setHubStaffRoles(
    interaction.guildId,
    modRole?.id      ?? current.hub_mod_role_id      ?? null,
    teamLeadRole?.id ?? current.hub_team_lead_role_id ?? null,
    adminRole?.id    ?? current.hub_admin_role_id     ?? null,
  );

  const saved = await getGuild(interaction.guildId);
  const rl = id => id ? `<@&${id}>` : '`Not set`';

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Staff Roles Configured')
      .setDescription('Staff ranks for this server are now set. No env vars needed.')
      .addFields(
        { name: '🟡 Mod (Rank 1)',       value: rl(saved.hub_mod_role_id),       inline: true },
        { name: '🟠 Team Lead (Rank 2)', value: rl(saved.hub_team_lead_role_id), inline: true },
        { name: '🔴 Admin (Rank 3)',     value: rl(saved.hub_admin_role_id),     inline: true },
      )
      .setTimestamp()],
  });
}

export async function handleSetupNetworkRoles(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const config = await getGuild(interaction.guildId);
  if (!config.is_hub) {
    return interaction.reply({
      content: '❌ This command can only be used in the **network hub** server. Run `/setup-network-hub` in the hub server first.',
      flags: 64,
    });
  }

  const modRole      = interaction.options.getRole('mod-role');
  const teamLeadRole = interaction.options.getRole('team-lead-role');
  const adminRole    = interaction.options.getRole('admin-role');

  await setHubStaffRoles(interaction.guildId, modRole.id, teamLeadRole.id, adminRole.id);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Network Staff Roles Configured')
    .setDescription('These roles now define staff ranks **across every server in the network**. Linked servers automatically inherit this hierarchy.')
    .addFields(
      { name: '🟡 Mod (Rank 1)',       value: `<@&${modRole.id}>`,      inline: true },
      { name: '🟠 Team Lead (Rank 2)', value: `<@&${teamLeadRole.id}>`, inline: true },
      { name: '🔴 Admin (Rank 3)',     value: `<@&${adminRole.id}>`,    inline: true },
    )
    .setFooter({ text: 'No env vars needed — role IDs are stored in the database.' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleSetupNetworkJoin(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const hubGuildId = interaction.options.getString('hub-server-id');

  const hubGuild = interaction.client.guilds.cache.get(hubGuildId);
  if (!hubGuild) {
    return interaction.reply({
      content: `❌ The bot is not in server \`${hubGuildId}\`, or that ID is wrong. Make sure the bot has been added to your staff server first.`,
      flags: 64,
    });
  }

  const hubConfig = await getGuild(hubGuildId);
  if (!hubConfig.is_hub) {
    return interaction.reply({
      content: `❌ Server \`${hubGuildId}\` (**${hubGuild.name}**) has not been set up as a network hub. Run \`/setup-network-hub\` in that server first.`,
      flags: 64,
    });
  }

  await setHubGuildId(interaction.guildId, hubGuildId);

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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const action = interaction.options.getString('action');
  const channel = interaction.options.getChannel('channel');
  const guildId = interaction.guildId;

  if (action === 'list') {
    const ids = await getAdChannels(guildId);
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
    await addAdChannel(guildId, channel.id);
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
    const removed = await removeAdChannel(guildId, channel.id);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? 0x57F287 : 0xED4245)
          .setTitle(removed ? '✅ Ad Channel Removed' : '❌ Not Found')
          .setDescription(removed ? `<#${channel.id}> is no longer an ad channel.` : `<#${channel.id}> was not an ad channel.`)
          .setTimestamp()
      ]
    });
  }
}

export async function handleSetupRequests(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
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

    await setGuildConfig(interaction.guildId, dbFields);

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
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const pfpUrl    = interaction.options.getString('pfp-url');
  const bannerUrl = interaction.options.getString('banner-url');
  const clear     = interaction.options.getString('clear');

  const fields = {};

  if (clear === 'pfp' || clear === 'both') fields.pfp_url = null;
  if (clear === 'banner' || clear === 'both') fields.banner_url = null;
  if (pfpUrl) fields.pfp_url = pfpUrl;
  if (bannerUrl) fields.banner_url = bannerUrl;

  if (Object.keys(fields).length === 0) {
    const current = await getGuild(interaction.guildId);
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

  await setGuildConfig(interaction.guildId, fields);
  const updated = await getGuild(interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Branding Updated')
    .addFields(
      { name: 'Profile Picture', value: updated.pfp_url ? `[View URL](${updated.pfp_url})` : 'Cleared', inline: true },
      { name: 'Banner', value: updated.banner_url ? `[View URL](${updated.banner_url})` : 'Cleared', inline: true },
    )
    .setTimestamp();
  if (updated.pfp_url) embed.setThumbnail(updated.pfp_url);
  if (updated.banner_url) embed.setImage(updated.banner_url);
  return interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleToggleCommand(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const commandName = interaction.options.getString('command').toLowerCase().trim();
  const enabled = interaction.options.getBoolean('enabled');

  if (enabled) {
    await enableCommand(interaction.guildId, commandName);
  } else {
    await disableCommand(interaction.guildId, commandName);
  }

  const disabled = await getDisabledCommands(interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57F287 : 0xED4245)
    .setTitle(enabled ? '✅ Command Enabled' : '❌ Command Disabled')
    .setDescription(`\`/${commandName}\` has been **${enabled ? 'enabled' : 'disabled'}** in this server.`)
    .setTimestamp();

  if (disabled.length > 0) {
    embed.addFields({ name: 'Currently Disabled Commands', value: disabled.map(c => `\`/${c}\``).join(', ') });
  }

  await interaction.reply({ embeds: [embed], flags: 64 });
}

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

function wizardProgressBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function buildWizardEmbed(config, guildName) {
  const sections = [
    {
      name: '👑 Staff Ranks',
      items: [
        { label: 'Mod Role',       value: config.hub_mod_role_id,       type: 'role' },
        { label: 'Team Lead Role', value: config.hub_team_lead_role_id, type: 'role' },
        { label: 'Admin Role',     value: config.hub_admin_role_id,     type: 'role' },
        { label: 'Owner Role',     value: config.hub_owner_role_id,     type: 'role' },
      ],
      cmd: '`/setup-staff-roles`',
    },
    {
      name: '📋 Log Channels',
      items: [
        { label: 'General Log',    value: config.log_channel_id,          type: 'channel' },
        { label: 'Warn Log',       value: config.warn_log_channel_id,     type: 'channel' },
        { label: 'Strike Log',     value: config.strike_log_channel_id,   type: 'channel' },
        { label: 'Request Log',    value: config.request_log_channel_id,  type: 'channel' },
        { label: 'Staff Updates',  value: config.staff_updates_channel_id, type: 'channel' },
      ],
      cmd: '`/setup`',
    },
    {
      name: '🔨 Moderation Roles',
      items: [
        { label: 'Jail Role',  value: config.jail_role_id,  type: 'role' },
        { label: 'Muted Role', value: config.muted_role_id, type: 'role' },
      ],
      cmd: '`/setup jail-role:@Role muted-role:@Role`',
    },
    {
      name: '☕ Break System',
      items: [
        { label: 'Break Request Channel', value: config.break_request_channel_id, type: 'channel' },
        { label: 'Break Role',            value: config.break_role_id,            type: 'role' },
      ],
      cmd: '`/setup-break`',
    },
    {
      name: '🚪 Resign & Applications',
      items: [
        { label: 'Resign Channel',       value: config.resign_channel_id,       type: 'channel' },
        { label: 'Applications Channel', value: config.applications_channel_id, type: 'channel' },
      ],
      cmd: '`/setup-resign`',
    },
    {
      name: '📨 Request Channels',
      items: [
        { label: 'Ban Requests',         value: config.ban_request_channel_id,         type: 'channel' },
        { label: 'Blacklist Requests',   value: config.blacklist_request_channel_id,   type: 'channel' },
        { label: 'Network Ban Requests', value: config.network_ban_request_channel_id, type: 'channel' },
        { label: 'Partnership Requests', value: config.partnership_request_channel_id, type: 'channel' },
      ],
      cmd: '`/setup-requests`',
    },
  ];

  let doneCount = 0;
  const fields = [];

  for (const section of sections) {
    const setItems  = section.items.filter(i => i.value);
    const total     = section.items.length;
    const allSet    = setItems.length === total;
    const noneSet   = setItems.length === 0;
    if (allSet) doneCount++;

    const icon   = allSet ? '✅' : noneSet ? '❌' : '⚠️';
    const status = allSet ? 'All set' : `${setItems.length}/${total} configured`;

    const lines = section.items.map(item => {
      if (item.value) {
        const fmt = item.type === 'role' ? `<@&${item.value}>` : `<#${item.value}>`;
        return `✅ ${item.label}: ${fmt}`;
      }
      return `❌ ${item.label}: *not set*`;
    });

    let body = lines.join('\n');
    if (!allSet) body += `\n> **→ Run:** ${section.cmd}`;

    fields.push({ name: `${icon} ${section.name} — ${status}`, value: body, inline: false });
  }

  const pct = Math.round((doneCount / sections.length) * 100);
  const bar = wizardProgressBar(pct);

  const networkLine = config.is_hub
    ? '🌐 Hub server — multi-server networking active'
    : config.hub_guild_id
      ? `🔗 Linked to hub \`${config.hub_guild_id}\``
      : 'ℹ️ Standalone — run `/setup-network-hub` to enable networking';

  const embed = new EmbedBuilder()
    .setColor(pct === 100 ? 0x57F287 : pct >= 50 ? 0xFFA500 : 0xED4245)
    .setTitle(`⚙️ Setup Wizard — ${guildName}`)
    .setDescription(
      `**Progress:** ${bar} **${pct}%** *(${doneCount}/${sections.length} sections complete)*\n` +
      `**Network:** ${networkLine}`
    )
    .addFields(...fields)
    .setFooter({ text: 'Run any setup command, then click Refresh to update this status.' })
    .setTimestamp();

  return embed;
}

function buildWizardComponents(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wizard:refresh:${guildId}`)
      .setLabel('🔄 Refresh Status')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`wizard:help:${guildId}`)
      .setLabel('📖 All Setup Commands')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function handleSetupWizard(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const config = await getGuild(interaction.guildId);
  const embed  = buildWizardEmbed(config, interaction.guild.name);
  const row    = buildWizardComponents(interaction.guildId);
  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

export async function handleSetupStaffServer(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });

  const unset = interaction.options.getBoolean('unset') ?? false;

  if (unset) {
    await unsetStaffServer(interaction.guildId);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🏢 Staff Server Designation Removed')
          .setDescription(`**${interaction.guild.name}** is no longer marked as the network staff server.`)
          .setTimestamp()
      ],
      flags: 64,
    });
  }

  await setAsStaffServer(interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏢 Staff Server Set')
    .setDescription(`**${interaction.guild.name}** is now marked as the **network staff server**.`)
    .addFields(
      { name: '🆔 Server ID', value: `\`${interaction.guildId}\``, inline: false },
      { name: 'ℹ️ What this means', value: 'This server ID is saved in the database. Other servers in your network can reference it as the central staff management hub.', inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleSetupDmCommand(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });

  const action = interaction.options.getString('action');

  if (action === 'list') {
    const disabled = await getDmDisabledCommands();
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🚫 DM-Disabled Commands')
      .setDescription(
        disabled.length
          ? disabled.map(c => `\`/${c}\``).join(', ')
          : '*No commands are currently disabled in DMs.*'
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const commandName = interaction.options.getString('command')?.toLowerCase().trim();
  if (!commandName) {
    return interaction.reply({ content: '❌ Please provide a `command` name for disable/enable actions.', flags: 64 });
  }

  if (action === 'disable') {
    await disableDmCommand(commandName);
  } else {
    await enableDmCommand(commandName);
  }

  const disabled = await getDmDisabledCommands();
  const embed = new EmbedBuilder()
    .setColor(action === 'disable' ? 0xED4245 : 0x57F287)
    .setTitle(action === 'disable' ? '🚫 Command Disabled in DMs' : '✅ Command Enabled in DMs')
    .setDescription(`\`/${commandName}\` is now **${action === 'disable' ? 'blocked' : 'allowed'}** when used in DMs.`)
    .setTimestamp();

  if (disabled.length > 0) {
    embed.addFields({ name: 'Currently DM-Disabled', value: disabled.map(c => `\`/${c}\``).join(', ') });
  }

  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleSetupGithub(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup')) return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  const raw = interaction.options.getString('repo').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    return interaction.reply({ content: '❌ Invalid format. Use `owner/repo` (e.g. `myname/mybot`).', flags: 64 });
  }

  const testRes = await fetch(`https://api.github.com/repos/${raw}`, {
    headers: { 'User-Agent': 'discord-bot', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  }).catch(() => null);

  if (!testRes || testRes.status === 404) {
    return interaction.reply({ content: `❌ Repository \`${raw}\` not found. Make sure it's public, or add a \`GITHUB_TOKEN\` secret for private repos.`, flags: 64 });
  }

  await setGithubRepo(interaction.guildId, raw);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ GitHub Repository Linked')
    .setDescription(`\`${raw}\` is now linked to this server.\n\n\`/release-notes\` will automatically pull your latest commit messages when you don't provide a \`changes\` value.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
