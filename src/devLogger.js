import discordPkg from 'discord.js';
const { ChannelType, EmbedBuilder, PermissionFlagsBits } = discordPkg;

// ── Config ────────────────────────────────────────────────────────────────────

const DEV_GUILD_ID   = '1472759140232204551';
const CATEGORY_NAME  = '📊 Bot Management';

const CHANNEL_DEFS = [
  { name: 'bot-logs',     publicView: true  },
  { name: 'errors',       publicView: false },
  { name: 'guild-events', publicView: true  },
  { name: 'metrics',      publicView: true  },
  { name: 'warnings',     publicView: false },
  { name: 'dev-chat',     publicView: false },
];

// ── Internal State ────────────────────────────────────────────────────────────

const ch = {};   // channel name → TextChannel
let _client = null;

// ── Log Buffer (ring buffer for /dev-logs) ────────────────────────────────────

const LOG_BUFFER_MAX = 100;
const logBuffer = [];  // { ts, level, message }

function pushLog(level, message) {
  logBuffer.push({ ts: Date.now(), level, message });
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
}

export function getRecentLogs(count = 20) {
  return logBuffer.slice(-Math.min(count, LOG_BUFFER_MAX));
}

// ── Debug Toggle ──────────────────────────────────────────────────────────────

let debugEnabled = false;
export function setDebug(value) { debugEnabled = value; }
export function isDebugEnabled() { return debugEnabled; }

// ── Setup ─────────────────────────────────────────────────────────────────────

export async function setupDevServer(client) {
  _client = client;
  try {
    const guild = await client.guilds.fetch(DEV_GUILD_ID).catch(() => null);
    if (!guild) {
      console.warn(`⚠️  [DevLogger] Dev guild ${DEV_GUILD_ID} not found — dev logging disabled.`);
      return;
    }

    await guild.channels.fetch();
    await guild.roles.fetch();

    const everyoneId = guild.roles.everyone.id;
    const botId      = client.user.id;

    // ── Category ─────────────────────────────────────────────────────────────
    let category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
    );
    if (!category) {
      category = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
      });
      console.log(`[DevLogger] Created category "${CATEGORY_NAME}"`);
    }

    // ── Channels ─────────────────────────────────────────────────────────────
    for (const def of CHANNEL_DEFS) {
      let channel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText &&
             c.name === def.name &&
             c.parentId === category.id,
      );

      const overwrites = [
        {
          id:    botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id:    everyoneId,
          allow: def.publicView ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] : [],
          deny:  [
            PermissionFlagsBits.SendMessages,
            ...(!def.publicView ? [PermissionFlagsBits.ViewChannel] : []),
          ],
        },
      ];

      if (!channel) {
        channel = await guild.channels.create({
          name:                def.name,
          type:                ChannelType.GuildText,
          parent:              category.id,
          permissionOverwrites: overwrites,
        });
        console.log(`[DevLogger] Created #${def.name}`);
      } else {
        await channel.permissionOverwrites.set(overwrites).catch(() => null);
      }

      ch[def.name] = channel;
    }

    console.log('✅ [DevLogger] Dev server setup complete');
  } catch (err) {
    console.error('[DevLogger] Setup failed:', err.message);
  }
}

// ── Internal Send ─────────────────────────────────────────────────────────────

async function send(channelName, payload) {
  try {
    if (ch[channelName]) await ch[channelName].send(payload);
  } catch { /* never crash */ }
}

// ── Public Logging API ────────────────────────────────────────────────────────

export async function logStartup(client) {
  await send('bot-logs', {
    embeds: [
      new EmbedBuilder()
        .setTitle('🟢 Bot Online')
        .setColor(0x57F287)
        .addFields(
          { name: '🤖 Tag',    value: client.user?.tag ?? 'Unknown',               inline: true },
          { name: '🏠 Guilds', value: String(client.guilds.cache.size),             inline: true },
          { name: '🏓 Ping',   value: `${client.ws.ping}ms`,                        inline: true },
        )
        .setTimestamp(),
    ],
  });
}

export async function logShutdown(reason = 'Process exit') {
  await send('bot-logs', {
    embeds: [
      new EmbedBuilder()
        .setTitle('🔴 Bot Offline')
        .setColor(0xED4245)
        .setDescription(reason)
        .setTimestamp(),
    ],
  });
}

export async function logCommand(interaction) {
  try {
    const options = interaction.options?.data?.map(o => `\`${o.name}\`: ${o.value ?? '—'}`).join('\n') || '—';
    await send('bot-logs', {
      embeds: [
        new EmbedBuilder()
          .setTitle('⚙️ Command Used')
          .setColor(0x5865F2)
          .addFields(
            { name: '📌 Command', value: `\`/${interaction.commandName}\``,              inline: true  },
            { name: '👤 User',    value: `${interaction.user.tag}\n\`${interaction.user.id}\``, inline: true },
            { name: '🏠 Guild',   value: interaction.guild?.name ?? 'DM',               inline: true  },
            { name: '📋 Options', value: options.slice(0, 1024),                        inline: false },
          )
          .setTimestamp(),
      ],
    });
  } catch { /* never crash */ }
}

export async function logError(type, error) {
  try {
    const text = (error?.stack ?? String(error)).slice(0, 1900);
    pushLog('error', `${type}: ${String(error?.message ?? error).slice(0, 120)}`);
    await send('errors', {
      embeds: [
        new EmbedBuilder()
          .setTitle(`💥 ${type}`)
          .setColor(0xFF0000)
          .setDescription(`\`\`\`\n${text}\n\`\`\``)
          .setTimestamp(),
      ],
    });
  } catch { /* never crash */ }
}

export async function logGuildJoin(guild) {
  await send('guild-events', {
    embeds: [
      new EmbedBuilder()
        .setTitle('📥 Joined Guild')
        .setColor(0x57F287)
        .setThumbnail(guild.iconURL({ size: 256, extension: 'png' }) ?? null)
        .addFields(
          { name: '🏠 Name',    value: guild.name,                  inline: true },
          { name: '🆔 ID',      value: guild.id,                    inline: true },
          { name: '👥 Members', value: String(guild.memberCount),   inline: true },
        )
        .setTimestamp(),
    ],
  });
}

export async function logGuildLeave(guild) {
  await send('guild-events', {
    embeds: [
      new EmbedBuilder()
        .setTitle('📤 Left Guild')
        .setColor(0xED4245)
        .addFields(
          { name: '🏠 Name', value: guild.name, inline: true },
          { name: '🆔 ID',   value: guild.id,   inline: true },
        )
        .setTimestamp(),
    ],
  });
}

export async function logWarning(type, detail) {
  try {
    pushLog('warn', `${type}: ${String(detail).slice(0, 120)}`);
    await send('warnings', {
      embeds: [
        new EmbedBuilder()
          .setTitle(`⚠️ ${type}`)
          .setColor(0xFFA500)
          .setDescription(String(detail).slice(0, 2000))
          .setTimestamp(),
      ],
    });
  } catch { /* never crash */ }
}

// ── Metrics Loop ──────────────────────────────────────────────────────────────

export async function startMetricsLoop(client) {
  async function post() {
    try {
      const mem     = process.memoryUsage();
      const uptime  = process.uptime();
      const hours   = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      let totalUsers = 0;
      for (const g of client.guilds.cache.values()) totalUsers += g.memberCount;

      await send('metrics', {
        embeds: [
          new EmbedBuilder()
            .setTitle('📊 Hourly Metrics')
            .setColor(0x5865F2)
            .addFields(
              { name: '⏱️ Uptime',    value: `${hours}h ${minutes}m ${seconds}s`,             inline: true },
              { name: '🏠 Guilds',    value: String(client.guilds.cache.size),                 inline: true },
              { name: '👥 Users',     value: String(totalUsers),                               inline: true },
              { name: '🏓 Ping',      value: `${client.ws.ping}ms`,                            inline: true },
              { name: '💾 RSS',       value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,       inline: true },
              { name: '🧠 Heap Used', value: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,  inline: true },
            )
            .setTimestamp(),
        ],
      });
    } catch { /* never crash */ }
  }

  await post();
  setInterval(post, 60 * 60 * 1000);
}

// ── Process-Level Error & Shutdown Handlers ───────────────────────────────────

export function registerProcessHandlers() {
  process.on('uncaughtException', async (err) => {
    console.error('[DevLogger] Uncaught Exception:', err);
    await logError('Uncaught Exception', err).catch(() => {});
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('[DevLogger] Unhandled Rejection:', reason);
    await logError('Unhandled Promise Rejection', reason).catch(() => {});
  });

  async function gracefulShutdown(signal) {
    console.log(`[DevLogger] Received ${signal} — shutting down`);
    await logShutdown(`Received \`${signal}\``).catch(() => {});
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
}
