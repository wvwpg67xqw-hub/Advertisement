import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import discordPkg from 'discord.js';
const { REST, Routes } = discordPkg;

import client from './botClient.js';
import db from './db.js';
import { getClientIp, ipBlacklistMiddleware, rateLimit, checkVpn, isDiscordBot, sendBreachAlert } from './security.js';
import applicationRoutes from './routes/applications.js';
import adminRoutes from './routes/admin.js';
import { setDiscordClient } from './routes/admin.js';

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
} from './src/commands.js';

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
} from './src/setup.js';

import {
  incrementMessageCount,
  isAdChannel,
  trackAdPost,
} from './src/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 25849;

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI;
const TOKEN                 = process.env.TOKEN;
const CLIENT_ID             = process.env.CLIENT_ID;

// ── Express Setup ─────────────────────────────────────────────────────────────

const app = express();

// Trust first proxy (FeatherPanel / Replit reverse proxy) for real IPs
app.set('trust proxy', 1);

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cors({ origin: true, credentials: true }));

// Session — secure cookie in production, httpOnly always
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Global Security Middleware ────────────────────────────────────────────────

// Block IP-blacklisted addresses immediately
app.use(ipBlacklistMiddleware);

// Global rate limit: 150 req / 15 min per IP (basic DDoS mitigation)
app.use(rateLimit('global', 150, 15 * 60 * 1000));

// ── Seed initial admin from env ───────────────────────────────────────────────

const ADMIN_ID       = process.env.ADMIN_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Owner';
if (ADMIN_ID) {
  try {
    db.seedAdmin(ADMIN_ID, ADMIN_USERNAME, 'owner');
    console.log(`✅ Admin seeded: ${ADMIN_USERNAME} (${ADMIN_ID})`);
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

// ── Discord OAuth ─────────────────────────────────────────────────────────────

// Stricter rate limit on login entry point
app.get('/api/auth/login', rateLimit('login', 20, 15 * 60 * 1000), (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send('Discord OAuth not configured. Set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI.');
  }

  // CSRF protection: generate a random state, store in session
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/auth/callback', rateLimit('oauth_cb', 20, 15 * 60 * 1000), async (req, res) => {
  const { code, state } = req.query;
  const ip = getClientIp(req);

  if (!code) return res.redirect('/?error=no_code');

  // CSRF state check
  if (!state || state !== req.session.oauthState) {
    await sendBreachAlert({ type: 'OAuth CSRF Attempt', ip, detail: 'State parameter mismatch', userId: null, username: null });
    return res.redirect('/?error=invalid_state');
  }
  delete req.session.oauthState;

  // IP blacklist double-check at login
  if (db.isIpBlacklisted(ip)) {
    return res.redirect('/?error=access_denied');
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return res.redirect('/?error=token_failed');
    }
    const { access_token } = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return res.redirect('/?error=user_fetch_failed');
    const discordUser = await userRes.json();

    // Block Discord bot accounts
    if (isDiscordBot(discordUser)) {
      console.warn(`🚫 Bot account login attempt: ${discordUser.id}`);
      await sendBreachAlert({
        type: 'Bot Account Login Attempt',
        ip,
        detail: `Discord bot account tried to log in: ${discordUser.username} (${discordUser.id})`,
        userId: discordUser.id,
        username: discordUser.username,
      });
      return res.redirect('/?error=bots_not_allowed');
    }

    // Block blacklisted users
    if (db.isBlacklisted(discordUser.id)) {
      console.warn(`🚫 Blacklisted user login attempt: ${discordUser.id}`);
      await sendBreachAlert({
        type: 'Blacklisted User Login',
        ip,
        detail: `Blacklisted user attempted login: ${discordUser.username} (${discordUser.id})`,
        userId: discordUser.id,
        username: discordUser.username,
      });
      return res.redirect('/?error=blacklisted');
    }

    // VPN / proxy check — runs async, blocks if detected
    const vpnDetected = await checkVpn(ip);
    if (vpnDetected) {
      console.warn(`🚫 VPN/proxy login attempt from ${ip} by ${discordUser.username}`);
      await sendBreachAlert({
        type: 'VPN / Proxy Login Attempt',
        ip,
        detail: `User attempted to log in through a VPN or proxy: ${discordUser.username} (${discordUser.id})`,
        userId: discordUser.id,
        username: discordUser.username,
      });
      return res.redirect('/?error=vpn_not_allowed');
    }

    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 6n)}.png`;

    const user = { userId: discordUser.id, username: discordUser.username, avatar };

    db.upsertUser(user.userId, user.username, user.avatar);

    req.session.user = user;
    // Regenerate session ID on login to prevent session fixation
    req.session.regenerate((err) => {
      if (err) console.error('Session regenerate error:', err);
      req.session.user = user;
      res.redirect('/');
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=oauth_error');
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const admin = db.getAdmin(req.session.user.userId);
  res.json({ ...req.session.user, isAdmin: !!admin });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Public: active application roles ─────────────────────────────────────────

app.get('/api/roles', (req, res) => {
  res.json(db.getActiveRoles());
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), guilds: client.guilds?.cache?.size ?? 0 });
});

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

// ── Serve React build ─────────────────────────────────────────────────────────

const clientDist = join(__dirname, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send(`<html><body style="background:#0b0b10;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
    <h1>⚙️ Discord Staff Portal</h1>
    <p>API is running. Build the frontend with <code>npm run build</code> then restart.</p>
    <p><a href="/api/roles" style="color:#6c63ff">/api/roles</a> · <a href="/health" style="color:#6c63ff">/health</a></p>
  </body></html>`));
}

// ── Start HTTP server ─────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Staff Portal running on port ${PORT}`);
});

// ── Discord Bot Setup ─────────────────────────────────────────────────────────

const botHandlers = {
  setup: handleSetup,
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

  warn: handleWarn,
  warns: handleWarns,
  'warn-leaderboard': handleWarnLeaderboard,
  'ad-warn': handleAdWarn,
  'remove-ad-warn': handleRemoveAdWarn,

  mute: handleMute,
  unmute: handleUnmute,
  ban: handleBan,
  fire: handleFire,
  promote: handlePromote,
  'demote-user': handleDemoteUser,

  strike: handleStrike,
  'strike-remove': handleStrikeRemove,

  jail: handleJail,
  unjail: handleUnjail,

  'ban-request': handleBanRequest,
  'blacklist-request': handleBlacklistRequest,
  'network-ban-request': handleNetworkBanRequest,
  'partnership-request': handlePartnershipRequest,

  messages: handleMessages,
  'message-leaderboard': handleMessageLeaderboard,
  'case-info': handleCaseInfo,
  balance: handleBalance,
  snipe: handleSnipe,

  'current-breaks': handleCurrentBreaks,
  break: handleBreak,
  'break-end': handleBreakEnd,

  'reset-messages': handleResetMessages,
  'reset-messages-all': handleResetMessagesAll,
};

// ── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;

      // ── Security alert actions (owner DM buttons) ──────────────────────────
      if (id.startsWith('sec_bl_')) {
        const targetUserId = id.slice(7);
        if (!targetUserId || targetUserId === 'none') {
          return interaction.reply({ content: '⚠️ No user ID to blacklist', ephemeral: true });
        }
        const admin = db.getAdmin(interaction.user.id);
        if (!admin) return interaction.reply({ content: '❌ Not authorized', ephemeral: true });
        try {
          db.insertBlacklist(targetUserId, 'Unknown', 'Security alert — blacklisted via DM button');
          console.log(`🚫 User ${targetUserId} blacklisted via security DM button by ${interaction.user.id}`);
          return interaction.reply({ content: `✅ User \`${targetUserId}\` has been blacklisted from the portal.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ User \`${targetUserId}\` was already blacklisted.`, ephemeral: true });
        }
      }

      if (id.startsWith('sec_ipbl_')) {
        const ip = id.slice(9);
        const admin = db.getAdmin(interaction.user.id);
        if (!admin) return interaction.reply({ content: '❌ Not authorized', ephemeral: true });
        try {
          db.addIpBlacklist(ip, 'Security alert — IP banned via DM button', interaction.user.id);
          console.log(`🚫 IP ${ip} blacklisted via security DM button by ${interaction.user.id}`);
          return interaction.reply({ content: `✅ IP \`${ip}\` has been blacklisted.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ IP \`${ip}\` was already blacklisted.`, ephemeral: true });
        }
      }

      if (id === 'sec_dismiss') {
        return interaction.reply({ content: '✅ Alert dismissed.', ephemeral: true });
      }

      // ── Application review buttons ─────────────────────────────────────────
      if (id.startsWith('app_')) {
        const [, action, appId] = id.split('_');
        const application = db.getApplication(Number(appId));

        if (!application) {
          return interaction.reply({ content: '❌ Application not found', ephemeral: true });
        }

        if (action === 'accept') {
          db.updateApplicationStatus(Number(appId), 'accepted');
          return interaction.reply({ content: `✅ Accepted application #${appId}`, ephemeral: true });
        }

        if (action === 'deny') {
          db.updateApplicationStatus(Number(appId), 'denied');
          return interaction.reply({ content: `❌ Denied application #${appId}`, ephemeral: true });
        }
      }

      if (handleRequestButton) {
        await handleRequestButton(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const handler = botHandlers[interaction.commandName];
    if (!handler) {
      return interaction.reply({ content: '❌ Unknown command', ephemeral: true });
    }

    await handler(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ An error occurred', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      interaction.followUp(msg).catch(() => {});
    } else {
      interaction.reply(msg).catch(() => {});
    }
  }
});

// ── Message Tracking ──────────────────────────────────────────────────────────

client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  incrementMessageCount(msg.guild.id, msg.author.id);
  if (isAdChannel(msg.guild.id, msg.channel.id)) {
    trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);
  }
});

// ── Bot Ready ─────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  setDiscordClient(client);

  if (CLIENT_ID) {
    try {
      const rest = new REST({ version: '10' }).setToken(TOKEN);
      const allCommands = [...commandDefs, ...setupCommands].map(c => c.toJSON());
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allCommands });
      console.log(`✅ Registered ${allCommands.length} slash commands globally`);
    } catch (err) {
      console.error('❌ Failed to register commands:', err.message);
    }
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────

if (TOKEN) {
  client.login(TOKEN).catch(err => {
    console.error('❌ Discord login failed:', err.message);
  });
} else {
  console.warn('⚠️  TOKEN not set — Discord bot will not start. Add TOKEN to your environment secrets.');
}
