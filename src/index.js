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
  setSnipeCache,
  isAdChannel,
  trackAdPost,
  getAdPostsByUser,
  clearAdPostsByUser,
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

// ✅ FIXED: LemonHost uses process.env.PORT
const PORT = process.env.PORT;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID");
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
// EXPRESS HEALTH SERVER
// ─────────────────────────────────────────────

const app = express();

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: client.isReady() ? "online" : "starting",
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.redirect("/health");
});

// ✅ FIXED LISTENER
app.listen(PORT, () => {
  console.log(`✅ Health server running on port ${PORT}`);
});

// ─────────────────────────────────────────────
// SELF PINGER
// ─────────────────────────────────────────────

function startSelfPinger() {
  const domains = process.env.REPLIT_DOMAINS;

  if (!domains) {
    console.log("⚠️ Self-pinger disabled");
    return;
  }

  const host = domains.split(",")[0].trim();
  const url = `https://${host}/health`;

  console.log(`🔁 Self-pinger active → ${url}`);

  setInterval(() => {
    fetch(url).catch(() => {});
  }, 4 * 60 * 1000);
}

// ─────────────────────────────────────────────
// COMMAND HANDLERS
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
// COMMAND REGISTRATION
// ─────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const all = [...commandDefs, ...setupCommands].map(c => c.toJSON());

  try {
    console.log("🗑 Clearing ALL old guild commands...");

    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guild.id),
        { body: [] }
      );

      console.log(`✅ Cleared guild commands in ${guild.name}`);
    }

    console.log("🗑 Clearing ALL old global commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] }
    );

    console.log("✅ Old global commands deleted");

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("📥 Registering fresh global commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: all }
    );

    console.log("✅ Fresh global commands registered");

  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
}

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await registerCommands();

  startSelfPinger();
});

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("req:")) {
        return handleRequestButton(interaction);
      }
      return;
    }

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
      content: "❌ Error occurred",
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
// MESSAGE SYSTEM
// ─────────────────────────────────────────────

const adCooldown = new Map();

const AD_LINKS = [
  "https://discord.gg/CU8DHHM5dk",
  "https://discord.gg/GQV2mPcSzF",
  "https://discord.gg/SfVkFuts2E",
  "https://discord.gg/G4z9DWFQzT",
];

function buildAdEmbed() {
  return new EmbedBuilder()
    .setTitle("📈 Advertise Your Server")
    .setColor(0x2b2d31)
    .setDescription(AD_LINKS.map((l, i) => `**${i + 1}.** ${l}`).join("\n"))
    .setTimestamp();
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  incrementMessageCount(msg.guild.id, msg.author.id);

  if (isAdChannel(msg.guild.id, msg.channel.id)) {
    trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);

    const key = `${msg.author.id}:${msg.channel.id}`;
    const last = adCooldown.get(key) || 0;

    if (Date.now() - last > 10 * 60 * 1000) {
      adCooldown.set(key, Date.now());

      await msg.reply({
        embeds: [buildAdEmbed()],
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
});