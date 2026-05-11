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
} from './commands.js';

import {
  setupCommands,
  handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
} from './setup.js';

// ─── ENV ──────────────────────────────────────────────────────────────────────

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = parseInt(process.env.PORT || '5000', 10);

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing TOKEN or CLIENT_ID environment variables.');
  process.exit(1);
}

// ─── COMMAND ROUTER ──────────────────────────────────────────────────────────

const handlers = {
  'setup': handleSetup,
  'setup-roles': handleSetupRoles,
  'setup-roles-extra': handleSetupRolesExtra,
  'setup-status': handleSetupStatus,
  'setup-edit': handleSetupEdit,
  'setup-roles-wizard': handleSetupRolesWizard,

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

// ─── DISCORD CLIENT ──────────────────────────────────────────────────────────

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

// ─── REGISTER COMMANDS ───────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  const allDefs = [...commandDefs, ...setupCommands].map(cmd => cmd.toJSON());

  try {
    console.log(`Registering ${allDefs.length} slash commands...`);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allDefs });
    console.log('Slash commands registered successfully.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const handler = handlers[interaction.commandName];

  if (!handler) {
    return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);

    const msg = {
      content: '❌ An error occurred while running this command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// Message tracking
client.on('messageCreate', message => {
  if (message.author.bot || !message.guild) return;
  incrementMessageCount(message.guild.id, message.author.id);
});

// Snipe system
client.on('messageDelete', message => {
  if (!message.guild || message.author?.bot) return;

  const content = message.content || '';
  const author = message.author;

  if (!author) return;

  setSnipeCache(
    message.guild.id,
    message.channel.id,
    content,
    author.id,
    author.tag,
    author.displayAvatarURL()
  );
});

// ─── EXPRESS HEALTH SERVER ──────────────────────────────────────────────────

const app = express();

// MAIN HEALTH ENDPOINT (USE FOR UPTIMEROBOT)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: client.isReady() ? 'online' : 'starting',
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    timestamp: new Date().toISOString(),
  });
});

// ALIASES (prevents broken links)
app.get('/healthz', (req, res) => res.redirect('/health'));
app.get('/api/healthz', (req, res) => res.redirect('/health'));

// ROOT
app.get('/', (req, res) => res.redirect('/health'));

app.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

// ─── SELF-PINGER ─────────────────────────────────────────────────────────────

function startSelfPinger() {
  const domains = process.env.REPLIT_DOMAINS;

  if (!domains) {
    console.log('No REPLIT_DOMAINS found, self-pinger disabled.');
    return;
  }

  const host = domains.split(',')[0].trim();
  const pingUrl = `https://${host}/health`;

  console.log(`Self-pinger active → ${pingUrl} every 4 minutes`);

  setInterval(async () => {
    try {
      const res = await fetch(pingUrl);
      console.log(`[pinger] ${pingUrl} → ${res.status}`);
    } catch (err) {
      console.warn(`[pinger] failed: ${err.message}`);
    }
  }, 4 * 60 * 1000);
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err.message);
  process.exit(1);
});

startSelfPinger();