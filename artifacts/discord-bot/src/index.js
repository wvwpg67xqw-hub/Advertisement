import { Client, GatewayIntentBits, Partials, REST, Routes, Collection } from 'discord.js';
import express from 'express';
import { incrementMessageCount, setSnipeCache } from './database.js';
import { commandDefs, handleWarn, handleWarns, handleWarnLeaderboard,
  handleAdWarn, handleRemoveAdWarn,
  handleMute, handleUnmute, handleBan, handleFire, handlePromote, handleDemoteUser,
  handleStrike, handleStrikeRemove,
  handleJail, handleUnjail,
  handleBanRequest, handleBlacklistRequest, handleNetworkBanRequest, handlePartnershipRequest,
  handleMessages, handleMessageLeaderboard, handleCaseInfo, handleBalance, handleSnipe,
  handleCurrentBreaks, handleBreak, handleBreakEnd,
  handleResetMessages, handleResetMessagesAll,
} from './commands.js';
import { setupCommands,
  handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
} from './setup.js';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = parseInt(process.env.PORT || '5000', 10);

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing TOKEN or CLIENT_ID environment variables.');
  process.exit(1);
}

// ─── Command Router ───────────────────────────────────────────────────────────

const handlers = {
  // Setup
  'setup': handleSetup,
  'setup-roles': handleSetupRoles,
  'setup-roles-extra': handleSetupRolesExtra,
  'setup-status': handleSetupStatus,
  'setup-edit': handleSetupEdit,
  'setup-roles-wizard': handleSetupRolesWizard,
  // Warnings
  'warn': handleWarn,
  'warns': handleWarns,
  'warn-leaderboard': handleWarnLeaderboard,
  // Ad warnings
  'ad-warn': handleAdWarn,
  'remove-ad-warn': handleRemoveAdWarn,
  // Moderation
  'mute': handleMute,
  'unmute': handleUnmute,
  'ban': handleBan,
  'fire': handleFire,
  'promote': handlePromote,
  'demote-user': handleDemoteUser,
  // Strikes
  'strike': handleStrike,
  'strike-remove': handleStrikeRemove,
  // Jail
  'jail': handleJail,
  'unjail': handleUnjail,
  // Requests
  'ban-request': handleBanRequest,
  'blacklist-request': handleBlacklistRequest,
  'network-ban-request': handleNetworkBanRequest,
  'partnership-request': handlePartnershipRequest,
  // Utility
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

// ─── Discord Client ───────────────────────────────────────────────────────────

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

// ─── Register Commands ────────────────────────────────────────────────────────

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

// ─── Event Handlers ───────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const handler = handlers[interaction.commandName];
  if (!handler) {
    return interaction.reply({ content: '❌ Unknown command.', flags: 64 });
  }
  try {
    await handler(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: '❌ An error occurred while running this command.', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// Track messages for leaderboard (ignore bots)
client.on('messageCreate', message => {
  if (message.author.bot || !message.guild) return;
  incrementMessageCount(message.guild.id, message.author.id);
});

// Track deleted messages for /snipe
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
    author.displayAvatarURL(),
  );
});

// ─── Express Health Server ────────────────────────────────────────────────────

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: client.isReady() ? 'online' : 'connecting',
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.redirect('/health');
});

app.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err.message);
  process.exit(1);
});
