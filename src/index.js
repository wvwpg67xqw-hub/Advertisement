import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import express from 'express';

import db from './database.js';

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
const PORT = process.env.PORT || 3000;

const APPLICATION_CHANNEL_ID = process.env.APPLICATION_CHANNEL_ID;

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
// EXPRESS SERVER
// ─────────────────────────────────────────────

const app = express();

app.get("/", (req, res) => res.send("🚀 Bot running"));
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ─────────────────────────────────────────────
// COMMANDS MAP
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
// COMMAND HANDLER
// ─────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  try {
    // ───────── BUTTON SYSTEM (ACCEPT / DENY) ─────────
    if (interaction.isButton()) {
      const [type, action, id] = interaction.customId.split("_");

      if (type === "app") {
        const app = db.prepare(
          "SELECT * FROM applications WHERE id = ?"
        ).get(Number(id));

        if (!app) {
          return interaction.reply({
            content: "❌ Application not found",
            ephemeral: true,
          });
        }

        if (action === "accept") {
          db.prepare(
            "UPDATE applications SET status = 'accepted' WHERE id = ?"
          ).run(Number(id));

          return interaction.reply({
            content: `✅ Accepted application #${id}`,
            ephemeral: true,
          });
        }

        if (action === "deny") {
          db.prepare(
            "UPDATE applications SET status = 'denied' WHERE id = ?"
          ).run(Number(id));

          return interaction.reply({
            content: `❌ Denied application #${id}`,
            ephemeral: true,
          });
        }
      }

      return;
    }

    // ───────── SLASH COMMANDS ─────────
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

    const msg = { content: "❌ Error occurred", ephemeral: true };

    if (interaction.replied) {
      interaction.followUp(msg).catch(() => {});
    } else {
      interaction.reply(msg).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────
// MESSAGE TRACKING
// ─────────────────────────────────────────────

client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  incrementMessageCount(msg.guild.id, msg.author.id);

  if (isAdChannel(msg.guild.id, msg.channel.id)) {
    trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);

    const embed = new EmbedBuilder()
      .setTitle("📈 Advertise Here")
      .setColor(0x2b2d31)
      .setDescription("Use approved ad channels only.");
  }
});

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
});