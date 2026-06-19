/**
 * Honeypot — trap channel that silently flags / acts on anyone who posts in it.
 *
 * Setup: /honeypot setup #channel action:[none|dm|timeout|kick|ban] [alert:#channel]
 * The honeypot channel is left visible to all members. Legitimate users won't post
 * in an empty, unlabelled channel — automated bots, scrapers, and raiders will.
 * Any message from a non-bot triggers the configured action and fires an alert.
 */

import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = pkg;

import pool from '../../mysqldb.js';
import { logError } from '../devLogger.js';

// ── In-memory cache: guildId → { channel_id, alert_channel_id, action } ──────

export const honeypotCache = new Map();

export async function loadHoneypotConfigs() {
  try {
    const [rows] = await pool.execute('SELECT * FROM honeypot_config');
    honeypotCache.clear();
    for (const row of rows) honeypotCache.set(row.guild_id, row);
  } catch (err) {
    logError('Honeypot: loadConfigs', err).catch(() => {});
  }
}

// ── Command defs ──────────────────────────────────────────────────────────────

export const defs = [
  new SlashCommandBuilder()
    .setName('honeypot')
    .setDescription('Trap channel that silently catches and acts on unauthorized message senders')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('Enable the honeypot in a channel')
        .addChannelOption(o =>
          o.setName('channel').setDescription('The trap channel (leave this blank and unlinked in your server)').setRequired(true))
        .addStringOption(o =>
          o.setName('action')
            .setDescription('What to do when someone triggers the trap')
            .setRequired(true)
            .addChoices(
              { name: 'Log only — record and alert, no punishment',   value: 'none' },
              { name: 'DM — warn the user via direct message',        value: 'dm' },
              { name: 'Timeout — 24-hour Discord timeout',            value: 'timeout' },
              { name: 'Kick — remove from server',                    value: 'kick' },
              { name: 'Ban — permanently ban',                        value: 'ban' },
            ))
        .addChannelOption(o =>
          o.setName('alert_channel')
            .setDescription('Where to post trigger alerts (defaults to your configured log channel)')
            .setRequired(false)))
    .addSubcommand(s =>
      s.setName('disable')
        .setDescription('Disable and remove the honeypot for this server'))
    .addSubcommand(s =>
      s.setName('status')
        .setDescription('Show current honeypot config and total trigger count'))
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('Paginated list of users who have triggered the honeypot')
        .addIntegerOption(o =>
          o.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)))
    .addSubcommand(s =>
      s.setName('clear')
        .setDescription('Clear the trigger log for this server (does not undo actions taken)')),
];

// ── /honeypot handler ─────────────────────────────────────────────────────────

export async function handleHoneypot(interaction) {
  try {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup')   return await _setup(interaction);
    if (sub === 'disable') return await _disable(interaction);
    if (sub === 'status')  return await _status(interaction);
    if (sub === 'list')    return await _list(interaction);
    if (sub === 'clear')   return await _clear(interaction);
  } catch (err) {
    logError('Honeypot command', err).catch(() => {});
    const msg = { content: `❌ ${err.message}` };
    if (interaction.deferred) interaction.editReply(msg).catch(() => {});
    else if (!interaction.replied) interaction.reply(msg).catch(() => {});
  }
}

async function _setup(interaction) {
  const channel      = interaction.options.getChannel('channel');
  const action       = interaction.options.getString('action');
  const alertChannel = interaction.options.getChannel('alert_channel') ?? null;
  const now          = Math.floor(Date.now() / 1000);

  await pool.execute(
    `INSERT INTO honeypot_config (guild_id, channel_id, alert_channel_id, action, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), alert_channel_id = VALUES(alert_channel_id),
       action = VALUES(action), created_at = VALUES(created_at), created_by = VALUES(created_by)`,
    [interaction.guildId, channel.id, alertChannel?.id ?? null, action, now, interaction.user.id],
  );

  honeypotCache.set(interaction.guildId, {
    guild_id:         interaction.guildId,
    channel_id:       channel.id,
    alert_channel_id: alertChannel?.id ?? null,
    action,
  });

  const actionLabel = {
    none: 'Log only',
    dm:   'DM warning',
    timeout: '24h timeout',
    kick: 'Kick',
    ban:  'Ban',
  }[action] ?? action;

  // Post the decoy security embed into the trap channel
  const trapEmbed = new EmbedBuilder()
    .setTitle('🍯 Automated Security Verification System')
    .setColor(0xFF6B35)
    .setDescription(
      'Welcome to the server security verification channel.\n\n' +
      'This channel is part of our automated anti-abuse, anti-spam, and account integrity monitoring system. ' +
      'It is used to detect compromised accounts, malicious automation, spam bots, selfbots, and unauthorized scripts attempting to interact with the server.\n\n' +
      '**Please read carefully:**\n' +
      '• Regular members should never send messages in this channel.\n' +
      '• No verification, commands, or actions are required here.\n' +
      '• Any message, command, link, attachment, emoji reaction, or automated interaction may be treated as suspicious activity.\n\n' +
      'For security reasons, all activity in this channel is logged and analyzed in real time.\n\n' +
      'Accounts detected sending unsolicited advertisements, scam links, mass mentions, phishing attempts, malicious content, or automated spam will be subject to immediate enforcement, including:\n\n' +
      '• Automatic account flagging\n' +
      '• Instant server ban\n' +
      '• Moderator review and evidence logging\n' +
      '• Cross-server threat reporting\n\n' +
      'If your account has been compromised, remove any malicious applications, reset your password, enable two-factor authentication, and secure your connected devices immediately.\n\n' +
      '**Warning:**\n' +
      'Posting in this channel indicates either unauthorized automation or deliberate misuse. Any interaction may trigger automatic moderation actions without further warning.\n\n' +
      '*No legitimate user should post here.*',
    )
    .setTimestamp();

  await channel.send({ embeds: [trapEmbed] }).catch(() => {});

  // Confirm back to the admin
  const confirmEmbed = new EmbedBuilder()
    .setTitle('🍯 Honeypot Activated')
    .setColor(0xFF6B35)
    .setDescription(
      `The trap embed has been posted in <#${channel.id}>.\n\n` +
      `⚠️ Do **not** link or mention this channel anywhere. Leave it sitting silently in your channel list.`,
    )
    .addFields(
      { name: '📍 Trap Channel',  value: `<#${channel.id}>`,                                          inline: true },
      { name: '⚡ Action',        value: actionLabel,                                                  inline: true },
      { name: '🔔 Alert Channel', value: alertChannel ? `<#${alertChannel.id}>` : 'Default log channel', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Configured by ${interaction.user.tag}` });

  await interaction.editReply({ embeds: [confirmEmbed] });
}

async function _disable(interaction) {
  await pool.execute('DELETE FROM honeypot_config WHERE guild_id = ?', [interaction.guildId]);
  honeypotCache.delete(interaction.guildId);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🍯 Honeypot Disabled')
        .setColor(0x57F287)
        .setDescription('The honeypot has been removed. The trap channel still exists — you can delete or repurpose it manually.')
        .setTimestamp()
        .setFooter({ text: `Disabled by ${interaction.user.tag}` }),
    ],
  });
}

async function _status(interaction) {
  const cfg = honeypotCache.get(interaction.guildId);
  if (!cfg) {
    return interaction.editReply({ content: '❌ No honeypot is configured in this server. Use `/honeypot setup` to activate one.' });
  }

  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM honeypot_triggers WHERE guild_id = ?',
    [interaction.guildId],
  );
  const [[last]] = await pool.execute(
    'SELECT username, triggered_at, action_taken FROM honeypot_triggers WHERE guild_id = ? ORDER BY triggered_at DESC LIMIT 1',
    [interaction.guildId],
  ).catch(() => [[null]]);

  const actionLabel = { none: 'Log only', dm: 'DM warning', timeout: '24h timeout', kick: 'Kick', ban: 'Ban' }[cfg.action] ?? cfg.action;

  const embed = new EmbedBuilder()
    .setTitle('🍯 Honeypot Status')
    .setColor(0xFF6B35)
    .addFields(
      { name: '📍 Trap Channel',  value: `<#${cfg.channel_id}>`,                                           inline: true },
      { name: '⚡ Action',        value: actionLabel,                                                       inline: true },
      { name: '🔔 Alert Channel', value: cfg.alert_channel_id ? `<#${cfg.alert_channel_id}>` : 'Default', inline: true },
      { name: '🪤 Total Catches', value: String(total),                                                    inline: true },
      { name: '🕐 Last Trigger',  value: last ? `${last.username} — <t:${last.triggered_at}:R>` : 'None', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Staff Portal · Honeypot` });

  await interaction.editReply({ embeds: [embed] });
}

async function _list(interaction) {
  const page     = (interaction.options.getInteger('page') ?? 1) - 1;
  const pageSize = 10;

  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM honeypot_triggers WHERE guild_id = ?',
    [interaction.guildId],
  );
  const [rows] = await pool.execute(
    'SELECT * FROM honeypot_triggers WHERE guild_id = ? ORDER BY triggered_at DESC LIMIT ? OFFSET ?',
    [interaction.guildId, pageSize, page * pageSize],
  );

  if (!rows.length) {
    return interaction.editReply({ content: '✅ No honeypot triggers recorded yet.' });
  }

  const lines = rows.map((r, i) =>
    `\`${page * pageSize + i + 1}.\` <@${r.user_id}> (${r.username}) — <t:${r.triggered_at}:f> — **${r.action_taken}**` +
    (r.content_preview ? `\n> ${r.content_preview.slice(0, 80)}` : ''),
  );

  const totalPages = Math.ceil(total / pageSize);

  const embed = new EmbedBuilder()
    .setTitle(`🍯 Honeypot Triggers — Page ${page + 1}/${totalPages}`)
    .setColor(0xFF6B35)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${total} total trigger(s) · /honeypot list page:N` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function _clear(interaction) {
  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM honeypot_triggers WHERE guild_id = ?',
    [interaction.guildId],
  );
  await pool.execute('DELETE FROM honeypot_triggers WHERE guild_id = ?', [interaction.guildId]);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🧹 Honeypot Log Cleared')
        .setColor(0x57F287)
        .setDescription(`Deleted **${total}** trigger record(s). Actions already taken (timeouts, kicks, bans) are **not** reversed.`)
        .setTimestamp()
        .setFooter({ text: `Cleared by ${interaction.user.tag}` }),
    ],
  });
}

// ── Trigger handler — called by server.js messageCreate ───────────────────────

export async function handleHoneypotTrigger(msg, config, guildConfig) {
  const now     = Math.floor(Date.now() / 1000);
  const preview = msg.content?.slice(0, 200) || '*(no text content)*';
  const member  = msg.member ?? await msg.guild.members.fetch(msg.author.id).catch(() => null);

  let actionTaken = config.action;

  try {
    await msg.delete().catch(() => {});

    if (config.action === 'dm') {
      await msg.author.send(
        `⚠️ **Your message was caught by the honeypot in ${msg.guild.name}.**\n` +
        `You sent a message in a restricted channel. Please do not post there again.`,
      ).catch(() => { actionTaken = 'dm_failed'; });

    } else if (config.action === 'timeout' && member) {
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await member.timeout(24 * 60 * 60 * 1000, 'Honeypot trigger').catch(() => { actionTaken = 'timeout_failed'; });
      await msg.author.send(
        `⏱️ You have been timed out in **${msg.guild.name}** for 24 hours for sending a message in a honeypot channel.`,
      ).catch(() => {});

    } else if (config.action === 'kick' && member) {
      await msg.author.send(
        `🚪 You have been kicked from **${msg.guild.name}** for triggering a honeypot channel.`,
      ).catch(() => {});
      await member.kick('Honeypot trigger').catch(() => { actionTaken = 'kick_failed'; });

    } else if (config.action === 'ban') {
      await msg.author.send(
        `🔨 You have been banned from **${msg.guild.name}** for triggering a honeypot channel.`,
      ).catch(() => {});
      await msg.guild.members.ban(msg.author.id, { reason: 'Honeypot trigger', deleteMessageSeconds: 86400 })
        .catch(() => { actionTaken = 'ban_failed'; });
    }
  } catch (err) {
    logError('Honeypot: action execution', err).catch(() => {});
  }

  await pool.execute(
    'INSERT INTO honeypot_triggers (guild_id, user_id, username, content_preview, triggered_at, action_taken) VALUES (?, ?, ?, ?, ?, ?)',
    [msg.guildId, msg.author.id, msg.author.tag, preview, now, actionTaken],
  ).catch(() => {});

  const alertChannelId = config.alert_channel_id ?? guildConfig?.log_channel_id ?? null;
  if (!alertChannelId) return;

  const alertChannel = msg.guild.channels.cache.get(alertChannelId);
  if (!alertChannel) return;

  const actionLabel = {
    none:           '📋 Logged only',
    dm:             '📩 DM sent',
    dm_failed:      '📩 DM attempted (user has DMs closed)',
    timeout:        '⏱️ 24h timeout applied',
    timeout_failed: '⏱️ Timeout failed (missing perms?)',
    kick:           '🚪 Kicked',
    kick_failed:    '🚪 Kick failed (missing perms?)',
    ban:            '🔨 Banned',
    ban_failed:     '🔨 Ban failed (missing perms?)',
  }[actionTaken] ?? actionTaken;

  const embed = new EmbedBuilder()
    .setTitle('🍯 Honeypot Triggered')
    .setColor(0xFF6B35)
    .setThumbnail(msg.author.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 User',          value: `<@${msg.author.id}> \`${msg.author.tag}\` (${msg.author.id})`, inline: false },
      { name: '📍 Trap Channel',  value: `<#${msg.channelId}>`,                                          inline: true  },
      { name: '⚡ Action Taken',  value: actionLabel,                                                    inline: true  },
      { name: '🕐 Time',          value: `<t:${now}:f>`,                                                 inline: true  },
      { name: '💬 Message',       value: `\`\`\`${preview}\`\`\``,                                       inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Honeypot' });

  await alertChannel.send({ embeds: [embed] }).catch(() => {});
}
