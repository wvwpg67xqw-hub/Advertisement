import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder,
} from 'discord.js';

import express from 'express';

import {
  incrementMessageCount,
  isAdChannel,
  trackAdPost,
} from './database.js';

import {
  commandDefs,
  handleWarn,
  handleWarns,
  handleWarnLeaderboard,
  handleAdWarn,
  handleRemoveAdWarn,
  handleMute,
  handleUnmute,
  handleBan,
  handleFire,
  handlePromote,
  handleDemoteUser,
  handleStrike,
  handleStrikeRemove,
  handleJail,
  handleUnjail,
  handleBanRequest,
  handleBlacklistRequest,
  handleNetworkBanRequest,
  handlePartnershipRequest,
  handleMessages,
  handleMessageLeaderboard,
  handleCaseInfo,
  handleBalance,
  handleSnipe,
  handleCurrentBreaks,
  handleBreak,
  handleBreakEnd,
  handleResetMessages,
  handleResetMessagesAll,
  handleNetworkBan,
  handleNetworkUnban,
  handleRequestButton,
} from './commands.js';

import {
  setupCommands,
  handleSetup,
  handleSetupRoles,
  handleSetupRolesExtra,
  handleSetupStatus,
  handleSetupEdit,
  handleSetupRolesWizard,
  handleSetupRequests,
  handleSetupNetworkHub,
  handleSetupNetworkJoin,
  handleSetupNetworkReset,
  handleNetworkStatus,
  handleSetupAdChannels,
} from './setup.js';

// ─────────────────────────────────────────────
// ENV
// ─────────────────────────────────────────────

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ✅ PORT FIX (THIS IS WHAT YOU ASKED FOR)
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

// ─────────────────────────────────────────────
// DISCORD CLIENT
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// EXPRESS SERVER (HEALTH + WEBSITE BASE)
// ─────────────────────────────────────────────

const app = express();

app.get("/", (req, res) => {
  res.send("🚀 Bot is running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: client.isReady() ? "online" : "starting",
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ─────────────────────────────────────────────
// COMMAND HANDLERS MAP
// ─────────────────────────────────────────────

const handlers = {
  setup: handleSetup,
  "setup-roles": handleSetupRoles,
  "setup-roles-extra": handleSetupRolesExtra,
  "setup-status": handleSetupStatus,
  "setup-edit": handleSetupEdit,
  "setup-roles-wizard": handleSetupRolesWizard,
  "setup-requests": handleSetupRequests,
  "setup-ad-channels": handleSetupAdChannels,
  "setup-network-hub": handleSetupNetworkHub,
  "setup-network-join": handleSetupNetworkJoin,
  "setup-network-reset": handleSetupNetworkReset,
  "network-status": handleNetworkStatus,
  "network-ban": handleNetworkBan,
  "network-unban": handleNetworkUnban,

  warn: handleWarn,
  warns: handleWarns,
  "warn-leaderboard": handleWarnLeaderboard,

  "ad-warn": handleAdWarn,
  "remove-ad-warn": handleRemoveAdWarn,

  mute: handleMute,
  unmute: handleUnmute,
  ban: handleBan,
  fire: handleFire,
  promote: handlePromote,
  "demote-user": handleDemoteUser,

  strike: handleStrike,
  "strike-remove": handleStrikeRemove,

  jail: handleJail,
  unjail: handleUnjail,

  "ban-request": handleBanRequest,
  "blacklist-request": handleBlacklistRequest,
  "network-ban-request": handleNetworkBanRequest,
  "partnership-request": handlePartnershipRequest,

  messages: handleMessages,
  "message-leaderboard": handleMessageLeaderboard,
  "case-info": handleCaseInfo,
  balance: handleBalance,
  snipe: handleSnipe,

  "current-breaks": handleCurrentBreaks,
  break: handleBreak,
  "break-end": handleBreakEnd,

  "reset-messages": handleResetMessages,
  "reset-messages-all": handleResetMessagesAll,
};

// ─────────────────────────────────────────────
// REGISTER COMMANDS
// ─────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const allCommands = [...commandDefs, ...setupCommands].map(c => c.toJSON());

  try {
    console.log("🧹 Clearing old commands...");

    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), {
        body: [],
      });
    }

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    console.log("📥 Registering new commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: allCommands,
    });

    console.log("✅ Commands registered successfully");
  } catch (err) {
    console.error("❌ Command registration failed:", err);
  }
}

// ─────────────────────────────────────────────
// READY EVENT
// ─────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const handler = handlers[interaction.commandName];

    if (!handler) {
      return interaction.reply({
        content: "❌ Unknown command",
        ephemeral: true,
      });
    }

    await handler(interaction);
  } catch (err) {
    console.error(err);

    const msg = {
      content: "❌ Something went wrong",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      interaction.followUp(msg).catch(() => {});
    } else {
      interaction.reply(msg).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────
// MESSAGE SYSTEM (AD TRACKING)
// ─────────────────────────────────────────────

client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  incrementMessageCount(msg.guild.id, msg.author.id);

  if (isAdChannel(msg.guild.id, msg.channel.id)) {
    trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);
  }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
});