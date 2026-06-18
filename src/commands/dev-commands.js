/**
 * dev-commands.js
 * Developer-server-only slash commands, protected by a user whitelist.
 * The bot owner (BOT_DEV_ID) is always allowed regardless of the whitelist.
 * All other users must be added via /whitelist add before they can run any
 * dev command — non-whitelisted users receive an ephemeral "not whitelisted"
 * response and the interaction goes no further.
 */

import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder } = pkg;

import { readFileSync, writeFileSync, existsSync } from 'fs';
import client from '../../botClient.js';
import {
  setupDevServer, logCommand, logError, logShutdown,
  getRecentLogs, setDebug, isDebugEnabled,
} from '../devLogger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BOT_DEV_ID = process.env.OWNER_ID || '1453592157607825595';
const WHITELIST_FILE = './dev-whitelist.json';

// ── Whitelist Helpers ─────────────────────────────────────────────────────────

function loadWhitelist() {
  try {
    if (!existsSync(WHITELIST_FILE)) return [];
    return JSON.parse(readFileSync(WHITELIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveWhitelist(list) {
  writeFileSync(WHITELIST_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function isWhitelisted(userId) {
  if (userId === BOT_DEV_ID) return true;
  return loadWhitelist().includes(userId);
}

// ── Dev Guard ─────────────────────────────────────────────────────────────────
// Checks that the user is the bot owner or on the whitelist.
// Commands can be used in any server or DM.

async function devGuard(interaction) {
  if (!isWhitelisted(interaction.user.id)) {
    const embed = new EmbedBuilder()
      .setTitle('🔒 Not Whitelisted')
      .setColor(0xED4245)
      .setDescription(
        `You are not whitelisted to use developer commands.\n\n` +
        `Ask the bot owner to run \`/whitelist add\` to grant you access.`
      )
      .setFooter({ text: 'Staff Portal · Dev Commands' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
    return false;
  }

  return true;
}

// ── CPU Sample ────────────────────────────────────────────────────────────────

async function getCpuPercent() {
  const before = process.cpuUsage();
  await new Promise(r => setTimeout(r, 150));
  const after  = process.cpuUsage(before);
  const usedMs = (after.user + after.system) / 1000;
  return ((usedMs / 150) * 100).toFixed(1);
}

// ── Command Definitions ───────────────────────────────────────────────────────

export const defs = [
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('[Dev] Manage the developer command whitelist')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the whitelist')
        .addUserOption(o =>
          o.setName('user').setDescription('The user to whitelist').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(o =>
          o.setName('user').setDescription('The user to remove').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all whitelisted users')),

  new SlashCommandBuilder()
    .setName('dev-status')
    .setDescription('[Dev] Show bot uptime, ping, RAM, CPU, guild & user count'),

  new SlashCommandBuilder()
    .setName('dev-logs')
    .setDescription('[Dev] Show recent log entries from the in-memory log buffer')
    .addIntegerOption(o =>
      o.setName('count')
        .setDescription('Number of entries to show (1–50, default 20)')
        .setMinValue(1)
        .setMaxValue(50)),

  new SlashCommandBuilder()
    .setName('dev-reload')
    .setDescription('[Dev] Re-register slash commands and re-run dev server setup'),

  new SlashCommandBuilder()
    .setName('setup-dev')
    .setDescription('[Dev] Re-run developer server setup — recreate missing channels/categories'),

  new SlashCommandBuilder()
    .setName('dev-guilds')
    .setDescription('[Dev] List all guilds the bot is in'),

  new SlashCommandBuilder()
    .setName('dev-guild-info')
    .setDescription('[Dev] Show detailed info for a specific guild')
    .addStringOption(o =>
      o.setName('guild_id')
        .setDescription('The guild ID to look up')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('dev-shutdown')
    .setDescription('[Dev] Safely shut down the bot after logging a shutdown message'),

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
        )),
];

// ── /whitelist Handler ────────────────────────────────────────────────────────

export async function handleWhitelist(interaction) {
  try {
    const sub = interaction.options.getSubcommand();

    // list — available to all whitelisted users (and owner)
    if (sub === 'list') {
      if (!isWhitelisted(interaction.user.id)) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle('🔒 Not Whitelisted')
            .setColor(0xED4245)
            .setDescription('You are not whitelisted to use developer commands.')
            .setFooter({ text: 'Staff Portal · Dev Commands' })
            .setTimestamp()],
          flags: 64,
        });
      }

      const list = loadWhitelist();
      const lines = list.length === 0
        ? ['*(no users whitelisted — only the bot owner has access)*']
        : list.map(id => `<@${id}> \`${id}\``);

      const embed = new EmbedBuilder()
        .setTitle('📋 Dev Command Whitelist')
        .setColor(0x5865F2)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${list.length} user(s) — bot owner always has access` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // add / remove — bot owner only
    if (interaction.user.id !== BOT_DEV_ID) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🔒 Owner Only')
          .setColor(0xED4245)
          .setDescription('Only the bot owner can add or remove users from the whitelist.')
          .setFooter({ text: 'Staff Portal · Dev Commands' })
          .setTimestamp()],
        flags: 64,
      });
    }

    const target = interaction.options.getUser('user');
    let list = loadWhitelist();

    if (sub === 'add') {
      if (target.id === BOT_DEV_ID) {
        return interaction.reply({ content: '⚠️ The bot owner is always whitelisted — no need to add them.', flags: 64 });
      }
      if (list.includes(target.id)) {
        return interaction.reply({ content: `⚠️ ${target.tag} is already on the whitelist.`, flags: 64 });
      }
      list.push(target.id);
      saveWhitelist(list);

      const embed = new EmbedBuilder()
        .setTitle('✅ User Whitelisted')
        .setColor(0x57F287)
        .setDescription(`${target} (\`${target.id}\`) can now use developer commands.`)
        .setFooter({ text: `Whitelist size: ${list.length}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'remove') {
      if (!list.includes(target.id)) {
        return interaction.reply({ content: `⚠️ ${target.tag} is not on the whitelist.`, flags: 64 });
      }
      list = list.filter(id => id !== target.id);
      saveWhitelist(list);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ User Removed')
        .setColor(0xED4245)
        .setDescription(`${target} (\`${target.id}\`) has been removed from the developer whitelist.`)
        .setFooter({ text: `Whitelist size: ${list.length}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  } catch (err) {
    logError('Dev Command: whitelist', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}`, flags: 64 }).catch(() => {});
  }
}

// ── Dev Command Handlers ──────────────────────────────────────────────────────

export async function handleDevStatus(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const mem = process.memoryUsage();
    const cpu = await getCpuPercent();

    let totalUsers = 0;
    for (const g of client.guilds.cache.values()) totalUsers += g.memberCount;

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Status')
      .setColor(0x5865F2)
      .addFields(
        { name: '⏱️ Uptime',    value: `${h}h ${m}m ${s}s`,                            inline: true },
        { name: '🏓 Ping',      value: `${client.ws.ping}ms`,                            inline: true },
        { name: '🏠 Guilds',    value: String(client.guilds.cache.size),                 inline: true },
        { name: '👥 Users',     value: String(totalUsers),                               inline: true },
        { name: '💾 RSS',       value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,      inline: true },
        { name: '🧠 Heap Used', value: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
        { name: '⚙️ CPU',      value: `${cpu}%`,                                        inline: true },
        { name: '🐛 Debug',     value: isDebugEnabled() ? '✅ On' : '❌ Off',            inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

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

    const ICONS = { error: '🔴', warn: '🟡', info: '🟢' };
    const lines = entries.map(e => {
      const time = `<t:${Math.floor(e.ts / 1000)}:T>`;
      const icon = ICONS[e.level] ?? '⚪';
      return `${icon} ${time} \`${e.message.slice(0, 80)}\``;
    });

    const embed = new EmbedBuilder()
      .setTitle(`📋 Recent Logs (last ${entries.length})`)
      .setColor(0x5865F2)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

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

    if (TOKEN && CLIENT_ID) {
      try {
        const { REST, Routes } = await import('discord.js');
        const { commandDefs }  = await import('./index.js');
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
      .setFooter({ text: 'Staff Portal · Dev Commands' });

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
      .setFooter({ text: 'Staff Portal · Dev Commands' });

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
      if ((current + '\n\n' + line).length > 3800) { chunks.push(current); current = line; }
      else { current = current ? current + '\n\n' + line : line; }
    }
    if (current) chunks.push(current);

    const embed = new EmbedBuilder()
      .setTitle(`🏠 Guilds (${guilds.length} total)`)
      .setColor(0x5865F2)
      .setDescription(chunks[0] ?? 'None')
      .setTimestamp()
      .setFooter({ text: chunks.length > 1 ? `Page 1/${chunks.length} — use /dev-guild-info for details` : 'Staff Portal · Dev Commands' });

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
    let guild     = client.guilds.cache.get(guildId)
                 ?? await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return interaction.editReply({ content: `❌ Guild \`${guildId}\` not found or bot is not in it.` });
    }

    const owner     = await client.users.fetch(guild.ownerId).catch(() => null);
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`🏠 ${guild.name}`)
      .setColor(0x5865F2)
      .setThumbnail(guild.iconURL({ size: 256, extension: 'png' }) ?? null)
      .addFields(
        { name: '🆔 Guild ID',     value: guild.id,                                                          inline: true },
        { name: '👑 Owner',        value: owner ? `${owner.tag}\n\`${owner.id}\`` : guild.ownerId,           inline: true },
        { name: '👥 Members',      value: String(guild.memberCount),                                         inline: true },
        { name: '📅 Created',      value: `<t:${createdAt}:D>`,                                              inline: true },
        { name: '💬 Channels',     value: String(guild.channels.cache.size),                                 inline: true },
        { name: '😀 Emojis',       value: String(guild.emojis.cache.size),                                   inline: true },
        { name: '🌍 Locale',       value: guild.preferredLocale ?? 'Unknown',                                inline: true },
        { name: '🔒 Verification', value: ['None','Low','Medium','High','Very High'][guild.verificationLevel] ?? 'Unknown', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

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
      .setFooter({ text: 'Staff Portal · Dev Commands' });

    logCommand(interaction).catch(() => {});
    await interaction.reply({ embeds: [embed], flags: 64 });
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
      .setDescription(`Verbose debug logging turned **${mode}** by ${interaction.user.tag}.`)
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

    logCommand(interaction).catch(() => {});
    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    logError('Dev Command: dev-debug', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}`, flags: 64 }).catch(() => {});
  }
}
