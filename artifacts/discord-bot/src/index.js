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
  setSnipeCache,
  isAdChannel,
  trackAdPost,
  getAdPostsByUser,
  clearAdPostsByUser,
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
  handleRequestButton,
} from './commands.js';

import {
  setupCommands,
  handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
  handleSetupRequests, handleSetupNetworkHub, handleSetupNetworkJoin, handleSetupNetworkReset,
  handleNetworkStatus, handleSetupAdChannels,
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
  'setup-ad-channels': handleSetupAdChannels,
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
  const guilds = client.guilds.cache.map(g => g.id);

  try {
    // Register per-guild for instant propagation (no 1-hour delay)
    if (guilds.length > 0) {
      console.log(`Registering ${allDefs.length} commands in ${guilds.length} guild(s)...`);
      await Promise.all(
        guilds.map(guildId =>
          rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: allDefs })
            .catch(err => console.warn(`Could not register in guild ${guildId}:`, err.message))
        )
      );
    }

    // Also register globally so new guilds the bot joins get commands
    console.log("Registering commands globally (background, up to 1h propagation)...");
    rest.put(Routes.applicationCommands(CLIENT_ID), { body: allDefs })
      .then(() => console.log("✅ Global commands registered"))
      .catch(err => console.warn("Global register failed (guild commands still active):", err.message));

    console.log("✅ Guild commands registered");
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
  // Button interactions
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('req:')) {
      try {
        await handleRequestButton(interaction);
      } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error handling button', flags: 64 }).catch(() => {});
        }
      }
    }
    return;
  }

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

// ─── AD CHANNEL PROMO MESSAGE ────────────────────────────────────────────────

const AD_PROMO = `# 📈 Join and advertise for free
https://discord.gg/CU8DHHM5dk
https://discord.gg/GQV2mPcSzF
https://discord.gg/SfVkFuts2E
https://discord.gg/G4z9DWFQzT
https://discord.gg/nMnz4dTCZb
https://discord.gg/Mr72YbJYj3
https://discord.gg/2Wb8sekNG7
https://discord.gg/uwU9XMUydE
https://discord.gg/jhcWUgRQS8
https://discord.gg/GtjUa5hhCz
https://discord.gg/globalads
https://discord.gg/promotions`;

// Per-user cooldown so the promo only sends once per 10 min per user per channel
const adPromoCooldown = new Map();

// message tracking + ad channel handling
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  incrementMessageCount(msg.guild.id, msg.author.id);

  if (isAdChannel(msg.guild.id, msg.channel.id)) {
    // Track the post so we can delete it if the member leaves
    trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);

    // Cooldown key: userId + channelId — only send promo once per 10 min per user
    const cooldownKey = `${msg.author.id}:${msg.channel.id}`;
    const lastSent = adPromoCooldown.get(cooldownKey) || 0;
    if (Date.now() - lastSent > 10 * 60 * 1000) {
      adPromoCooldown.set(cooldownKey, Date.now());
      try {
        await msg.reply({ content: AD_PROMO, allowedMentions: { repliedUser: false } });
      } catch (err) {
        console.warn('Failed to send ad promo reply:', err.message);
      }
    }
  }
});

// ─── MEMBER LEAVE — DELETE THEIR AD POSTS ────────────────────────────────────

client.on('guildMemberRemove', async member => {
  const guildId = member.guild.id;
  const userId = member.id;

  const posts = getAdPostsByUser(guildId, userId);
  if (posts.length === 0) return;

  let deleted = 0;
  for (const { channel_id, message_id } of posts) {
    try {
      const channel = await member.guild.channels.fetch(channel_id).catch(() => null);
      if (!channel) continue;
      const message = await channel.messages.fetch(message_id).catch(() => null);
      if (message) {
        await message.delete();
        deleted++;
      }
    } catch (err) {
      console.warn(`Failed to delete ad post ${message_id}:`, err.message);
    }
  }

  clearAdPostsByUser(guildId, userId);
  console.log(`🗑️ Deleted ${deleted}/${posts.length} ad posts for leaving member ${member.user.tag} (${userId})`);
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