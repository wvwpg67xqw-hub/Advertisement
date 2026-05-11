import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes
} from 'discord.js';

import express from 'express';

import {
  incrementMessageCount,
  setSnipeCache
} from './database.js';

import {
  commandDefs,
  handleWarn, handleWarns, handleWarnLeaderboard,
  handleAdWarn, handleRemoveAdWarn,
  handleMute, handleUnmute, handleBan, handleFire, handlePromote, handleDemoteUser,
  handleStrike, handleStrikeRemove,
  handleJail, handleUnjail,
  handleBanRequest, handleBlacklistRequest, handleNetworkBanRequest, handlePartnershipRequest,
  handleMessages, handleMessageLeaderboard, handleCaseInfo, handleBalance, handleSnipe,
  handleCurrentBreaks, handleBreak, handleBreakEnd,
  handleResetMessages, handleResetMessagesAll,
  handleNetworkBan, handleNetworkUnban,
} from './commands.js';

import {
  setupCommands,
  handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
  handleSetupRequests, handleSetupNetworkHub, handleSetupNetworkJoin, handleSetupNetworkReset,
  handleNetworkStatus,
} from './setup.js';

// ─── ENV ─────────────────────────────────────────────────────────────────────

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.BOT_HEALTH_PORT || 8080;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

// ─── EXPRESS (START FIRST - prevents silent crashes) ────────────────────────

const app = express();

/**
 * HEALTH ENDPOINT (UPTIMEROBOT)
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: client?.isReady?.() ? "online" : "starting",
    uptime: process.uptime(),
    guilds: client?.guilds?.cache?.size ?? 0,
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => res.redirect("/health"));

app.listen(PORT, () => {
  console.log(`✅ Health server running on port ${PORT}`);
});

// ─── SAFE SELF-PINGER (NO fetch dependency) ────────────────────────────────

function startSelfPinger() {
  const domains = process.env.REPLIT_DOMAINS;

  if (!domains) {
    console.log("Self-pinger disabled (no REPLIT_DOMAINS)");
    return;
  }

  const host = domains.split(",")[0].trim();
  const pingUrl = `https://${host}/health`;

  console.log(`🔁 Self-pinger active → ${pingUrl}`);

  setInterval(() => {
    try {
      fetch(pingUrl).catch(() => {});
    } catch (e) {
      console.warn("Ping failed:", e.message);
    }
  }, 4 * 60 * 1000);
}

// ─── DISCORD CLIENT ─────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ─── COMMAND ROUTER ─────────────────────────────────────────────────────────

const handlers = {
  'setup': handleSetup,
  'setup-roles': handleSetupRoles,
  'setup-roles-extra': handleSetupRolesExtra,
  'setup-status': handleSetupStatus,
  'setup-edit': handleSetupEdit,
  'setup-roles-wizard': handleSetupRolesWizard,
  'setup-requests': handleSetupRequests,
  'setup-network-hub': handleSetupNetworkHub,
  'setup-network-join': handleSetupNetworkJoin,
  'setup-network-reset': handleSetupNetworkReset,
  'network-status': handleNetworkStatus,
  'network-ban': handleNetworkBan,
  'network-unban': handleNetworkUnban,

  'warn': handleWarn,
  'warns': handleWarns,
  'warn-leaderboard': handleWarnLeaderboard,

  'ad-warn': handleAdWarn,
  'remove-ad-warn': handleRemoveAdWarn,

  'mute': handleMute,
  'unmute': handleUnmute,
  'ban': handleBan,
  'fire': handleFire,
  'promote': handlePromote,
  'demote-user': handleDemoteUser,

  'strike': handleStrike,
  'strike-remove': handleStrikeRemove,

  'jail': handleJail,
  'unjail': handleUnjail,

  'ban-request': handleBanRequest,
  'blacklist-request': handleBlacklistRequest,
  'network-ban-request': handleNetworkBanRequest,
  'partnership-request': handlePartnershipRequest,

  'messages': handleMessages,
  'message-leaderboard': handleMessageLeaderboard,
  'case-info': handleCaseInfo,
  'balance': handleBalance,
  'snipe': handleSnipe,
  'current-breaks': handleCurrentBreaks,
  'break': handleBreak,
  'break-end': handleBreakEnd,
  'reset-messages': handleResetMessages,
  'reset-messages-all': handleResetMessagesAll,
};

// ─── COMMAND REGISTRATION ───────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  const allDefs = [...commandDefs, ...setupCommands].map(c => c.toJSON());

  try {
    // 1. Wipe all global commands
    console.log("Clearing global commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    // 2. Wipe all guild-specific commands for every guild the bot is in
    const guilds = client.guilds.cache.map(g => g.id);
    if (guilds.length > 0) {
      console.log(`Clearing guild commands in ${guilds.length} guild(s)...`);
      await Promise.all(
        guilds.map(guildId =>
          rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: [] })
            .catch(err => console.warn(`Could not clear guild ${guildId}:`, err.message))
        )
      );
    }

    // 3. Register all commands globally
    console.log(`Registering ${allDefs.length} commands globally...`);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allDefs });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("Command register failed:", err);
  }
}

// ─── EVENTS ─────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const handler = handlers[interaction.commandName];

  if (!handler) {
    return interaction.reply({ content: "❌ Unknown command", ephemeral: true });
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: "❌ Error occurred", ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// message tracking
client.on('messageCreate', msg => {
  if (msg.author.bot || !msg.guild) return;
  incrementMessageCount(msg.guild.id, msg.author.id);
});

// snipe system
client.on('messageDelete', msg => {
  if (!msg.guild || msg.author?.bot) return;

  setSnipeCache(
    msg.guild.id,
    msg.channel.id,
    msg.content || "",
    msg.author?.id,
    msg.author?.tag,
    msg.author?.displayAvatarURL?.()
  );
});

// ─── LOGIN ──────────────────────────────────────────────────────────────────

client.login(TOKEN).catch(err => {
  console.error("Login failed:", err);
  process.exit(1);
});

startSelfPinger();