import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = pkg;

import client from '../../botClient.js';
import db from '../../db.js';
import { sendDM } from '../../dmRest.js';
import {
  setupDevServer, logCommand, logError,
  getRecentLogs, setDebug, isDebugEnabled,
} from '../devLogger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEV_GUILD_ID = '1472759140232204551';
const BOT_DEV_ID   = process.env.OWNER_ID || '1453592157607825595';

const TOS_MESSAGE = `**Advertisement Hub Bot — Terms of Service**
*Last Updated: June 6, 2026*

By using the Advertisement Hub bot, you agree to the following terms:

**1. Acceptance of Terms**
Using the bot means you agree to follow these Terms of Service and all applicable Discord Terms and Community Guidelines.

**2. Purpose of the Bot**
The bot is provided to help manage advertisements, server partnerships, moderation, and other community features within Advertisement Hub and any servers where it is authorized.

**3. User Responsibilities**
You agree not to:
• Abuse, exploit, or attempt to break the bot.
• Use the bot for illegal activities.
• Send spam, scams, phishing links, malware, or malicious content.
• Use the bot to harass, threaten, or target other users.
• Bypass any cooldowns, restrictions, or moderation systems.

**4. Data Collection**
The bot may store Discord User IDs, Server IDs, Channel IDs, command usage data, and moderation logs. The bot does not collect passwords, payment information, or private Discord messages unless a feature specifically requires it.

**5. Availability**
The bot is provided "as is." Features may be modified, removed, or added at any time without notice.

**6. Termination**
We reserve the right to restrict access, remove users from bot services, or ban users who violate these terms.

**7. Limitation of Liability**
The bot owners are not responsible for data loss, server damage, or downtime.

**8. Changes to These Terms**
These Terms may be updated at any time. Continued use constitutes acceptance of the updated terms.

**9. Contact**
For questions, contact the Advertisement Hub staff team through the server's support channels.

*By using Advertisement Hub, you acknowledge that you have read and agreed to these Terms of Service.*`;

// ── Dev Guard ─────────────────────────────────────────────────────────────────
// setDefaultMemberPermissions(0) on all dev commands already shows Discord's
// native "NO PERMISSIONS" lock screen to anyone outside the dev server.
// This is the server-side safety net on top of that.

async function devGuard(interaction) {
  if (interaction.guildId !== DEV_GUILD_ID) {
    await interaction.reply({
      content: '🔒 This command can only be used in the developer server.',
      flags: 64,
    });
    return false;
  }
  return true;
}

// ── CPU Sample ────────────────────────────────────────────────────────────────

async function getCpuPercent() {
  const before = process.cpuUsage();
  await new Promise(r => setTimeout(r, 150));
  const after = process.cpuUsage(before);
  const usedMs = (after.user + after.system) / 1000;
  return ((usedMs / 150) * 100).toFixed(1);
}

// ── Command Definitions ───────────────────────────────────────────────────────

export const defs = [
  // ── Existing ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('unblock-all')
    .setDescription('[Bot Dev only] Unblock everyone from the portal and DM them the ToS'),

  // ── New Dev Commands (all locked behind setDefaultMemberPermissions(0)) ──────
  new SlashCommandBuilder()
    .setName('dev-status')
    .setDescription('[Dev] Show bot uptime, ping, RAM, CPU, guild & user count')
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-logs')
    .setDescription('[Dev] Show recent log entries from the in-memory log buffer')
    .addIntegerOption(o =>
      o.setName('count')
        .setDescription('Number of entries to show (1–50, default 20)')
        .setMinValue(1)
        .setMaxValue(50))
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-reload')
    .setDescription('[Dev] Re-register slash commands and re-run dev server setup')
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('setup-dev')
    .setDescription('[Dev] Re-run developer server setup — recreate missing channels/categories')
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-guilds')
    .setDescription('[Dev] List all guilds the bot is in')
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-guild-info')
    .setDescription('[Dev] Show detailed info for a specific guild')
    .addStringOption(o =>
      o.setName('guild_id')
        .setDescription('The guild ID to look up')
        .setRequired(true))
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-shutdown')
    .setDescription('[Dev] Safely shut down the bot after logging a shutdown message')
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('dev-debug')
    .setDescription('[Dev] Toggle verbose debug logging on or off')
    .addStringOption(o =>
      o.setName('mode')
        .setDescription('Turn debug logging on or off')
        .setRequired(true)
        .addChoices(
          { name: '✅ On',  value: 'on'  },
          { name: '❌ Off', value: 'off' },
        ))
    .setDefaultMemberPermissions(0),
];

// ── Existing Handler ──────────────────────────────────────────────────────────

export async function handleUnblockAll(interaction) {
  if (interaction.user.id !== BOT_DEV_ID) {
    return interaction.reply({ content: '❌ Only the bot developer can use this command.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const userBlacklist = db.getBlacklist();
  const ipBlacklist   = db.getIpBlacklist();

  if (userBlacklist.length === 0 && ipBlacklist.length === 0) {
    return interaction.editReply({ content: '✅ No one is currently blacklisted (users or IPs).' });
  }

  let pendingTos  = 0;
  let unbannedIps = 0;
  let dmSent      = 0;
  let dmFailed    = 0;

  for (const entry of userBlacklist) {
    try {
      db.deleteBlacklistByUserId(entry.userId);
      db.addPendingTos(entry.userId, entry.username);
      pendingTos++;
    } catch {}

    try {
      const tosEmbed = new EmbedBuilder()
        .setTitle('📋 Advertisement Hub — Terms of Service')
        .setDescription(
          TOS_MESSAGE +
          '\n\n**Click ✅ I Agree below to accept these terms and regain access to the Staff Portal.**'
        )
        .setColor(0xf59e0b)
        .setTimestamp()
        .setFooter({ text: 'Staff Portal · You must accept to continue' });

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = (await import('discord.js'));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tos_agree_${entry.userId}`)
          .setLabel('✅ I Agree')
          .setStyle(ButtonStyle.Success),
      );

      const ok = await sendDM(entry.userId, { embeds: [tosEmbed.toJSON()], components: [row.toJSON()] });
      if (ok) dmSent++; else dmFailed++;
    } catch {
      dmFailed++;
    }
  }

  for (const entry of ipBlacklist) {
    try {
      db.removeIpBlacklist(entry.id);
      unbannedIps++;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Unblock All Initiated')
    .setColor(0x22c55e)
    .setDescription('Users have been sent the ToS and must click **✅ I Agree** before they can log in.')
    .addFields(
      { name: '⏳ Awaiting ToS',  value: String(pendingTos),  inline: true },
      { name: '🌐 IPs Unbanned',  value: String(unbannedIps), inline: true },
      { name: '📬 DMs Sent',      value: String(dmSent),      inline: true },
      { name: '⚠️ DMs Failed',   value: String(dmFailed),    inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Dev Tools' });

  return interaction.editReply({ embeds: [embed] });
}

// ── New Dev Handlers ──────────────────────────────────────────────────────────

export async function handleDevStatus(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const uptime  = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const mem    = process.memoryUsage();
    const cpu    = await getCpuPercent();

    let totalUsers = 0;
    for (const g of client.guilds.cache.values()) totalUsers += g.memberCount;

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Status')
      .setColor(0x5865F2)
      .addFields(
        { name: '⏱️ Uptime',    value: `${h}h ${m}m ${s}s`,                          inline: true },
        { name: '🏓 Ping',      value: `${client.ws.ping}ms`,                          inline: true },
        { name: '🏠 Guilds',    value: String(client.guilds.cache.size),               inline: true },
        { name: '👥 Users',     value: String(totalUsers),                             inline: true },
        { name: '💾 RSS',       value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,    inline: true },
        { name: '🧠 Heap Used', value: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
        { name: '⚙️ CPU',      value: `${cpu}%`,                                      inline: true },
        { name: '🐛 Debug',     value: isDebugEnabled() ? '✅ On' : '❌ Off',          inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-status', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevLogs(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const count   = interaction.options.getInteger('count') ?? 20;
    const entries = getRecentLogs(count);

    if (entries.length === 0) {
      return interaction.reply({ content: '📭 No log entries yet.', flags: 64 });
    }

    const LEVEL_ICONS = { error: '🔴', warn: '🟡', info: '🟢' };
    const lines = entries.map(e => {
      const time = `<t:${Math.floor(e.ts / 1000)}:T>`;
      const icon = LEVEL_ICONS[e.level] ?? '⚪';
      return `${icon} ${time} \`${e.message.slice(0, 80)}\``;
    });

    const embed = new EmbedBuilder()
      .setTitle(`📋 Recent Logs (last ${entries.length})`)
      .setColor(0x5865F2)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    logError('Dev Command: dev-logs', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}`, flags: 64 }).catch(() => {});
  }
}

export async function handleDevReload(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const TOKEN     = process.env.TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID;

    let cmdResult   = '⏭️ Skipped (TOKEN or CLIENT_ID not set)';
    let setupResult = '⏭️ Skipped';

    // Re-register slash commands
    if (TOKEN && CLIENT_ID) {
      try {
        const { REST, Routes } = await import('discord.js');
        const { commandDefs }  = await import('../commands/index.js');
        const { setupCommands } = await import('../setup.js');
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const all  = [...commandDefs, ...setupCommands].map(c => c.toJSON());
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: all });
        cmdResult = `✅ Re-registered **${all.length}** slash commands`;
      } catch (err) {
        cmdResult = `❌ ${err.message}`;
        logError('Dev Reload: command registration', err).catch(() => {});
      }
    }

    // Re-run dev server setup
    try {
      await setupDevServer(client);
      setupResult = '✅ Dev server channels verified/created';
    } catch (err) {
      setupResult = `❌ ${err.message}`;
      logError('Dev Reload: setup-dev', err).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setTitle('🔄 Reload Complete')
      .setColor(0x57F287)
      .addFields(
        { name: '📋 Slash Commands', value: cmdResult,   inline: false },
        { name: '🛠️ Dev Server',    value: setupResult, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-reload', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleSetupDev(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    await setupDevServer(client);

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Dev Server Setup Complete')
      .setColor(0x57F287)
      .setDescription('All missing categories and channels have been created. Existing ones were not duplicated.')
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: setup-dev', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevGuilds(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => b.memberCount - a.memberCount);

    if (guilds.length === 0) {
      return interaction.editReply({ content: '📭 Bot is not in any guilds.' });
    }

    const lines = guilds.map((g, i) =>
      `**${i + 1}.** ${g.name}\n\`${g.id}\` · ${g.memberCount} members`
    );

    const chunks = [];
    let current  = '';
    for (const line of lines) {
      if ((current + '\n\n' + line).length > 3800) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? current + '\n\n' + line : line;
      }
    }
    if (current) chunks.push(current);

    const embed = new EmbedBuilder()
      .setTitle(`🏠 Guilds (${guilds.length} total)`)
      .setColor(0x5865F2)
      .setDescription(chunks[0] ?? 'None')
      .setTimestamp()
      .setFooter({ text: chunks.length > 1 ? `Page 1/${chunks.length} — use /dev-guild-info for details` : 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-guilds', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevGuildInfo(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.options.getString('guild_id');
    let guild     = client.guilds.cache.get(guildId);
    if (!guild) {
      guild = await client.guilds.fetch(guildId).catch(() => null);
    }

    if (!guild) {
      return interaction.editReply({ content: `❌ Guild \`${guildId}\` not found or bot is not in it.` });
    }

    const owner = await client.users.fetch(guild.ownerId).catch(() => null);
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`🏠 ${guild.name}`)
      .setColor(0x5865F2)
      .setThumbnail(guild.iconURL({ size: 256, extension: 'png' }) ?? null)
      .addFields(
        { name: '🆔 Guild ID',   value: guild.id,                                     inline: true  },
        { name: '👑 Owner',      value: owner ? `${owner.tag}\n\`${owner.id}\`` : guild.ownerId, inline: true },
        { name: '👥 Members',    value: String(guild.memberCount),                    inline: true  },
        { name: '📅 Created',    value: `<t:${createdAt}:D>`,                         inline: true  },
        { name: '💬 Channels',   value: String(guild.channels.cache.size),            inline: true  },
        { name: '😀 Emojis',     value: String(guild.emojis.cache.size),              inline: true  },
        { name: '🌍 Region',     value: guild.preferredLocale ?? 'Unknown',           inline: true  },
        { name: '🔒 Verification', value: ['None','Low','Medium','High','Very High'][guild.verificationLevel] ?? 'Unknown', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-guild-info', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevShutdown(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const embed = new EmbedBuilder()
      .setTitle('🔴 Shutting Down')
      .setColor(0xED4245)
      .setDescription(`Shutdown initiated by **${interaction.user.tag}**.`)
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.reply({ embeds: [embed], flags: 64 });

    // Import logShutdown here to avoid circular dep at module load time
    const { logShutdown } = await import('../devLogger.js');
    await logShutdown(`Shutdown triggered by ${interaction.user.tag} via /dev-shutdown`).catch(() => {});

    setTimeout(() => process.exit(0), 1500);
  } catch (err) {
    logError('Dev Command: dev-shutdown', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}`, flags: 64 }).catch(() => {});
  }
}

export async function handleDevDebug(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const mode = interaction.options.getString('mode');
    setDebug(mode === 'on');

    const embed = new EmbedBuilder()
      .setTitle(`🐛 Debug Logging ${mode === 'on' ? 'Enabled' : 'Disabled'}`)
      .setColor(mode === 'on' ? 0x57F287 : 0xED4245)
      .setDescription(`Verbose debug logging has been turned **${mode}** by ${interaction.user.tag}.`)
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Tools' });

    logCommand(interaction).catch(() => {});
    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    logError('Dev Command: dev-debug', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}`, flags: 64 }).catch(() => {});
  }
}
