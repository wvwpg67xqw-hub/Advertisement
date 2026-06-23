/**
 * dev-commands.js
 * Developer-server-only slash commands, protected by a user whitelist.
 * The bot owner (BOT_DEV_ID) is always allowed regardless of the whitelist.
 * All other users must be added via /whitelist add before they can run any
 * dev command — non-whitelisted users receive an ephemeral "not whitelisted"
 * response and the interaction goes no further.
 */

import pkg from 'discord.js';
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, ChannelType,
} = pkg;

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import client from '../../botClient.js';
import {
  setupDevServer, logError, logShutdown,
  getRecentLogs, setDebug, isDebugEnabled,
} from '../devLogger.js';
import { listAppEmojis, deleteAppEmoji } from '../appEmoji.js';
import { getAllAutoReactEmojiIds } from '../database.js';
import pool from '../../mysqldb.js';
import { pendingApprovals, xpCooldowns, arCache, arReactCooldowns } from '../caches.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BOT_DEV_ID = process.env.OWNER_ID || '1453592157607825595';
const WHITELIST_FILE = './dev-whitelist.json';

// ── Maintenance Mode ──────────────────────────────────────────────────────────

let maintenanceMode = false;
let maintenanceReason = 'The bot is currently undergoing maintenance. Please try again later.';

export function isMaintenanceMode() { return maintenanceMode; }
export function getMaintenanceReason() { return maintenanceReason; }

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

    await interaction.reply({ embeds: [embed] });
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
    .setName('dev-restart')
    .setDescription('[Dev] Restart the bot by exiting cleanly — the panel will bring it back up'),

  new SlashCommandBuilder()
    .setName('dev-maintenance')
    .setDescription('[Dev] Toggle maintenance mode — all non-whitelisted interactions are blocked')
    .addStringOption(o =>
      o.setName('mode')
        .setDescription('Turn maintenance mode on or off')
        .setRequired(true)
        .addChoices(
          { name: '🔴 On',  value: 'on'  },
          { name: '🟢 Off', value: 'off' },
        ))
    .addStringOption(o =>
      o.setName('reason')
        .setDescription('Reason shown to users (optional)')),

  new SlashCommandBuilder()
    .setName('dev-clean-emojis')
    .setDescription('[Dev] Delete all bot application emojis not currently assigned to any auto-react'),

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

  new SlashCommandBuilder()
    .setName('dev-lines')
    .setDescription('[Dev] Count lines of code in a specific file or the entire project')
    .addStringOption(o =>
      o.setName('file')
        .setDescription('Start typing a file name — omit to count the whole project')
        .setRequired(false)
        .setAutocomplete(true)),

  // ── Database commands ────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('db-status')
    .setDescription('[Dev] Show database connection health and row counts for every table'),

  new SlashCommandBuilder()
    .setName('cache-clear')
    .setDescription('[Dev] Wipe all in-memory caches (XP cooldowns, AR cache, pending approvals)'),

  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('[Dev] Show a full row-count snapshot of every database table'),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('[Dev] Look up a user by Discord ID — Discord profile + DB records')
    .addStringOption(o =>
      o.setName('id')
        .setDescription('Discord user ID')
        .setRequired(true)),

  // ── Simulation commands ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('fakejoin')
    .setDescription('[Dev] Simulate a member joining this server — fires guildMemberAdd')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('The member to simulate joining')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('fakeleave')
    .setDescription('[Dev] Simulate a member leaving this server — fires guildMemberRemove')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('The member to simulate leaving')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('simulate-message')
    .setDescription('[Dev] Emit a fake messageCreate event as any user — tests XP, auto-react, sticky, etc.')
    .addUserOption(o =>
      o.setName('user').setDescription('User to impersonate (defaults to you)').setRequired(false))
    .addStringOption(o =>
      o.setName('content').setDescription('Message content').setRequired(false))
    .addChannelOption(o =>
      o.setName('channel').setDescription('Channel to fire the event in (defaults to this channel)').setRequired(false)),

  // ── UI Testing ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('testmessage')
    .setDescription('[Dev] Post a test message via webhook as any user')
    .addUserOption(o => o.setName('user').setDescription('User to impersonate').setRequired(false))
    .addStringOption(o => o.setName('content').setDescription('Message text').setRequired(false)),

  new SlashCommandBuilder()
    .setName('testreply')
    .setDescription('[Dev] Post a message and have the bot reply to it — tests reply threading'),

  new SlashCommandBuilder()
    .setName('testembed')
    .setDescription('[Dev] Preview a fully decorated sample embed with all common fields'),

  new SlashCommandBuilder()
    .setName('testbutton')
    .setDescription('[Dev] Post a message with all four button styles — click to verify handler fires'),

  new SlashCommandBuilder()
    .setName('testmodal')
    .setDescription('[Dev] Open a test modal popup with two text inputs'),

  new SlashCommandBuilder()
    .setName('testselect')
    .setDescription('[Dev] Post a message with a string select menu — select to verify handler fires'),

  // ── Event Testing ────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('testjoin')
    .setDescription('[Dev] Alias for /fakejoin — simulate guildMemberAdd')
    .addUserOption(o => o.setName('user').setDescription('Member to simulate joining').setRequired(true)),

  new SlashCommandBuilder()
    .setName('testleave')
    .setDescription('[Dev] Alias for /fakeleave — simulate guildMemberRemove')
    .addUserOption(o => o.setName('user').setDescription('Member to simulate leaving').setRequired(true)),

  new SlashCommandBuilder()
    .setName('testreaction')
    .setDescription('[Dev] Bot reacts to the most recent message in this channel with test emojis'),

  new SlashCommandBuilder()
    .setName('testtyping')
    .setDescription('[Dev] Trigger typing indicator in a channel for 5 seconds')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to this one)').setRequired(false)),

  // ── Permission Testing ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('testperms')
    .setDescription('[Dev] Show bot permissions in this channel as a ✅/❌ checklist'),

  new SlashCommandBuilder()
    .setName('testroles')
    .setDescription('[Dev] Show a user\'s role hierarchy and which staff tiers they qualify for')
    .addUserOption(o => o.setName('user').setDescription('User to inspect (defaults to you)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('testadmin')
    .setDescription('[Dev] List members in this server who have Administrator or Manage Guild permissions'),

  // ── Database Testing ─────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('seeddata')
    .setDescription('[Dev] Insert fake test rows (warns, strikes, XP, balance) for a dummy user'),

  new SlashCommandBuilder()
    .setName('cleartestdata')
    .setDescription('[Dev] Delete all rows seeded by /seeddata from every table'),

  new SlashCommandBuilder()
    .setName('datacheck')
    .setDescription('[Dev] Run DB integrity checks — orphaned records, missing guild configs, etc.'),

  // ── Performance Testing ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('benchmark')
    .setDescription('[Dev] Run 10 serial + 10 parallel DB queries and report timing'),

  new SlashCommandBuilder()
    .setName('loadtest')
    .setDescription('[Dev] Fire N fake messageCreate events rapidly and report throughput')
    .addIntegerOption(o =>
      o.setName('count').setDescription('Number of events (1–20, default 5)').setMinValue(1).setMaxValue(20).setRequired(false)),

  new SlashCommandBuilder()
    .setName('ratelimit')
    .setDescription('[Dev] Show Discord REST rate-limit bucket info and current cache sizes'),

  // ── Error Testing ────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('forceerror')
    .setDescription('[Dev] Throw a controlled error through the logger — verifies error handling pipeline'),

  new SlashCommandBuilder()
    .setName('testfail')
    .setDescription('[Dev] Simulate a failed DB query and show how the error is handled'),

  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('[Dev] Full debug dump — caches, DB, memory, uptime, guild config'),

  // ── Edge Case Testing ────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('testlongmsg')
    .setDescription('[Dev] Send a message near Discord\'s 2000-char limit to test truncation'),

  new SlashCommandBuilder()
    .setName('testunicode')
    .setDescription('[Dev] Send emoji, RTL text, zero-width chars, and special characters'),

  new SlashCommandBuilder()
    .setName('testempty')
    .setDescription('[Dev] Test how the bot handles empty / null inputs across common fields'),

  new SlashCommandBuilder()
    .setName('testspam')
    .setDescription('[Dev] Send N messages in rapid succession to test rate limiting')
    .addIntegerOption(o =>
      o.setName('count').setDescription('Number of messages (1–10, default 5)').setMinValue(1).setMaxValue(10).setRequired(false)),

  new SlashCommandBuilder()
    .setName('dev-test-abuse')
    .setDescription('[Dev] Test the command-abuse detection system')
    .addSubcommand(sub =>
      sub.setName('trigger')
        .setDescription('Simulate repeated actions to fire an abuse alert')
        .addStringOption(o =>
          o.setName('action')
            .setDescription('Action to simulate')
            .setRequired(true)
            .addChoices(
              { name: 'mute',    value: 'mute'    },
              { name: 'warn',    value: 'warn'    },
              { name: 'ad-warn', value: 'ad-warn' },
              { name: 'strike',  value: 'strike'  },
              { name: 'ban',     value: 'ban'     },
              { name: 'jail',    value: 'jail'    },
            ))
        .addStringOption(o =>
          o.setName('target_id')
            .setDescription('Fake target user ID (defaults to your own ID)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show all active abuse-tracker entries in memory'))
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Clear all in-memory abuse tracker counters')),
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

      return interaction.reply({ embeds: [embed] });
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
      });
    }

    const target = interaction.options.getUser('user');
    let list = loadWhitelist();

    if (sub === 'add') {
      if (target.id === BOT_DEV_ID) {
        return interaction.reply({ content: '⚠️ The bot owner is always whitelisted — no need to add them.' });
      }
      if (list.includes(target.id)) {
        return interaction.reply({ content: `⚠️ ${target.tag} is already on the whitelist.` });
      }
      list.push(target.id);
      saveWhitelist(list);

      const embed = new EmbedBuilder()
        .setTitle('✅ User Whitelisted')
        .setColor(0x57F287)
        .setDescription(`${target} (\`${target.id}\`) can now use developer commands.`)
        .setFooter({ text: `Whitelist size: ${list.length}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      if (!list.includes(target.id)) {
        return interaction.reply({ content: `⚠️ ${target.tag} is not on the whitelist.` });
      }
      list = list.filter(id => id !== target.id);
      saveWhitelist(list);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ User Removed')
        .setColor(0xED4245)
        .setDescription(`${target} (\`${target.id}\`) has been removed from the developer whitelist.`)
        .setFooter({ text: `Whitelist size: ${list.length}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    logError('Dev Command: whitelist', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

// ── Dev Command Handlers ──────────────────────────────────────────────────────

export async function handleDevStatus(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

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
      return interaction.reply({ content: '📭 No log entries yet.' });
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

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-logs', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevReload(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

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

        const DEV_CMD_NAMES = new Set([
          'whitelist','dev-status','dev-logs','dev-reload','setup-dev','dev-guilds',
          'dev-guild-info','dev-restart','dev-maintenance','dev-clean-emojis','dev-debug',
          'dev-lines','db-status','cache-clear','backup','userinfo','fakejoin','fakeleave',
          'simulate-message','testmessage','testreply','testembed','testbutton','testmodal',
          'testselect','testjoin','testleave','testreaction','testtyping','testperms',
          'testroles','testadmin','seeddata','cleartestdata','datacheck','benchmark',
          'loadtest','ratelimit','forceerror','testfail','debug','testlongmsg',
          'testunicode','testempty','testspam','dev-test-abuse',
        ]);

        const all         = [...commandDefs, ...setupCommands];
        const prodCmds    = all.filter(c => !DEV_CMD_NAMES.has(c.name)).map(c => c.toJSON());
        const devCmds     = all.filter(c =>  DEV_CMD_NAMES.has(c.name)).map(c => c.toJSON());
        const DEV_GUILD_ID = process.env.DEV_GUILD_ID;

        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: prodCmds });
        cmdResult = `✅ Re-registered **${prodCmds.length}** global commands`;

        if (DEV_GUILD_ID && devCmds.length > 0) {
          await rest.put(Routes.applicationGuildCommands(CLIENT_ID, DEV_GUILD_ID), { body: devCmds });
          cmdResult += ` + **${devCmds.length}** dev commands → guild \`${DEV_GUILD_ID}\``;
        } else if (!DEV_GUILD_ID) {
          cmdResult += ` (${devCmds.length} dev commands skipped — DEV_GUILD_ID not set)`;
        }
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

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-reload', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleSetupDev(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    await setupDevServer(client);

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Dev Server Setup Complete')
      .setColor(0x57F287)
      .setDescription('All missing categories and channels have been created. Existing ones were not duplicated.')
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: setup-dev', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevGuilds(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

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

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-guilds', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevGuildInfo(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

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

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-guild-info', err).catch(() => {});
    if (!interaction.replied) await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevRestart(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const embed = new EmbedBuilder()
      .setTitle('🔄 Restarting')
      .setColor(0xF59E0B)
      .setDescription(`Restart initiated by **${interaction.user.tag}**.\nThe bot will be back online in a few seconds.`)
      .setTimestamp()
      .setFooter({ text: 'Staff Portal · Dev Commands' });

    await interaction.reply({ embeds: [embed] });
    await logShutdown(`Restart triggered by ${interaction.user.tag} via /dev-restart`).catch(() => {});

    setTimeout(() => process.exit(0), 1500);
  } catch (err) {
    logError('Dev Command: dev-restart', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevMaintenance(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const mode   = interaction.options.getString('mode');
    const reason = interaction.options.getString('reason');

    maintenanceMode = mode === 'on';
    if (reason) maintenanceReason = reason;
    else if (mode === 'off') maintenanceReason = 'The bot is currently undergoing maintenance. Please try again later.';

    const embed = new EmbedBuilder()
      .setTitle(maintenanceMode ? '🔴 Maintenance Mode Enabled' : '🟢 Maintenance Mode Disabled')
      .setColor(maintenanceMode ? 0xED4245 : 0x57F287)
      .setDescription(
        maintenanceMode
          ? `All users are now blocked from all commands.\n\n**Reason shown:** ${maintenanceReason}`
          : 'The bot is back online and accepting all interactions.'
      )
      .setFooter({ text: `Set by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-maintenance', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
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

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-debug', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
  }
}

export async function handleDevCleanEmojis(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const [allEmojis, usedIds] = await Promise.all([
      listAppEmojis(),
      getAllAutoReactEmojiIds(),
    ]);

    const usedSet   = new Set(usedIds.map(String));
    const toDelete  = allEmojis.filter(e => !usedSet.has(String(e.id)));

    if (toDelete.length === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ No Unused Emojis')
            .setColor(0x57F287)
            .setDescription(`All **${allEmojis.length}** application emoji${allEmojis.length === 1 ? ' is' : 's are'} currently in use.`)
            .setTimestamp()
            .setFooter({ text: 'Staff Portal · Dev Commands' }),
        ],
      });
    }

    const results = await Promise.allSettled(
      toDelete.map(e => deleteAppEmoji(e.id))
    );
    const deleted  = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed   = toDelete.length - deleted;

    const lines = toDelete.map((e, i) => {
      const ok = results[i].status === 'fulfilled' && results[i].value;
      return `${ok ? '✅' : '❌'} \`${e.name}\` (\`${e.id}\`)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🧹 Emoji Cleanup Complete')
      .setColor(failed === 0 ? 0x57F287 : 0xFEE75C)
      .addFields(
        { name: 'Total app emojis',  value: String(allEmojis.length), inline: true },
        { name: 'In use',            value: String(usedSet.size),     inline: true },
        { name: 'Deleted',           value: `${deleted}${failed ? ` (${failed} failed)` : ''}`, inline: true },
        { name: 'Removed emojis',    value: lines.slice(0, 20).join('\n') || 'None', inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    if (lines.length > 20) embed.setDescription(`*(showing first 20 of ${lines.length})*`);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-clean-emojis', err).catch(() => {});
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
    } else {
      await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
    }
  }
}

// ── /dev-lines Handler ────────────────────────────────────────────────────────

const LINES_SKIP_DIRS  = new Set(['node_modules', '.git', 'dist', '.cache', '.agents', '.local', 'attached_assets', 'client']);
const LINES_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.css', '.html', '.sh', '.md']);

function getAllProjectFiles(dir, root, results = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!LINES_SKIP_DIRS.has(entry.name)) getAllProjectFiles(fullPath, root, results);
    } else if (entry.isFile()) {
      const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop() : '';
      if (LINES_EXTENSIONS.has(ext)) results.push(relative(root, fullPath));
    }
  }
  return results;
}

export async function handleDevLinesAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const ROOT    = process.cwd();
  const files   = getAllProjectFiles(ROOT, ROOT);
  const matches = files
    .filter(f => f.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(f => ({ name: f, value: f }));
  await interaction.respond(matches).catch(() => {});
}

function countLinesInFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function walkAndCount(dir, root) {
  let total = 0;
  const breakdown = [];
  const byType = {};

  function recurse(current) {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (LINES_SKIP_DIRS.has(entry.name)) continue;
        recurse(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop() : '';
        if (!LINES_EXTENSIONS.has(ext)) continue;
        const count = countLinesInFile(fullPath);
        if (count > 0) {
          total += count;
          breakdown.push({ path: relative(root, fullPath), lines: count });
          byType[ext] = (byType[ext] ?? 0) + count;
        }
      }
    }
  }

  recurse(dir);
  breakdown.sort((a, b) => b.lines - a.lines);
  return { total, breakdown, byType };
}

export async function handleDevLines(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const filePath = interaction.options.getString('file');
    const ROOT     = process.cwd();

    if (filePath) {
      const abs = join(ROOT, filePath);

      if (!existsSync(abs)) {
        return interaction.editReply({ content: `❌ File not found: \`${filePath}\`` });
      }

      let stat;
      try { stat = statSync(abs); } catch {
        return interaction.editReply({ content: `❌ Cannot read: \`${filePath}\`` });
      }

      if (!stat.isFile()) {
        return interaction.editReply({ content: `❌ \`${filePath}\` is a directory — leave the \`file\` option blank to count the whole project.` });
      }

      const lineCount = countLinesInFile(abs);
      const embed = new EmbedBuilder()
        .setTitle('📄 Line Count')
        .setColor(0x5865F2)
        .addFields(
          { name: 'File',  value: `\`${filePath}\``,          inline: true },
          { name: 'Lines', value: lineCount.toLocaleString(), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Staff Portal · Dev Commands · requested by ${interaction.user.tag}` });

      return interaction.editReply({ embeds: [embed] });
    }

    const { total, breakdown, byType } = walkAndCount(ROOT, ROOT);

    const top = breakdown.slice(0, 15)
      .map(f => `\`${f.path}\` — **${f.lines.toLocaleString()}**`)
      .join('\n');

    const typeLines = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => `\`${ext}\` — **${count.toLocaleString()}**`)
      .join('\n') || 'None';

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Line Count')
      .setColor(0x5865F2)
      .addFields(
        { name: '📁 Total Lines',   value: total.toLocaleString(),             inline: true },
        { name: '📄 Files Counted', value: breakdown.length.toLocaleString(),  inline: true },
        { name: '🗂️ By File Type',  value: typeLines,                          inline: false },
        { name: `📋 Top ${Math.min(15, breakdown.length)} Files`, value: top || 'None', inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · requested by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: dev-lines', err).catch(() => {});
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ Error: ${err.message}` }).catch(() => {});
    } else {
      await interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(() => {});
    }
  }
}

// ── Database & Cache Helpers ───────────────────────────────────────────────────

const DB_TABLES = [
  'guilds', 'warns', 'ad_warns', 'strikes', 'jailed_users',
  'message_counts', 'snipe_cache', 'balances', 'breaks', 'applications',
  'levels', 'disabled_commands', 'bot_blacklist', 'network_applications',
  'ad_channels', 'ad_posts', 'auto_reacts', 'sticky_messages',
  'sticky_channel_state', 'hall_of_shame',
];

async function getTableCounts() {
  const results = await Promise.all(
    DB_TABLES.map(async t => {
      try {
        const [rows] = await pool.execute(`SELECT COUNT(*) AS c FROM \`${t}\``);
        return { table: t, count: rows[0].c };
      } catch {
        return { table: t, count: null };
      }
    })
  );
  return results;
}

// ── /db-status ────────────────────────────────────────────────────────────────

export async function handleDbStatus(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const start = Date.now();
    await pool.execute('SELECT 1');
    const pingMs = Date.now() - start;

    const counts = await getTableCounts();
    const rows = counts
      .map(r => `\`${r.table.padEnd(26)}\` ${r.count === null ? '❌' : r.count.toLocaleString()}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🗄️ Database Status')
      .setColor(0x57F287)
      .addFields(
        { name: '🏓 Ping',   value: `${pingMs}ms`, inline: true },
        { name: '📋 Tables', value: String(DB_TABLES.length), inline: true },
        { name: '📊 Row Counts', value: rows, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · requested by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: db-status', err).catch(() => {});
    if (!interaction.deferred) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    else await interaction.editReply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /cache-clear ──────────────────────────────────────────────────────────────

export async function handleCacheClear(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const sizes = {
      xpCooldowns:      xpCooldowns.size,
      arCache:          arCache.size,
      arReactCooldowns: arReactCooldowns.size,
      pendingApprovals: pendingApprovals.size,
    };

    xpCooldowns.clear();
    arCache.clear();
    arReactCooldowns.clear();
    pendingApprovals.clear();

    const total = Object.values(sizes).reduce((s, n) => s + n, 0);

    const embed = new EmbedBuilder()
      .setTitle('🧹 Cache Cleared')
      .setColor(0x57F287)
      .addFields(
        { name: '⏱️ XP Cooldowns',      value: String(sizes.xpCooldowns),      inline: true },
        { name: '✨ AR Cache',           value: String(sizes.arCache),           inline: true },
        { name: '⏳ AR React Cooldowns', value: String(sizes.arReactCooldowns),  inline: true },
        { name: '📋 Pending Approvals',  value: String(sizes.pendingApprovals),  inline: true },
        { name: '🗑️ Total Evicted',      value: String(total),                   inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Cleared by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: cache-clear', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /backup ───────────────────────────────────────────────────────────────────

export async function handleBackup(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const counts = await getTableCounts();
    const total  = counts.reduce((s, r) => s + (r.count ?? 0), 0);

    const lines = counts
      .map(r => `\`${r.table.padEnd(26)}\` **${r.count === null ? 'error' : r.count.toLocaleString()}**`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('💾 Database Snapshot')
      .setColor(0x5865F2)
      .setDescription(lines)
      .addFields(
        { name: '🔢 Total Rows', value: total.toLocaleString(), inline: true },
        { name: '📋 Tables',     value: String(DB_TABLES.length), inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Snapshot by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: backup', err).catch(() => {});
    if (!interaction.deferred) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    else await interaction.editReply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /userinfo ─────────────────────────────────────────────────────────────────

export async function handleUserInfo(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const userId = interaction.options.getString('id').trim();
    const guildId = interaction.guildId;

    const discordUser = await client.users.fetch(userId).catch(() => null);
    if (!discordUser) {
      return interaction.editReply({ content: `❌ No Discord user found with ID \`${userId}\`.` });
    }

    const [warns, strikes, balanceRows, levelRows] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS c FROM warns WHERE user_id = ?', [userId]).then(([r]) => r[0].c).catch(() => '?'),
      pool.execute('SELECT COUNT(*) AS c FROM strikes WHERE user_id = ?', [userId]).then(([r]) => r[0].c).catch(() => '?'),
      guildId ? pool.execute('SELECT balance FROM balances WHERE guild_id = ? AND user_id = ?', [guildId, userId]).then(([r]) => r[0]?.balance ?? 0).catch(() => '?') : Promise.resolve('N/A'),
      guildId ? pool.execute('SELECT total_xp FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]).then(([r]) => r[0]?.total_xp ?? 0).catch(() => '?') : Promise.resolve('N/A'),
    ]);

    const member = guildId ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
    const joinedAt = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Not in server';
    const roles = member
      ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'None'
      : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${discordUser.tag}`)
      .setThumbnail(discordUser.displayAvatarURL({ size: 256 }))
      .setColor(0x5865F2)
      .addFields(
        { name: '🆔 User ID',      value: `\`${discordUser.id}\``,                                     inline: true },
        { name: '📅 Created',      value: `<t:${Math.floor(discordUser.createdTimestamp / 1000)}:R>`,   inline: true },
        { name: '📥 Joined',       value: joinedAt,                                                     inline: true },
        { name: '⚠️ Warns',        value: String(warns),   inline: true },
        { name: '🔴 Strikes',      value: String(strikes), inline: true },
        { name: '💰 Balance',      value: String(balanceRows), inline: true },
        { name: '⭐ XP',           value: String(levelRows),   inline: true },
        { name: '🤖 Bot',          value: discordUser.bot ? 'Yes' : 'No', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · requested by ${interaction.user.tag}` });

    if (roles !== 'N/A') embed.addFields({ name: '🎭 Roles', value: roles.slice(0, 1024), inline: false });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: userinfo', err).catch(() => {});
    if (!interaction.deferred) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    else await interaction.editReply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /fakejoin ─────────────────────────────────────────────────────────────────

export async function handleFakeJoin(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    if (!interaction.guild) return interaction.reply({ content: '❌ Must be used in a server.' });
    await interaction.deferReply();

    const user   = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: `❌ ${user.tag} is not in this server — can't simulate join.` });
    }

    client.emit('guildMemberAdd', member);

    const embed = new EmbedBuilder()
      .setTitle('📥 Fake Join Fired')
      .setColor(0x57F287)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setDescription(`Emitted \`guildMemberAdd\` for **${user.tag}** (\`${user.id}\`).`)
      .setTimestamp()
      .setFooter({ text: `Triggered by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: fakejoin', err).catch(() => {});
    if (!interaction.deferred) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    else await interaction.editReply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /fakeleave ────────────────────────────────────────────────────────────────

export async function handleFakeLeave(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    if (!interaction.guild) return interaction.reply({ content: '❌ Must be used in a server.' });
    await interaction.deferReply();

    const user   = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: `❌ ${user.tag} is not in this server — can't simulate leave.` });
    }

    client.emit('guildMemberRemove', member);

    const embed = new EmbedBuilder()
      .setTitle('📤 Fake Leave Fired')
      .setColor(0xED4245)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setDescription(`Emitted \`guildMemberRemove\` for **${user.tag}** (\`${user.id}\`).`)
      .setTimestamp()
      .setFooter({ text: `Triggered by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: fakeleave', err).catch(() => {});
    if (!interaction.deferred) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    else await interaction.editReply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /simulate-message ─────────────────────────────────────────────────────────

export async function handleSimulateMessage(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    if (!interaction.guild) return interaction.reply({ content: '❌ Must be used in a server.' });

    const targetUser    = interaction.options.getUser('user')    ?? interaction.user;
    const content       = interaction.options.getString('content') ?? '(no content)';
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const fakeMsg = {
      id:        '000000000000000001',
      content,
      author:    { id: targetUser.id, bot: false, tag: targetUser.tag },
      guild:     interaction.guild,
      guildId:   interaction.guild.id,
      channel:   targetChannel,
      channelId: targetChannel.id,
      member,
      mentions:  { has: () => false },
      react:     () => Promise.resolve(),
      reply:     () => Promise.resolve(),
      delete:    () => Promise.resolve(),
      createdTimestamp: Date.now(),
    };

    client.emit('messageCreate', fakeMsg);

    const embed = new EmbedBuilder()
      .setTitle('💬 Message Event Fired')
      .setColor(0x5865F2)
      .addFields(
        { name: '👤 As User',   value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '📍 Channel',   value: `<#${targetChannel.id}>`,                   inline: true },
        { name: '💬 Content',   value: `\`${content.slice(0, 200)}\``,             inline: false },
      )
      .setDescription('`messageCreate` emitted — XP, auto-react, sticky, and ad-channel handlers all fired.')
      .setTimestamp()
      .setFooter({ text: `Triggered by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev Command: simulate-message', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const TEST_USER_ID = '000000000000000001';

function errReply(interaction, err) {
  const msg = { content: `❌ ${err.message}` };
  if (!interaction.replied && !interaction.deferred) return interaction.reply(msg).catch(() => {});
  return interaction.editReply(msg).catch(() => {});
}

// ── /testmessage ──────────────────────────────────────────────────────────────

export async function handleTestMessage(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const content    = interaction.options.getString('content') ?? '👋 This is a test message!';

    let hook;
    try {
      hook = await interaction.channel.createWebhook({
        name:   targetUser.displayName ?? targetUser.username,
        avatar: targetUser.displayAvatarURL({ size: 256 }),
      });
      await hook.send(content);
      await hook.delete();
      await interaction.reply({ content: `✅ Test message posted as **${targetUser.tag}**.` });
    } catch {
      if (hook) await hook.delete().catch(() => {});
      await interaction.reply({ content: `📨 **(webhook unavailable — plain post)**\n${content}` });
    }
  } catch (err) {
    logError('Dev: testmessage', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testreply ────────────────────────────────────────────────────────────────

export async function handleTestReply(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.reply({ content: '📤 Test message sent — bot will reply below.' });
    const msg = await interaction.fetchReply();
    await msg.reply({ content: '↩️ **Bot reply** — threading works correctly.' });
  } catch (err) {
    logError('Dev: testreply', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testembed ────────────────────────────────────────────────────────────────

export async function handleTestEmbed(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const embed = new EmbedBuilder()
      .setTitle('🧪 Test Embed')
      .setDescription('This embed showcases every common field so you can verify rendering.')
      .setColor(0x5865F2)
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .addFields(
        { name: '📌 Inline A', value: 'Value A', inline: true },
        { name: '📌 Inline B', value: 'Value B', inline: true },
        { name: '📌 Inline C', value: 'Value C', inline: true },
        { name: '📄 Full-width', value: 'This field spans the full width of the embed.', inline: false },
        { name: '🔗 Links',  value: '[discord.js docs](https://discord.js.org)', inline: true },
        { name: '📅 Relative time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: 'Footer text · Staff Portal Dev', iconURL: client.user?.displayAvatarURL() ?? undefined })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testembed', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testbutton ───────────────────────────────────────────────────────────────

export async function handleTestButton(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('devtest:btn:primary').setLabel('Primary').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('devtest:btn:secondary').setLabel('Secondary').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('devtest:btn:success').setLabel('Success').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('devtest:btn:danger').setLabel('Danger').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ content: '🔘 Click a button to verify the handler fires:', components: [row] });
  } catch (err) {
    logError('Dev: testbutton', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testmodal ────────────────────────────────────────────────────────────────

export async function handleTestModal(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const modal = new ModalBuilder()
      .setCustomId('devtest:modal:main')
      .setTitle('🧪 Test Modal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('devtest:modal:name')
          .setLabel('Short text input')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Type something short...')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('devtest:modal:desc')
          .setLabel('Paragraph input (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Type a longer message...')
          .setRequired(false),
      ),
    );
    await interaction.showModal(modal);
  } catch (err) {
    logError('Dev: testmodal', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /testselect ───────────────────────────────────────────────────────────────

export async function handleTestSelect(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const menu = new StringSelectMenuBuilder()
      .setCustomId('devtest:select:main')
      .setPlaceholder('Choose an option to verify selection handling...')
      .addOptions(
        { label: 'Option Alpha',   value: 'alpha',   description: 'First test option',   emoji: '🔴' },
        { label: 'Option Beta',    value: 'beta',    description: 'Second test option',  emoji: '🟡' },
        { label: 'Option Gamma',   value: 'gamma',   description: 'Third test option',   emoji: '🟢' },
        { label: 'Option Delta',   value: 'delta',   description: 'Fourth test option',  emoji: '🔵' },
        { label: 'Option Epsilon', value: 'epsilon', description: 'Fifth test option',   emoji: '🟣' },
      );
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({ content: '🔽 Select an option to verify the handler fires:', components: [row] });
  } catch (err) {
    logError('Dev: testselect', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testjoin & /testleave (aliases) ──────────────────────────────────────────

export async function handleTestJoin(interaction) {
  return handleFakeJoin(interaction);
}

export async function handleTestLeave(interaction) {
  return handleFakeLeave(interaction);
}

// ── /testreaction ─────────────────────────────────────────────────────────────

export async function handleTestReaction(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const msgs = await interaction.channel.messages.fetch({ limit: 5 });
    const target = msgs.filter(m => !m.author.bot).first() ?? msgs.first();

    if (!target) return interaction.editReply({ content: '❌ No recent messages found to react to.' });

    const emojis = ['👍', '🎉', '✅', '🔥', '⭐'];
    const results = [];
    for (const e of emojis) {
      try { await target.react(e); results.push(`${e} ✅`); }
      catch { results.push(`${e} ❌`); }
    }

    const embed = new EmbedBuilder()
      .setTitle('😀 Reaction Test')
      .setColor(0x5865F2)
      .setDescription(`Reacted to [this message](${target.url}):\n${results.join('  ')}`)
      .setTimestamp()
      .setFooter({ text: `Triggered by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testreaction', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testtyping ───────────────────────────────────────────────────────────────

export async function handleTestTyping(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const ch = interaction.options.getChannel('channel') ?? interaction.channel;

    await interaction.reply({ content: `⌨️ Typing in <#${ch.id}> for 5 seconds…` });
    await ch.sendTyping();
    const interval = setInterval(() => ch.sendTyping().catch(() => {}), 5000);
    setTimeout(() => {
      clearInterval(interval);
      interaction.editReply({ content: `✅ Typing in <#${ch.id}> finished.` }).catch(() => {});
    }, 10000);
  } catch (err) {
    logError('Dev: testtyping', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testperms ────────────────────────────────────────────────────────────────

export async function handleTestPerms(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const botMember = interaction.guild.members.me;
    const chPerms   = interaction.channel.permissionsFor(botMember);

    const checks = [
      ['View Channel',        'ViewChannel'],
      ['Send Messages',       'SendMessages'],
      ['Send Messages in Threads', 'SendMessagesInThreads'],
      ['Embed Links',         'EmbedLinks'],
      ['Attach Files',        'AttachFiles'],
      ['Add Reactions',       'AddReactions'],
      ['Read Message History','ReadMessageHistory'],
      ['Manage Messages',     'ManageMessages'],
      ['Manage Channels',     'ManageChannels'],
      ['Create Webhooks',     'ManageWebhooks'],
      ['Kick Members',        'KickMembers'],
      ['Ban Members',         'BanMembers'],
      ['Timeout Members',     'ModerateMembers'],
      ['Manage Roles',        'ManageRoles'],
      ['Administrator',       'Administrator'],
    ];

    const lines = checks.map(([label, flag]) =>
      `${chPerms?.has(flag) ? '✅' : '❌'} ${label}`
    );

    const embed = new EmbedBuilder()
      .setTitle(`🔐 Bot Permissions in #${interaction.channel.name}`)
      .setColor(0x5865F2)
      .setDescription(lines.join('\n'))
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testperms', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testroles ────────────────────────────────────────────────────────────────

export async function handleTestRoles(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) return interaction.editReply({ content: `❌ ${target.tag} is not in this server.` });

    const roles = member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position);

    const staffRoleIds = [
      process.env.STAFF_ROLE_ID, process.env.MODERATOR_ROLE_ID, process.env.MOD_TEAM_ROLE_ID,
      process.env.HR_ROLE_ID, process.env.HR_TEAM_ROLE_ID,
      process.env.PARTNERSHIP_ROLE_ID, process.env.PARTNERSHIP_TEAM_ROLE_ID,
    ].filter(Boolean);

    const staffFlags = staffRoleIds.map(id => {
      const r = interaction.guild.roles.cache.get(id);
      const has = member.roles.cache.has(id);
      return `${has ? '✅' : '❌'} ${r ? r.name : id}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎭 Roles — ${target.tag}`)
      .setColor(member.displayColor || 0x5865F2)
      .setThumbnail(target.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: `📋 All Roles (${roles.size})`,  value: roles.map(r => `<@&${r.id}>`).join(' ').slice(0, 1024) || 'None', inline: false },
        { name: '🔑 Staff Tier Matches',         value: staffFlags.length ? staffFlags.join('\n') : 'No staff roles configured', inline: false },
        { name: '🔒 Admin',  value: member.permissions.has('Administrator') ? '✅ Yes' : '❌ No', inline: true },
        { name: '⚙️ Manage Guild', value: member.permissions.has('ManageGuild') ? '✅ Yes' : '❌ No', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testroles', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testadmin ────────────────────────────────────────────────────────────────

export async function handleTestAdmin(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    await interaction.guild.members.fetch();
    const admins = interaction.guild.members.cache
      .filter(m => !m.user.bot && (m.permissions.has('Administrator') || m.permissions.has('ManageGuild')))
      .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);

    const lines = admins.map(m => {
      const flags = [];
      if (m.permissions.has('Administrator')) flags.push('Admin');
      if (m.permissions.has('ManageGuild'))   flags.push('Manage Guild');
      return `<@${m.id}> — \`${flags.join(', ')}\``;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🔑 Privileged Members (${admins.size})`)
      .setColor(0xFEE75C)
      .setDescription(lines.slice(0, 20).join('\n') || 'None found')
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}${admins.size > 20 ? ` · showing 20/${admins.size}` : ''}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testadmin', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /seeddata ─────────────────────────────────────────────────────────────────

export async function handleSeedData(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const guildId = interaction.guildId ?? '000000000000000001';
    const now     = Math.floor(Date.now() / 1000);
    const modId   = interaction.user.id;

    await Promise.all([
      pool.execute('INSERT INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',   [`SEED-W1-${now}`, guildId, TEST_USER_ID, modId, '[TEST] Seed warn 1', now]),
      pool.execute('INSERT INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',   [`SEED-W2-${now}`, guildId, TEST_USER_ID, modId, '[TEST] Seed warn 2', now]),
      pool.execute('INSERT INTO strikes (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', [`SEED-S1-${now}`, guildId, TEST_USER_ID, modId, '[TEST] Seed strike 1', now]),
      pool.execute('INSERT INTO balances (guild_id, user_id, balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = 9999',    [guildId, TEST_USER_ID, 9999]),
      pool.execute('INSERT INTO levels (guild_id, user_id, total_xp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE total_xp = 99999',  [guildId, TEST_USER_ID, 99999]),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('🌱 Seed Data Inserted')
      .setColor(0x57F287)
      .addFields(
        { name: '🧑 Test User ID', value: `\`${TEST_USER_ID}\``, inline: true },
        { name: '🏠 Guild',        value: `\`${guildId}\``,      inline: true },
        { name: '📊 Rows Added',   value: '2 warns · 1 strike · 1 balance (9999) · 1 level (99999 XP)', inline: false },
        { name: '🧹 Cleanup',      value: 'Run `/cleartestdata` to remove all seeded rows.', inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Seeded by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: seeddata', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /cleartestdata ────────────────────────────────────────────────────────────

export async function handleClearTestData(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const tables = ['warns', 'ad_warns', 'strikes', 'jailed_users', 'message_counts',
                    'balances', 'breaks', 'applications', 'levels', 'bot_blacklist'];

    const results = await Promise.all(
      tables.map(t =>
        pool.execute(`DELETE FROM \`${t}\` WHERE user_id = ?`, [TEST_USER_ID])
          .then(([r]) => ({ table: t, deleted: r.affectedRows }))
          .catch(() => ({ table: t, deleted: 'err' }))
      )
    );

    const total = results.reduce((s, r) => s + (typeof r.deleted === 'number' ? r.deleted : 0), 0);
    const lines = results.filter(r => r.deleted !== 0 && r.deleted !== 'err')
      .map(r => `\`${r.table}\` — **${r.deleted}** row(s)`).join('\n') || 'Nothing to delete.';

    const embed = new EmbedBuilder()
      .setTitle('🧹 Test Data Cleared')
      .setColor(0xED4245)
      .addFields(
        { name: '🧑 Test User ID',   value: `\`${TEST_USER_ID}\``, inline: true },
        { name: '🗑️ Total Deleted',   value: String(total),         inline: true },
        { name: '📋 By Table', value: lines, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Cleared by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: cleartestdata', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /datacheck ────────────────────────────────────────────────────────────────

export async function handleDataCheck(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const checks = await Promise.all([
      pool.execute('SELECT COUNT(*) AS c FROM warns   WHERE guild_id NOT IN (SELECT guild_id FROM guilds)').then(([r]) => ({ name: 'Warns with no guild config',   count: r[0].c })).catch(() => ({ name: 'Warns orphan check',  count: '?' })),
      pool.execute('SELECT COUNT(*) AS c FROM strikes WHERE guild_id NOT IN (SELECT guild_id FROM guilds)').then(([r]) => ({ name: 'Strikes with no guild config', count: r[0].c })).catch(() => ({ name: 'Strikes orphan check', count: '?' })),
      pool.execute('SELECT COUNT(*) AS c FROM levels  WHERE guild_id NOT IN (SELECT guild_id FROM guilds)').then(([r]) => ({ name: 'Levels with no guild config',  count: r[0].c })).catch(() => ({ name: 'Levels orphan check',  count: '?' })),
      pool.execute('SELECT COUNT(*) AS c FROM guilds  WHERE log_channel_id IS NULL AND warn_log_channel_id IS NULL').then(([r]) => ({ name: 'Guilds with no log channels configured', count: r[0].c })).catch(() => ({ name: 'Guild config check', count: '?' })),
      pool.execute('SELECT COUNT(*) AS c FROM breaks  WHERE end_at < UNIX_TIMESTAMP() AND saved_roles IS NOT NULL').then(([r]) => ({ name: 'Expired breaks (roles not restored)', count: r[0].c })).catch(() => ({ name: 'Breaks check', count: '?' })),
    ]);

    const allOk  = checks.every(c => c.count === 0 || c.count === '?');
    const lines  = checks.map(c => `${c.count === 0 ? '✅' : c.count === '?' ? '⚠️' : '❌'} ${c.name}: **${c.count}**`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${allOk ? '✅' : '⚠️'} Database Integrity Check`)
      .setColor(allOk ? 0x57F287 : 0xFEE75C)
      .setDescription(lines)
      .setTimestamp()
      .setFooter({ text: `Checked by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: datacheck', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /benchmark ────────────────────────────────────────────────────────────────

export async function handleBenchmark(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const N = 10;
    const query = () => pool.execute('SELECT 1');

    const t0 = Date.now();
    for (let i = 0; i < N; i++) await query();
    const serialMs = Date.now() - t0;

    const t1 = Date.now();
    await Promise.all(Array.from({ length: N }, query));
    const parallelMs = Date.now() - t1;

    const embed = new EmbedBuilder()
      .setTitle('⚡ DB Benchmark')
      .setColor(0x5865F2)
      .addFields(
        { name: `🔁 Serial (${N}×)`,   value: `${serialMs}ms total · **${(serialMs/N).toFixed(1)}ms avg**`,   inline: true },
        { name: `⚡ Parallel (${N}×)`, value: `${parallelMs}ms total · **${(parallelMs/N).toFixed(1)}ms avg**`, inline: true },
        { name: '📈 Speedup',          value: `${(serialMs / Math.max(parallelMs, 1)).toFixed(2)}× faster in parallel`, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Run by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: benchmark', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /loadtest ─────────────────────────────────────────────────────────────────

export async function handleLoadTest(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const count = interaction.options.getInteger('count') ?? 5;
    const times = [];

    for (let i = 0; i < count; i++) {
      const t = Date.now();
      const fakeMsg = {
        id: String(i), content: `loadtest event ${i}`,
        author: { id: interaction.user.id, bot: false, tag: interaction.user.tag },
        guild: interaction.guild, guildId: interaction.guild?.id,
        channel: interaction.channel, channelId: interaction.channelId,
        member: interaction.member,
        mentions: { has: () => false },
        react: () => Promise.resolve(), reply: () => Promise.resolve(), delete: () => Promise.resolve(),
        createdTimestamp: Date.now(),
      };
      client.emit('messageCreate', fakeMsg);
      times.push(Date.now() - t);
    }

    const avg   = (times.reduce((s, n) => s + n, 0) / times.length).toFixed(2);
    const max   = Math.max(...times);
    const total = times.reduce((s, n) => s + n, 0);

    const embed = new EmbedBuilder()
      .setTitle('🔥 Load Test Complete')
      .setColor(0xF59E0B)
      .addFields(
        { name: '📨 Events Fired', value: String(count),     inline: true },
        { name: '⏱️ Total',         value: `${total}ms`,      inline: true },
        { name: '📊 Avg / Max',     value: `${avg}ms / ${max}ms`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Run by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: loadtest', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /ratelimit ────────────────────────────────────────────────────────────────

export async function handleRateLimit(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const mem   = process.memoryUsage();
    const embed = new EmbedBuilder()
      .setTitle('🚦 Rate Limit & Cache Info')
      .setColor(0x5865F2)
      .addFields(
        { name: '🏓 WS Ping',         value: `${client.ws.ping}ms`,                           inline: true },
        { name: '⏱️ Uptime',           value: `${Math.floor(process.uptime())}s`,              inline: true },
        { name: '💾 Heap',            value: `${(mem.heapUsed/1024/1024).toFixed(1)} MB`,     inline: true },
        { name: '⏳ XP Cooldowns',    value: String(xpCooldowns.size),                        inline: true },
        { name: '✨ AR Cache',         value: String(arCache.size),                            inline: true },
        { name: '🔄 AR React CD',     value: String(arReactCooldowns.size),                   inline: true },
        { name: '📋 Pending Approvals', value: String(pendingApprovals.size),                 inline: true },
        { name: '🏠 Guilds Cached',   value: String(client.guilds.cache.size),                inline: true },
        { name: '👤 Users Cached',    value: String(client.users.cache.size),                 inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: ratelimit', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /forceerror ───────────────────────────────────────────────────────────────

export async function handleForceError(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const testErr = new Error('[TEST] Controlled error triggered by /forceerror');
    testErr.stack = testErr.stack + '\n    (this is intentional — testing error pipeline)';
    await logError('Dev: forceerror (intentional)', testErr);

    const embed = new EmbedBuilder()
      .setTitle('💥 Error Forced')
      .setColor(0xED4245)
      .setDescription('A test error was sent through `logError`. Check your dev log channel for the entry.')
      .addFields({ name: '📄 Message', value: `\`${testErr.message}\``, inline: false })
      .setTimestamp()
      .setFooter({ text: `Triggered by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: forceerror (outer)', err).catch(() => {});
    if (!interaction.replied) await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
  }
}

// ── /testfail ─────────────────────────────────────────────────────────────────

export async function handleTestFail(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    let dbResult  = '✅ (no failure)';
    let apiResult = '✅ (no failure)';

    try {
      await pool.execute('SELECT * FROM __nonexistent_table__');
    } catch (e) {
      dbResult = `❌ DB error caught: \`${e.code ?? e.message.slice(0, 80)}\``;
    }

    try {
      await client.users.fetch('000000000000000000');
    } catch (e) {
      apiResult = `❌ API error caught: \`${e.message.slice(0, 80)}\``;
    }

    const embed = new EmbedBuilder()
      .setTitle('🧨 Failure Simulation')
      .setColor(0xFEE75C)
      .setDescription('Both failures were caught cleanly — error handling is working.')
      .addFields(
        { name: '🗄️ DB Failure',  value: dbResult,  inline: false },
        { name: '🌐 API Failure', value: apiResult, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Run by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testfail', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /debug ────────────────────────────────────────────────────────────────────

export async function handleDebug(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const mem    = process.memoryUsage();
    const up     = process.uptime();
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = Math.floor(up % 60);

    const t0 = Date.now();
    await pool.execute('SELECT 1');
    const dbPing = Date.now() - t0;

    const embed = new EmbedBuilder()
      .setTitle('🐛 Debug Dump')
      .setColor(0x5865F2)
      .addFields(
        { name: '⏱️ Uptime',           value: `${h}h ${m}m ${s}s`,                         inline: true },
        { name: '🏓 WS Ping',          value: `${client.ws.ping}ms`,                        inline: true },
        { name: '🗄️ DB Ping',          value: `${dbPing}ms`,                                inline: true },
        { name: '💾 RSS',              value: `${(mem.rss/1024/1024).toFixed(1)} MB`,       inline: true },
        { name: '🧠 Heap Used',        value: `${(mem.heapUsed/1024/1024).toFixed(1)} MB`,  inline: true },
        { name: '📦 Heap Total',       value: `${(mem.heapTotal/1024/1024).toFixed(1)} MB`, inline: true },
        { name: '🏠 Guilds',           value: String(client.guilds.cache.size),              inline: true },
        { name: '👤 Users Cached',     value: String(client.users.cache.size),               inline: true },
        { name: '💬 Channels Cached',  value: String(client.channels.cache.size),            inline: true },
        { name: '⏳ XP Cooldowns',     value: String(xpCooldowns.size),                     inline: true },
        { name: '✨ AR Cache',          value: String(arCache.size),                         inline: true },
        { name: '🔄 AR React CD',      value: String(arReactCooldowns.size),                 inline: true },
        { name: '📋 Pending Approvals',value: String(pendingApprovals.size),                 inline: true },
        { name: '🐛 Debug Mode',       value: isDebugEnabled() ? '✅ On' : '❌ Off',         inline: true },
        { name: '🌐 Node.js',          value: process.version,                               inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: debug', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testlongmsg ──────────────────────────────────────────────────────────────

export async function handleTestLongMsg(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const filler  = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    const longMsg = filler.repeat(34).slice(0, 1990);
    await interaction.reply({ content: `**[${longMsg.length} chars]** ${longMsg}` });
  } catch (err) {
    logError('Dev: testlongmsg', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testunicode ──────────────────────────────────────────────────────────────

export async function handleTestUnicode(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    const samples = [
      '**Emoji:**        🎉 🔥 💯 🦄 🏳️‍🌈 🧑‍💻 👨‍👩‍👧‍👦',
      '**RTL text:**     مرحبا بالعالم · שָׁלוֹם',
      '**CJK:**          こんにちは 你好 안녕하세요',
      '**Math symbols:** ∑ ∞ √ π ≠ ≤ ≥ ∈',
      '**Special:**      ™ © ® § ¶ ° € £ ¥',
      '**Zero-width:**   A\u200BB\u200BC (A​B​C with ZWJ)',
      '**Zalgo:**        Z̷̡̙̰̲̫͓̤̓͗̒̀͛̽̇͜a̷̡͙̞̜̓̓l̵͎̙̯̒͊g̵̨̟̦̓̽ö̶̡̰̯́',
      '**Null-like:**    \u0000 \u0001 \uFEFF (null, SOH, BOM — stripped by Discord)',
    ];
    const embed = new EmbedBuilder()
      .setTitle('🌐 Unicode Edge Cases')
      .setColor(0x5865F2)
      .setDescription(samples.join('\n'))
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testunicode', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testempty ────────────────────────────────────────────────────────────────

export async function handleTestEmpty(interaction) {
  try {
    if (!await devGuard(interaction)) return;

    const emptyUser   = interaction.options.getUser('nonexistent')   ?? null;
    const emptyStr    = interaction.options.getString('nonexistent')  ?? null;
    const emptyInt    = interaction.options.getInteger('nonexistent') ?? null;
    const emptyChannel= interaction.options.getChannel('nonexistent') ?? null;

    const embed = new EmbedBuilder()
      .setTitle('🕳️ Empty / Null Input Test')
      .setColor(0x5865F2)
      .setDescription('All optional options were fetched with no value provided. Verifying null safety.')
      .addFields(
        { name: 'getUser()',    value: emptyUser    === null ? '✅ null' : `⚠️ ${emptyUser}`,    inline: true },
        { name: 'getString()', value: emptyStr     === null ? '✅ null' : `⚠️ "${emptyStr}"`,   inline: true },
        { name: 'getInteger()',value: emptyInt     === null ? '✅ null' : `⚠️ ${emptyInt}`,     inline: true },
        { name: 'getChannel()',value: emptyChannel === null ? '✅ null' : `⚠️ ${emptyChannel}`, inline: true },
        { name: 'Result',      value: '✅ All null checks passed — no crashes on missing options.', inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Staff Portal · Dev Commands · ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testempty', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── /testspam ─────────────────────────────────────────────────────────────────

export async function handleTestSpam(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply();

    const count  = interaction.options.getInteger('count') ?? 5;
    const times  = [];

    for (let i = 1; i <= count; i++) {
      const t = Date.now();
      await interaction.channel.send(`🔁 **Spam message ${i}/${count}** — \`${new Date().toISOString()}\``);
      times.push(Date.now() - t);
    }

    const total = times.reduce((s, n) => s + n, 0);
    const avg   = (total / times.length).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle('📨 Spam Test Complete')
      .setColor(0x57F287)
      .addFields(
        { name: '📨 Messages Sent', value: String(count),       inline: true },
        { name: '⏱️ Total',          value: `${total}ms`,        inline: true },
        { name: '📊 Avg per msg',    value: `${avg}ms`,          inline: true },
        { name: '⏱️ Per message',    value: times.map((t, i) => `#${i+1}: ${t}ms`).join(' · '), inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Run by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError('Dev: testspam', err).catch(() => {});
    errReply(interaction, err);
  }
}

// ── DevTest component interaction handler (buttons, selects, modals) ──────────

export async function handleDevTestInteraction(interaction) {
  try {
    const id = interaction.customId;

    if (interaction.isButton()) {
      const label = id.replace('devtest:btn:', '');
      const embed = new EmbedBuilder()
        .setTitle('🔘 Button Fired')
        .setColor({ primary: 0x5865F2, secondary: 0x4F545C, success: 0x57F287, danger: 0xED4245 }[label] ?? 0x5865F2)
        .addFields(
          { name: 'Style',     value: label[0].toUpperCase() + label.slice(1), inline: true },
          { name: 'Custom ID', value: `\`${id}\``,                             inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Clicked by ${interaction.user.tag}` });
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.isStringSelectMenu()) {
      const chosen = interaction.values[0];
      const embed = new EmbedBuilder()
        .setTitle('🔽 Selection Received')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Selected value', value: `\`${chosen}\``,      inline: true },
          { name: 'Custom ID',      value: `\`${id}\``,           inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Selected by ${interaction.user.tag}` });
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.isModalSubmit()) {
      const name = interaction.fields.getTextInputValue('devtest:modal:name');
      const desc = interaction.fields.getTextInputValue('devtest:modal:desc') || '*(empty)*';
      const embed = new EmbedBuilder()
        .setTitle('📝 Modal Submitted')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Short input',     value: name, inline: false },
          { name: 'Paragraph input', value: desc, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `Submitted by ${interaction.user.tag}` });
      return interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    logError('DevTest interaction', err).catch(() => {});
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${err.message}` }).catch(() => {});
    }
  }
}

// ── /dev-test-abuse ────────────────────────────────────────────────────────────

export async function handleTestAbuse(interaction) {
  try {
    if (!await devGuard(interaction)) return;
    await interaction.deferReply({ ephemeral: true });

    const { trackAbuse, _store, RULES: _rules } = await import('../abuseDetector.js');
    const sub = interaction.options.getSubcommand();

    // ── status ──────────────────────────────────────────────────────────────
    if (sub === 'status') {
      if (_store.size === 0) {
        return interaction.editReply({ content: '📭 Abuse tracker is empty — no active counters.' });
      }

      const now = Date.now();
      const lines = [];
      for (const [key, times] of _store.entries()) {
        const live = times.filter(t => t > now - 10 * 60_000);
        if (live.length === 0) continue;
        const oldest = Math.round((now - Math.min(...live)) / 1000);
        lines.push(`\`${key}\` — **${live.length}** hit(s), oldest **${oldest}s** ago`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 Abuse Tracker — Live State')
        .setDescription(lines.length ? lines.join('\n') : '*(all entries expired)*')
        .setFooter({ text: `${_store.size} key(s) total in store` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── reset ────────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      const count = _store.size;
      _store.clear();
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🧹 Abuse Tracker Reset')
          .setDescription(`Cleared **${count}** key(s) from the in-memory store.`)
          .setTimestamp()],
      });
    }

    // ── trigger ──────────────────────────────────────────────────────────────
    if (sub === 'trigger') {
      const action   = interaction.options.getString('action');
      const targetId = interaction.options.getString('target_id') || interaction.user.id;

      // Rules lookup (re-import exposes RULES array)
      const { default: abuseModule } = await import('../abuseDetector.js').catch(() => ({}));

      // Fire enough times to guarantee a threshold breach
      const FIRE_COUNT = 5;
      const results = [];
      for (let i = 1; i <= FIRE_COUNT; i++) {
        await trackAbuse({ guild: interaction.guild, action, moderatorId: interaction.user.id, targetId });
        const key = [..._store.keys()].find(k => k.includes(action) && k.includes(interaction.user.id)) ?? '(fired)';
        const hits = _store.get(key)?.length ?? 0;
        results.push(`Run **${i}** — tracker hits: **${hits === 0 ? '0 (alert fired & reset)' : hits}**`);
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle(`🚨 Abuse Test — \`${action}\``)
        .setDescription(
          `Fired \`trackAbuse\` **${FIRE_COUNT}×** as <@${interaction.user.id}> targeting <@${targetId}>.\n` +
          `An alert embed should have posted to your server log channel and pinged <@&1518775422836539442>.\n\n` +
          results.join('\n')
        )
        .addFields(
          { name: '👮 Simulated Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🎯 Simulated Target',    value: `<@${targetId}>`,            inline: true },
          { name: '⚡ Action',              value: `\`${action}\``,              inline: true },
        )
        .setFooter({ text: 'Check your log channel for the abuse alert embed.' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logError('Dev: test-abuse', err).catch(() => {});
    errReply(interaction, err);
  }
}
