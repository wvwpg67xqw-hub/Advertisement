import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import discordPkg from 'discord.js';
const { REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordPkg;

import client from './botClient.js';
import db from './db.js';
import { sendDM } from './dmRest.js';
import { getClientIp, ipBlacklistMiddleware, rateLimit, checkVpn, isDiscordBot, sendBreachAlert } from './security.js';
import applicationRoutes from './routes/applications.js';
import adminRoutes from './routes/admin.js';
import { setDiscordClient } from './routes/admin.js';

import {
  commandDefs, handleWarn, handleWarns, handleWarnLeaderboard,
  handleAdWarn, handleRemoveAdWarn, handleMute, handleUnmute,
  handleBan, handleFire, handlePromote, handleDemoteUser,
  handleStrike, handleStrikeRemove, handleJail, handleUnjail,
  handleBanRequest, handleBlacklistRequest, handleNetworkBanRequest,
  handlePartnershipRequest, handleMessages, handleMessageLeaderboard,
  handleCaseInfo, handleBalance, handleSnipe, handleCurrentBreaks,
  handleBreak, handleBreakEnd, handleResetMessages, handleResetMessagesAll,
  handleNetworkBan, handleNetworkUnban, handleRequestButton,
} from './src/commands.js';

import {
  setupCommands, handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
  handleSetupRequests, handleSetupNetworkHub, handleSetupNetworkJoin,
  handleSetupNetworkReset, handleNetworkStatus, handleSetupAdChannels,
} from './src/setup.js';

import { incrementMessageCount, isAdChannel, trackAdPost } from './src/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 25849;

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI;
const TOKEN                 = process.env.TOKEN;
const CLIENT_ID             = process.env.CLIENT_ID;

// Owner ID — receives all login/appeal/security DMs
const OWNER_ID = process.env.OWNER_ID || '1453592157607825595';

// ── Express Setup ─────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cors({ origin: true, credentials: true }));

const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── Global Security Middleware ────────────────────────────────────────────────

app.use(ipBlacklistMiddleware);
app.use(rateLimit('global', 150, 15 * 60 * 1000));

// ── Seed Owner as Admin ───────────────────────────────────────────────────────

try { db.seedAdmin(OWNER_ID, process.env.ADMIN_USERNAME || 'Owner', 'owner'); } catch {}
if (process.env.ADMIN_ID && process.env.ADMIN_ID !== OWNER_ID) {
  try { db.seedAdmin(process.env.ADMIN_ID, process.env.ADMIN_USERNAME || 'Owner', 'owner'); } catch {}
}

// ── DM Helpers (all use REST — no gateway dependency) ─────────────────────────

async function sendLoginAlert({ userId, username, avatar, isNew, isAdmin, isBlacklisted }) {
  if (userId === OWNER_ID) return; // don't alert on owner's own logins

  const DISCORD_EPOCH = 1420070400000n;
  const createdAt = new Date(Number((BigInt(userId) >> 22n) + DISCORD_EPOCH));
  const days = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
  const accountAge = days > 365 ? `${Math.floor(days/365)}y ${Math.floor((days%365)/30)}m` : `${days} days`;

  const statusBadge = isBlacklisted ? '🚫 BANNED' : isAdmin ? '🛡️ Admin' : '👤 Member';

  const embed = new EmbedBuilder()
    .setTitle(`${isNew ? '🆕 New User Joined' : '🔄 User Logged In'}: ${username}`)
    .setColor(isBlacklisted ? 0xff3333 : isNew ? 0x22c55e : 0x5865f2)
    .setThumbnail(avatar)
    .addFields(
      { name: '👤 User',         value: `**${username}**\n\`${userId}\``,          inline: true  },
      { name: '📋 Status',       value: statusBadge,                                inline: true  },
      { name: '🗓️ Account Age', value: accountAge,                                 inline: true  },
      { name: '🕒 Time',         value: `<t:${Math.floor(Date.now()/1000)}:F>`,    inline: false },
    )
    .setFooter({ text: 'Staff Portal · Login Alert' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`portal_admin_${userId}`)
      .setLabel(isAdmin ? '🛡️ Remove Admin' : '🛡️ Make Admin')
      .setStyle(isAdmin ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`portal_ban_${userId}`)
      .setLabel('🚫 Ban User')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!!isBlacklisted),
  );

  const ok = await sendDM(OWNER_ID, {
    embeds: [embed.toJSON()],
    components: [row.toJSON()],
  });
  if (ok) console.log(`📬 Login alert sent for ${username} (${userId})`);
}

async function sendAppealAlert({ appealId, userId, username, avatar, reason, banReason }) {
  const embed = new EmbedBuilder()
    .setTitle(`📬 Ban Appeal #${appealId} — ${username}`)
    .setColor(0xf59e0b)
    .setThumbnail(avatar)
    .addFields(
      { name: '👤 User',          value: `**${username}**\n\`${userId}\``,  inline: true  },
      { name: '🔢 Appeal #',      value: String(appealId),                   inline: true  },
      { name: '🚫 Ban Reason',    value: banReason || 'No reason recorded',  inline: false },
      { name: '📝 Appeal Reason', value: reason.slice(0, 1024),              inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Ban Appeals' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_accept_${appealId}`)
      .setLabel('✅ Accept — Unban')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`appeal_deny_${appealId}`)
      .setLabel('❌ Deny Appeal')
      .setStyle(ButtonStyle.Danger),
  );

  await sendDM(OWNER_ID, {
    embeds: [embed.toJSON()],
    components: [row.toJSON()],
  });
}

// ── Discord OAuth ─────────────────────────────────────────────────────────────

app.get('/api/auth/login', rateLimit('login', 20, 15 * 60 * 1000), (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send('Discord OAuth not configured. Set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI.');
  }
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

  if (!state || state !== req.session.oauthState) {
    sendBreachAlert({ type: 'OAuth CSRF Attempt', ip, detail: 'State mismatch on callback', userId: null, username: null });
    return res.redirect('/?error=invalid_state');
  }
  delete req.session.oauthState;

  if (db.isIpBlacklisted(ip)) return res.redirect('/?error=access_denied');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI,
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

    // Block bot accounts
    if (isDiscordBot(discordUser)) {
      sendBreachAlert({ type: 'Bot Account Login Attempt', ip, detail: `${discordUser.username} (${discordUser.id})`, userId: discordUser.id, username: discordUser.username });
      return res.redirect('/?error=bots_not_allowed');
    }

    // VPN / proxy check
    const vpnDetected = await checkVpn(ip);
    if (vpnDetected) {
      sendBreachAlert({ type: 'VPN/Proxy Login Attempt', ip, detail: `${discordUser.username} (${discordUser.id})`, userId: discordUser.id, username: discordUser.username });
      return res.redirect('/?error=vpn_not_allowed');
    }

    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 6n)}.png`;

    const isBlacklisted = db.isBlacklisted(discordUser.id);
    const isAdmin       = !!db.getAdmin(discordUser.id);
    const { isNew }     = db.upsertUser(discordUser.id, discordUser.username, avatar);

    const user = { userId: discordUser.id, username: discordUser.username, avatar, isBlacklisted };

    // Fire login alert DM (non-blocking)
    sendLoginAlert({ userId: discordUser.id, username: discordUser.username, avatar, isNew, isAdmin, isBlacklisted })
      .catch(err => console.error('Login alert failed:', err.message));

    req.session.regenerate((err) => {
      if (err) console.error('Session regenerate error:', err);
      req.session.user = user;
      res.redirect(isBlacklisted ? '/appeal' : '/');
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=oauth_error');
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const { userId } = req.session.user;
  const admin = db.getAdmin(userId);
  const blacklisted = db.isBlacklisted(userId);
  req.session.user.isBlacklisted = blacklisted;
  res.json({ ...req.session.user, isAdmin: !!admin, isBlacklisted: blacklisted });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Public: active application roles ─────────────────────────────────────────

app.get('/api/roles', (req, res) => res.json(db.getActiveRoles()));

// ── Ban Appeals ───────────────────────────────────────────────────────────────

function requireBlacklisted(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!db.isBlacklisted(req.session.user.userId)) return res.status(403).json({ error: 'You are not banned.' });
  next();
}

app.get('/api/appeals/mine', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const appeal = db.getUserAppeal(req.session.user.userId);
  if (!appeal) return res.status(404).json({ error: 'No appeal found' });
  res.json(appeal);
});

app.post('/api/appeals', requireBlacklisted, rateLimit('appeals', 2, 24 * 60 * 60 * 1000), async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Appeal reason required' });
  if (reason.length > 2000) return res.status(400).json({ error: 'Appeal too long (max 2000 chars)' });

  const { userId, username, avatar } = req.session.user;

  const existing = db.getUserAppeal(userId);
  if (existing?.status === 'pending') return res.status(409).json({ error: 'You already have a pending appeal.' });
  if (existing?.status === 'denied')  return res.status(403).json({ error: 'Your appeal was already denied.' });

  const banEntry = db.getBlacklistEntry(userId);
  const { id: appealId } = db.insertAppeal({ userId, username, avatar, reason: reason.trim() });

  sendAppealAlert({ appealId, userId, username, avatar, reason: reason.trim(), banReason: banEntry?.reason })
    .catch(err => console.error('Appeal alert failed:', err.message));

  res.json({ success: true, appealId });
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
  app.get('/', (_req, res) => res.send(`<html><body style="background:#0b0b10;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h1>⚙️ Discord Staff Portal</h1><p>Build client: <code>npm run build</code></p></body></html>`));
}

// ── Start HTTP server ─────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Staff Portal running on port ${PORT}`));

// ── Discord Bot Setup ─────────────────────────────────────────────────────────

const botHandlers = {
  setup: handleSetup, 'setup-roles': handleSetupRoles, 'setup-roles-extra': handleSetupRolesExtra,
  'setup-status': handleSetupStatus, 'setup-edit': handleSetupEdit, 'setup-roles-wizard': handleSetupRolesWizard,
  'setup-requests': handleSetupRequests, 'setup-ad-channels': handleSetupAdChannels,
  'setup-network-hub': handleSetupNetworkHub, 'setup-network-join': handleSetupNetworkJoin,
  'setup-network-reset': handleSetupNetworkReset, 'network-status': handleNetworkStatus,
  'network-ban': handleNetworkBan, 'network-unban': handleNetworkUnban,
  warn: handleWarn, warns: handleWarns, 'warn-leaderboard': handleWarnLeaderboard,
  'ad-warn': handleAdWarn, 'remove-ad-warn': handleRemoveAdWarn,
  mute: handleMute, unmute: handleUnmute, ban: handleBan, fire: handleFire,
  promote: handlePromote, 'demote-user': handleDemoteUser,
  strike: handleStrike, 'strike-remove': handleStrikeRemove,
  jail: handleJail, unjail: handleUnjail,
  'ban-request': handleBanRequest, 'blacklist-request': handleBlacklistRequest,
  'network-ban-request': handleNetworkBanRequest, 'partnership-request': handlePartnershipRequest,
  messages: handleMessages, 'message-leaderboard': handleMessageLeaderboard,
  'case-info': handleCaseInfo, balance: handleBalance, snipe: handleSnipe,
  'current-breaks': handleCurrentBreaks, break: handleBreak, 'break-end': handleBreakEnd,
  'reset-messages': handleResetMessages, 'reset-messages-all': handleResetMessagesAll,
};

// ── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    // If guild isn't in cache yet (e.g. bot just restarted), fetch it before proceeding
    if (interaction.guildId && !interaction.guild) {
      try { await client.guilds.fetch(interaction.guildId); } catch {}
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      // All portal/appeal/security DM buttons are owner-only
      if (id.startsWith('portal_') || id.startsWith('appeal_') || id.startsWith('sec_')) {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: '❌ Only the portal owner can use these buttons.', flags: 64 });
        }
      }

      // ── Portal: Toggle Admin ───────────────────────────────────────────────
      if (id.startsWith('portal_admin_')) {
        const targetId = id.slice(13);
        const existing = db.getAdmin(targetId);
        if (existing) {
          db.deleteAdminByUserId(targetId);
          return interaction.reply({ content: `✅ Admin access removed from \`${targetId}\`.`, ephemeral: true });
        }
        const { readCol } = await import('./jsondb.js');
        const u = readCol('users').find(r => r.userId === targetId);
        try {
          db.insertAdmin(targetId, u?.username || 'Unknown', 'admin');
          return interaction.reply({ content: `✅ **${u?.username || targetId}** is now a portal admin.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ Already an admin.`, ephemeral: true });
        }
      }

      // ── Portal: Ban User ───────────────────────────────────────────────────
      if (id.startsWith('portal_ban_')) {
        const targetId = id.slice(11);
        const { readCol } = await import('./jsondb.js');
        const u = readCol('users').find(r => r.userId === targetId);
        try {
          db.insertBlacklist(targetId, u?.username || 'Unknown', 'Banned via login alert DM');
          return interaction.reply({ content: `🚫 **${u?.username || targetId}** has been banned from the portal.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ That user is already banned.`, ephemeral: true });
        }
      }

      // ── Security: Blacklist User ───────────────────────────────────────────
      if (id.startsWith('sec_bl_')) {
        const targetId = id.slice(7);
        if (!targetId || targetId === 'none') return interaction.reply({ content: '⚠️ No user ID available.', ephemeral: true });
        try {
          db.insertBlacklist(targetId, 'Unknown', 'Security alert — blacklisted via DM');
          return interaction.reply({ content: `✅ \`${targetId}\` blacklisted.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ Already blacklisted.`, ephemeral: true });
        }
      }

      // ── Security: IP Blacklist ─────────────────────────────────────────────
      if (id.startsWith('sec_ipbl_')) {
        const ip = id.slice(9);
        try {
          db.addIpBlacklist(ip, 'Security alert — IP banned via DM', interaction.user.id);
          return interaction.reply({ content: `✅ IP \`${ip}\` blacklisted.`, ephemeral: true });
        } catch {
          return interaction.reply({ content: `⚠️ IP already blacklisted.`, ephemeral: true });
        }
      }

      if (id === 'sec_dismiss') {
        return interaction.reply({ content: '✅ Dismissed.', ephemeral: true });
      }

      // ── Appeal: Accept ─────────────────────────────────────────────────────
      if (id.startsWith('appeal_accept_')) {
        const appealId = Number(id.slice(14));
        const appeal = db.getAppeal(appealId);
        if (!appeal) return interaction.reply({ content: '❌ Appeal not found.', ephemeral: true });
        if (appeal.status !== 'pending') return interaction.reply({ content: `⚠️ Already ${appeal.status}.`, ephemeral: true });
        db.updateAppealStatus(appealId, 'accepted');
        db.deleteBlacklistByUserId(appeal.userId);
        return interaction.reply({ content: `✅ Appeal #${appealId} accepted. **${appeal.username}** has been unbanned.`, ephemeral: true });
      }

      // ── Appeal: Deny ───────────────────────────────────────────────────────
      if (id.startsWith('appeal_deny_')) {
        const appealId = Number(id.slice(12));
        const appeal = db.getAppeal(appealId);
        if (!appeal) return interaction.reply({ content: '❌ Appeal not found.', ephemeral: true });
        if (appeal.status !== 'pending') return interaction.reply({ content: `⚠️ Already ${appeal.status}.`, ephemeral: true });
        db.updateAppealStatus(appealId, 'denied');
        return interaction.reply({ content: `❌ Appeal #${appealId} denied. **${appeal.username}** stays banned.`, ephemeral: true });
      }

      // ── Application review ─────────────────────────────────────────────────
if (id.startsWith('app_')) {
  const parts = id.split('_');
  const action = parts[1];
  const appId = parts[2];

  const application = db.getApplication(Number(appId));

  if (!application) {
    return interaction.reply({
      content: '❌ Application not found',
      ephemeral: true
    });
  }

  // MAIN SERVER ID
  const guildId = process.env.MAIN_GUILD_ID;

  const STAFF_ROLE_ID       = '1501682950331301908';

  // ROLE MAP — main role, team role
  const roleMap = {
    Moderator:   { role: '1495222811755806740', team: '1501681813398093955' },
    HR:          { role: '1495222820400009246', team: '1501681511324451028' },
    Partnership: { role: '1495222796517773335', team: '1501681321343193160' },
  };

  // ── ACCEPT APPLICATION ─────────────────────────────
  if (action === 'accept') {

    db.updateApplicationStatus(Number(appId), 'accepted');

    try {
      const guild = await client.guilds.fetch(guildId);

      const member = await guild.members
        .fetch(application.userId)
        .catch(() => null);

      if (member) {
        const roles = roleMap[application.role];
        const toAdd = [STAFF_ROLE_ID];
        if (roles?.role) toAdd.push(roles.role);
        if (roles?.team) toAdd.push(roles.team);
        await member.roles.add(toAdd).catch(e => console.error('Role add failed:', e.message));

        await member.send({
          content: `✅ Your application for **${application.role}** has been accepted!`
        }).catch(() => null);
      }

    } catch (err) {
      console.error('Role assignment failed:', err);
    }

    return interaction.reply({
      content: `✅ Accepted #${appId} and role assigned.`,
      ephemeral: true
    });
  }

  // ── DENY APPLICATION ─────────────────────────────
  if (action === 'deny') {

    db.updateApplicationStatus(Number(appId), 'denied');

    try {
      const guild = await client.guilds.fetch(guildId);

      const member = await guild.members
        .fetch(application.userId)
        .catch(() => null);

      if (member) {
        await member.send({
          content: `❌ Your application for **${application.role}** was denied.`
        }).catch(() => null);
      }

    } catch (err) {
      console.error(err);
    }

    return interaction.reply({
      content: `❌ Denied #${appId}`,
      ephemeral: true
    });
  }
}

    } // end isButton()

    if (interaction.isCommand()) {
      const name = interaction.commandName;
      const handler = botHandlers[name];
      if (handler) {
        await handler(interaction);
      } else if (setupCommands.some(c => c.name === name)) {
        // handled by setup handlers above via botHandlers mapping
      }
    }

    if (handleRequestButton) await handleRequestButton(interaction);
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      }
    } catch {}
  }
});

// ── Message Tracking ──────────────────────────────────────────────────────────

client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  incrementMessageCount(msg.guild.id, msg.author.id);
  if (isAdChannel(msg.guild.id, msg.channel.id)) trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);
});

// ── Bot Ready ─────────────────────────────────────────────────────────────────

client.once('clientReady', async () => {
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
  client.login(TOKEN).catch(err => console.error('❌ Discord login failed:', err.message));
} else {
  console.warn('⚠️  TOKEN not set — Discord bot will not start. Add TOKEN to Secrets.');
}
