import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import discordPkg from 'discord.js';
const { REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = discordPkg;

import client from './botClient.js';
import db from './db.js';
import { sendDM } from './dmRest.js';
import { getClientIp, ipBlacklistMiddleware, rateLimit, checkVpn, isDiscordBot, sendBreachAlert } from './security.js';
import applicationRoutes from './routes/applications.js';
import adminRoutes from './routes/admin.js';
import { setDiscordClient } from './routes/admin.js';
import staffRoutes from './routes/staff.js';
import { setStaffDiscordClient } from './routes/staff.js';

import {
  commandDefs, handleWarn, handleWarns, handleWarnLeaderboard,
  handleAdWarn, handleRemoveAdWarn, handleRemoveWarn, handleMute, handleUnmute,
  handleBan, handleFire, handlePromote, handleDemoteUser,
  handleStrike, handleStrikeRemove, handleJail, handleUnjail,
  handleBanRequest, handleBlacklistRequest, handleNetworkBanRequest,
  handlePartnershipRequest, handleMessages, handleMessageLeaderboard,
  handleCaseInfo, handleBalance, handleSnipe, handleCurrentBreaks,
  handleBreakRequest, handleBreakEnd, handleManageBreak,
  handleResetMessages, handleResetMessagesAll, handleReleaseNotes, handleAddBalance,
  handleNetworkBan, handleNetworkUnban, handleRequestButton,
  handleResignRequest, handleApply, handleUpdate,
  handleSetupNetworkApply, handleNetworkApplyPost,
  handleToggleLeveling, handleLevel, handleLevelLeaderboard, handleAddXp, handleRemoveXp, handleAddLevel, handleSetLevel,
  handleModGuide, handleModGuideButton,
  handleStatus, handleActivity,
} from './src/commands/index.js';

import {
  setupCommands, handleSetup, handleSetupRoles, handleSetupRolesExtra,
  handleSetupStatus, handleSetupEdit, handleSetupRolesWizard,
  handleSetupRequests, handleSetupNetworkHub, handleSetupNetworkJoin,
  handleSetupNetworkReset, handleNetworkStatus, handleSetupAdChannels,
  handleSetupBreak, handleSetupRolesBulk, handleSetupResign, handleSetupBranding,
  handleToggleCommand, handleSetupNetworkRoles, handleSetupStaffRoles, handleSetupGithub,
} from './src/setup.js';

import { incrementMessageCount, isAdChannel, trackAdPost, getGuild as getBotGuild, setSnipeCache, addUserXp, computeLevel, xpForLevel, isCommandDisabled, disableCommand as dbDisableCmd, enableCommand as dbEnableCmd, getDisabledCommands as dbGetDisabledCmds, setGuildConfig as dbSetGuildConfig, getNetworkHub, autoLinkGuilds, getAutoReact, setAutoReact, clearAutoReact, getBalance, setBalance } from './src/database.js';
import { initDatabase } from './mysqldb.js';
import { sendLog, buildStaffUpdateEmbed, getStaffRank } from './src/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In-memory state for pending application approvals (role selection before confirm)
const pendingApprovals = new Map(); // key: `GUILDID_APPROVERID` → { applicantId, staffRoleId, teamRoleId }
const xpCooldowns = new Map(); // key: `${guildId}-${userId}` → last XP gain timestamp
const dmmedOwnerGuilds = new Set(); // guilds already DM'd about missing level log channel
const PORT = process.env.PORT || 5000;

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

const APP_CHANNEL_ID = '1503147704522637494';
const DISCORD_ADMIN_ROLE_ID = '1502041120849395775';

async function updateDiscordApplicationMessage(app, decision, reviewerDisplay) {
  if (!app?.discord_message_id) return;
  try {
    const channel = await client.channels.fetch(APP_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(app.discord_message_id).catch(() => null);
    if (!msg || msg.embeds.length === 0) return;
    const accepted = decision === 'accepted';
    const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
      .setColor(accepted ? 0x22c55e : 0xef4444)
      .addFields({
        name: accepted ? '✅ Accepted' : '❌ Denied',
        value: `by ${reviewerDisplay}`,
        inline: false,
      });
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_accept_${app.id}`)
        .setLabel(accepted ? '✅ Accepted' : '✅ Accept')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`app_deny_${app.id}`)
        .setLabel(!accepted ? '❌ Denied' : '❌ Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );
    await msg.edit({ embeds: [updatedEmbed], components: [disabledRow] }).catch(() => null);
  } catch (err) {
    console.error('updateDiscordApplicationMessage error:', err.message);
  }
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
    scope: 'identify guilds.join',
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
    let isAdmin         = !!db.getAdmin(discordUser.id);
    const { isNew }     = db.upsertUser(discordUser.id, discordUser.username, avatar);

    // Auto-grant admin if user has the designated admin Discord role
    if (!isAdmin && DISCORD_ADMIN_ROLE_ID && client.isReady()) {
      try {
        const adminGuildId = process.env.MAIN_GUILD_ID;
        if (adminGuildId) {
          const adminGuild = await client.guilds.fetch(adminGuildId).catch(() => null);
          const adminMember = adminGuild ? await adminGuild.members.fetch(discordUser.id).catch(() => null) : null;
          if (adminMember?.roles.cache.has(DISCORD_ADMIN_ROLE_ID)) {
            try { db.insertAdmin(discordUser.id, discordUser.username, 'admin'); } catch {}
            isAdmin = true;
          }
        }
      } catch {}
    }

    const user = { userId: discordUser.id, username: discordUser.username, avatar, isBlacklisted };

    // Auto-add user to staff server (non-blocking)
    const STAFF_SERVER     = process.env.STAFF_SERVER;
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    if (STAFF_SERVER && DISCORD_BOT_TOKEN) {
      fetch(`https://discord.com/api/v10/guilds/${STAFF_SERVER}/members/${discordUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token }),
      }).then(r => {
        if (r.status === 201) console.log(`[guild-join] Added ${discordUser.username} (${discordUser.id}) to staff server.`);
        else if (r.status === 204) console.log(`[guild-join] ${discordUser.username} (${discordUser.id}) already in staff server.`);
        else r.text().then(t => console.error(`[guild-join] Failed for ${discordUser.username}: ${r.status} ${t}`));
      }).catch(err => console.error(`[guild-join] Error adding ${discordUser.username}:`, err.message));
    }

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

// ── Public: bot guilds (excluding staff server) ───────────────────────────────

app.get('/api/bot/guilds', (req, res) => {
  if (!client.isReady()) return res.json([]);
  const exclude = new Set([
    process.env.STAFF_SERVER,
  ].filter(Boolean));
  const guilds = [...client.guilds.cache.values()]
    .filter(g => !exclude.has(g.id))
    .map(g => ({
      id: g.id,
      name: g.name,
      icon_url: g.iconURL({ size: 256, extension: 'png' }) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(guilds);
});

// ── Public: server branding ───────────────────────────────────────────────────

app.get('/api/branding', async (req, res) => {
  const guildId = process.env.MAIN_GUILD_ID;
  if (!guildId) return res.json({ pfp_url: null, banner_url: null, guild_name: null });
  try {
    const config = await getBotGuild(guildId);
    const guild  = client.guilds?.cache?.get(guildId);
    res.json({
      pfp_url:    config.pfp_url    || null,
      banner_url: config.banner_url || null,
      guild_name: guild?.name       || null,
    });
  } catch {
    res.json({ pfp_url: null, banner_url: null, guild_name: null });
  }
});

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
app.use('/api/staff', staffRoutes);

// ── Serve React build ─────────────────────────────────────────────────────────

const clientDist = join(__dirname, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1y', etag: false, index: false }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(clientDist, 'index.html'));
  });
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
  'setup-network-roles': handleSetupNetworkRoles,
  'setup-staff-roles': handleSetupStaffRoles,
  'setup-github': handleSetupGithub,
  'setup-break': handleSetupBreak, 'setup-roles-bulk': handleSetupRolesBulk, 'setup-resign': handleSetupResign,
  'setup-branding': handleSetupBranding,
  'network-ban': handleNetworkBan, 'network-unban': handleNetworkUnban,
  warn: handleWarn, warns: handleWarns, 'warn-leaderboard': handleWarnLeaderboard,
  'remove-warn': handleRemoveWarn,
  'ad-warn': handleAdWarn, 'remove-ad-warn': handleRemoveAdWarn,
  mute: handleMute, unmute: handleUnmute, ban: handleBan, fire: handleFire,
  promote: handlePromote, 'demote-user': handleDemoteUser,
  strike: handleStrike, 'strike-remove': handleStrikeRemove,
  jail: handleJail, unjail: handleUnjail,
  'ban-request': handleBanRequest, 'blacklist-request': handleBlacklistRequest,
  'network-ban-request': handleNetworkBanRequest, 'partnership-request': handlePartnershipRequest,
  messages: handleMessages, 'message-leaderboard': handleMessageLeaderboard,
  'case-info': handleCaseInfo, balance: handleBalance, snipe: handleSnipe,
  'current-breaks': handleCurrentBreaks, 'break-request': handleBreakRequest, 'break-end': handleBreakEnd, 'manage-break': handleManageBreak,
  'reset-messages': handleResetMessages, 'reset-messages-all': handleResetMessagesAll, 'release-notes': handleReleaseNotes,
  addbalance: handleAddBalance,
  'resign-request': handleResignRequest, apply: handleApply, update: handleUpdate,
  'setup-network-apply': handleSetupNetworkApply,
  'network-apply-post': handleNetworkApplyPost,
  level: handleLevel, 'level-leaderboard': handleLevelLeaderboard,
  'add-xp': handleAddXp, 'remove-xp': handleRemoveXp,
  'add-level': handleAddLevel, 'set-level': handleSetLevel,
  'toggle-command': handleToggleCommand,
  'toggle-leveling': handleToggleLeveling,
  modguide: handleModGuide,
  status: handleStatus,
  activity: handleActivity,
};

// ── Owner Command Panel ───────────────────────────────────────────────────────

const PANEL_CMD_ROWS = [
  ['warn', 'ad-warn', 'mute', 'ban', 'fire'],
  ['promote', 'demote-user', 'strike', 'jail', 'unjail'],
  ['ban-request', 'blacklist-request', 'network-ban-request', 'partnership-request'],
  ['add-xp', 'remove-xp', 'add-level', 'set-level'],
];

async function buildOwnerPanel(guildId) {
  const config = await getBotGuild(guildId).catch(() => null);
  const disabledList = await dbGetDisabledCmds(guildId).catch(() => []);
  const disabled = new Set(disabledList);
  const guild = client.guilds.cache.get(guildId);
  const guildName = guild?.name || `Guild ${guildId}`;
  const levelingOn = config?.leveling_enabled !== 0;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`⚙️ Command Panel — ${guildName}`)
    .setDescription([
      `**Guild ID:** \`${guildId}\``,
      `**Leveling:** ${levelingOn ? '✅ Active' : '❌ Paused'}`,
      `**Disabled:** ${disabled.size > 0 ? [...disabled].map(c => `\`/${c}\``).join(', ') : 'None'}`,
    ].join('\n'))
    .setFooter({ text: 'Green = enabled  ·  Red = disabled  ·  Click to toggle' })
    .setTimestamp();

  const cmdRows = PANEL_CMD_ROWS.map(cmds =>
    new ActionRowBuilder().addComponents(
      cmds.map(cmd =>
        new ButtonBuilder()
          .setCustomId(`ownertgl:${guildId}:${cmd}`)
          .setLabel(cmd)
          .setStyle(disabled.has(cmd) ? ButtonStyle.Danger : ButtonStyle.Success)
      )
    )
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ownerlvl:${guildId}`)
      .setLabel(`Leveling ${levelingOn ? '✅ ON' : '❌ OFF'}`)
      .setStyle(levelingOn ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ownerref:${guildId}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [...cmdRows, controlRow] };
}

// ── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    // If guild isn't in cache yet (e.g. bot just restarted), fetch it before proceeding
    if (interaction.guildId && !interaction.guild) {
      try { await client.guilds.fetch(interaction.guildId); } catch {}
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      // ── Owner command panel buttons (works in DMs) ─────────────────────────
      if (
        interaction.user.id === OWNER_ID &&
        (id.startsWith('ownertgl:') || id.startsWith('ownerlvl:') || id.startsWith('ownerref:'))
      ) {
        await interaction.deferUpdate();
        const parts = id.split(':');
        const guildId = parts[1];

        if (id.startsWith('ownertgl:')) {
          const commandName = parts.slice(2).join(':');
          const already = await dbGetDisabledCmds(guildId).catch(() => []);
          if (already.includes(commandName)) {
            await dbEnableCmd(guildId, commandName);
          } else {
            await dbDisableCmd(guildId, commandName);
          }
        } else if (id.startsWith('ownerlvl:')) {
          const cfg = await getBotGuild(guildId).catch(() => null);
          const nowOn = cfg?.leveling_enabled !== 0;
          await dbSetGuildConfig(guildId, { leveling_enabled: nowOn ? 0 : 1 });
        }
        // ownerref: just rebuilds the panel — no action needed

        const panel = await buildOwnerPanel(guildId);
        await interaction.editReply(panel);
        return;
      }

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

      // ── Break Request: Approve ─────────────────────────────────────────────
      if (id.startsWith('break_req_approve_')) {
        // ID format: break_req_approve_USERID_DAYS
        const rest = id.slice(18);
        const lastUnderscore = rest.lastIndexOf('_');
        const targetUserId = lastUnderscore > 0 ? rest.slice(0, lastUnderscore) : rest;
        const days = lastUnderscore > 0 ? parseInt(rest.slice(lastUnderscore + 1)) || 1 : 1;

        const { getGuild: getBG, startBreak: sbk, isOnBreak: iob } = await import('./src/database.js');

        if (await iob(interaction.guildId, targetUserId)) {
          return interaction.reply({ content: '⚠️ That staff member is already on break.', flags: 64 });
        }

        const config = await getBG(interaction.guildId);
        const staffGuild = interaction.guild;
        let member = null;
        try { member = await staffGuild.members.fetch(targetUserId); } catch {}

        let savedRoles = [];
        if (member) {
          savedRoles = member.roles.cache
            .filter(r => r.id !== staffGuild.id && !r.managed)
            .map(r => r.id);
          await member.roles.remove(savedRoles).catch(e => console.error('Break: role removal failed:', e.message));
          if (config.break_role_id) {
            await member.roles.add(config.break_role_id).catch(e => console.error('Break: break role add failed:', e.message));
          }
        }

        const mainGuildId = process.env.MAIN_GUILD_ID;
        if (mainGuildId && config.main_break_role_id) {
          try {
            const mainGuild = client.guilds.cache.get(mainGuildId) || await client.guilds.fetch(mainGuildId).catch(() => null);
            if (mainGuild) {
              const mainMember = await mainGuild.members.fetch(targetUserId).catch(() => null);
              if (mainMember) await mainMember.roles.add(config.main_break_role_id).catch(() => null);
            }
          } catch {}
        }

        const endAt = Math.floor(Date.now() / 1000) + days * 86400;
        const username = member?.user?.tag || targetUserId;
        await sbk(interaction.guildId, targetUserId, username, null, savedRoles, endAt);

        const { EmbedBuilder: EB2 } = discordPkg;
        const approvedEmbed = EB2.from(interaction.message.embeds[0])
          .setColor(0x22c55e)
          .addFields({ name: '✅ Approved', value: `by ${interaction.user.tag} — ends <t:${endAt}:F>`, inline: false });

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`break_req_approve_${targetUserId}_${days}`).setLabel('✅ Approved').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(`break_req_deny_${targetUserId}`).setLabel('❌ Deny Break').setStyle(ButtonStyle.Danger).setDisabled(true),
        );

        await interaction.update({ embeds: [approvedEmbed], components: [disabledRow] });

        try {
          const targetUser = member?.user || await client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            await targetUser.send({
              embeds: [new EB2()
                .setColor(0x22c55e)
                .setTitle('☕ Break Approved')
                .setDescription(`Your break request has been approved by **${interaction.user.tag}**.\n\n**Duration:** ${days} day${days !== 1 ? 's' : ''}\n**Ends:** <t:${endAt}:F>\n\nYour roles have been saved. Use \`/break-end\` to return early, or they will be restored automatically when your break ends.`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        return;
      }

      // ── Break Request: Deny ────────────────────────────────────────────────
      if (id.startsWith('break_req_deny_')) {
        const targetUserId = id.slice(15);
        const { EmbedBuilder: EB3 } = discordPkg;

        const deniedEmbed = EB3.from(interaction.message.embeds[0])
          .setColor(0xef4444)
          .addFields({ name: '❌ Denied', value: `by ${interaction.user.tag}`, inline: false });

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`break_req_approve_${targetUserId}_1`).setLabel('✅ Approve Break').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(`break_req_deny_${targetUserId}`).setLabel('❌ Denied').setStyle(ButtonStyle.Danger).setDisabled(true),
        );

        await interaction.update({ embeds: [deniedEmbed], components: [disabledRow] });

        try {
          const targetUser = await client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            await targetUser.send({
              embeds: [new EB3()
                .setColor(0xef4444)
                .setTitle('❌ Break Denied')
                .setDescription(`Your break request was denied by **${interaction.user.tag}**.`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        return;
      }

      // ── Network Apply: Open Modal ─────────────────────────────────────────
      if (id.startsWith('napply_') && !id.startsWith('napply_accept_') && !id.startsWith('napply_deny_')) {
        const targetGuildId = id.slice(7);
        const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
        const serverName = targetGuild?.name || 'this server';

        const { ModalBuilder: MB, TextInputBuilder: TIB, TextInputStyle: TIS, ActionRowBuilder: ARB2 } = discordPkg;
        const modal = new MB()
          .setCustomId(`napply_modal_${targetGuildId}`)
          .setTitle(`Apply — ${serverName}`.slice(0, 45));
        modal.addComponents(
          new ARB2().addComponents(new TIB().setCustomId('app_why').setLabel('Why do you want to join this server?').setStyle(TIS.Paragraph).setRequired(true).setMaxLength(1000)),
          new ARB2().addComponents(new TIB().setCustomId('app_experience').setLabel('What relevant experience do you have?').setStyle(TIS.Paragraph).setRequired(true).setMaxLength(1000)),
          new ARB2().addComponents(new TIB().setCustomId('app_timezone').setLabel('What is your timezone?').setStyle(TIS.Short).setRequired(true).setMaxLength(50)),
          new ARB2().addComponents(new TIB().setCustomId('app_age').setLabel('How old are you?').setStyle(TIS.Short).setRequired(true).setMaxLength(3)),
        );
        return interaction.showModal(modal);
      }

      // ── Network Apply: Accept ──────────────────────────────────────────────
      if (id.startsWith('napply_accept_')) {
        const parts = id.slice(14).split('_');
        const targetGuildId = parts[0];
        const applicantId   = parts[1];
        const appId         = parts[2];

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ Only Administrators can accept or deny applications.', flags: 64 });
        }

        const { getNetworkApplyConfig, resolveNetworkApplication } = await import('./src/database.js');
        const app = await resolveNetworkApplication(appId, 'accepted');
        if (!app) return interaction.reply({ content: '❌ Application not found.', flags: 64 });

        const config = await getNetworkApplyConfig(targetGuildId);
        const targetGuild = interaction.client.guilds.cache.get(targetGuildId)
          || await interaction.client.guilds.fetch(targetGuildId).catch(() => null);

        let rolesGiven = [];
        if (targetGuild && config.roles?.length) {
          const member = await targetGuild.members.fetch(applicantId).catch(() => null);
          if (member) {
            await member.roles.add(config.roles).catch(() => null);
            rolesGiven = config.roles;
          }
        }

        const roleList = rolesGiven.length ? rolesGiven.map(r => `<@&${r}>`).join(', ') : 'None';
        const acceptedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .addFields(
            { name: '✅ Accepted By', value: `<@${interaction.user.id}>`, inline: true },
            { name: '🎭 Roles Given', value: roleList, inline: true },
          );
        await interaction.update({
          embeds: [acceptedEmbed],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`napply_accept_${targetGuildId}_${applicantId}_${appId}`).setLabel('✅ Accepted').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`napply_deny_${targetGuildId}_${applicantId}_${appId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
          )],
        });

        try {
          const applicant = await interaction.client.users.fetch(applicantId).catch(() => null);
          if (applicant) {
            await applicant.send({
              embeds: [new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎉 Application Accepted!')
                .setDescription(`Your application to join **${targetGuild?.name || 'the server'}** has been **accepted**!\n\nAn admin has reviewed your application and you have been given your roles. Welcome to the team!`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        return;
      }

      // ── Network Apply: Deny ────────────────────────────────────────────────
      if (id.startsWith('napply_deny_')) {
        const parts = id.slice(12).split('_');
        const targetGuildId = parts[0];
        const applicantId   = parts[1];
        const appId         = parts[2];

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ Only Administrators can accept or deny applications.', flags: 64 });
        }

        const { resolveNetworkApplication: resolveNA } = await import('./src/database.js');
        await resolveNA(appId, 'denied');

        const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
        const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0xED4245)
          .addFields({ name: '❌ Denied By', value: `<@${interaction.user.id}>`, inline: true });
        await interaction.update({
          embeds: [deniedEmbed],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`napply_accept_${targetGuildId}_${applicantId}_${appId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`napply_deny_${targetGuildId}_${applicantId}_${appId}`).setLabel('❌ Denied').setStyle(ButtonStyle.Danger).setDisabled(true),
          )],
        });

        try {
          const applicant = await interaction.client.users.fetch(applicantId).catch(() => null);
          if (applicant) {
            await applicant.send({
              embeds: [new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Application Denied')
                .setDescription(`Your application to join **${targetGuild?.name || 'the server'}** was **not accepted** at this time.\n\nThank you for your interest. You are welcome to apply again in the future.`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        return;
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
    Moderator:          { role: '1495222811755806740', team: '1501681813398093955' },
    'Human Resources':  { role: '1495222820400009246', team: '1501681511324451028' },
    Partnership:        { role: '1495222796517773335', team: '1501681321343193160' },
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
          embeds: [new EmbedBuilder()
            .setTitle('🎉 Application Accepted!')
            .setColor(0x22c55e)
            .setDescription(`Congratulations! Your application for **${application.role}** has been accepted.\n\nPlease join the staff server using the link below and introduce yourself.`)
            .addFields({ name: '📨 Staff Server', value: '[Click here to join](https://discord.gg/AZhhKXs7wA)', inline: false })
            .setFooter({ text: 'Welcome to the team!' })
            .setTimestamp()],
        }).catch(() => null);

        const botConfig = await getBotGuild(guildId);
        const staffUpdateEmbed = buildStaffUpdateEmbed('hired', {
          userId: application.userId,
          moderatorId: interaction.user.id,
          role: application.role,
        });
        await sendLog(member.guild, botConfig, 'staff_updates', staffUpdateEmbed);
      }

    } catch (err) {
      console.error('Role assignment failed:', err);
    }

    // Edit original message + post to thread
    const reviewerTag = `<@${interaction.user.id}>`;
    await Promise.all([
      updateDiscordApplicationMessage(application, 'accepted', reviewerTag),
      (async () => {
        if (!application.discord_thread_id) return;
        const thread = await client.channels.fetch(application.discord_thread_id).catch(() => null);
        if (!thread) return;
        const decisionEmbed = new EmbedBuilder()
          .setTitle('✅ Application Accepted')
          .setColor(0x22c55e)
          .setDescription(`**${application.username}** has been accepted for **${application.role}**. Roles have been assigned.`)
          .addFields({ name: '🛡️ Reviewed by', value: reviewerTag, inline: true })
          .setTimestamp();
        await thread.send({ embeds: [decisionEmbed] }).catch(() => null);
      })(),
    ]).catch(() => null);

    return interaction.reply({ content: `✅ Accepted #${appId} and role assigned.`, ephemeral: true });
  }

  // ── DENY APPLICATION ─────────────────────────────
  if (action === 'deny') {

    db.updateApplicationStatus(Number(appId), 'denied');

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(application.userId).catch(() => null);
      if (member) {
        await member.send({ content: `❌ Your application for **${application.role}** was denied.` }).catch(() => null);
      }
    } catch (err) {
      console.error(err);
    }

    // Edit original message + post to thread
    const denyReviewerTag = `<@${interaction.user.id}>`;
    await Promise.all([
      updateDiscordApplicationMessage(application, 'denied', denyReviewerTag),
      (async () => {
        if (!application.discord_thread_id) return;
        const thread = await client.channels.fetch(application.discord_thread_id).catch(() => null);
        if (!thread) return;
        const decisionEmbed = new EmbedBuilder()
          .setTitle('❌ Application Denied')
          .setColor(0xef4444)
          .setDescription(`**${application.username}**'s application for **${application.role}** has been denied.`)
          .addFields({ name: '🛡️ Reviewed by', value: denyReviewerTag, inline: true })
          .setTimestamp();
        await thread.send({ embeds: [decisionEmbed] }).catch(() => null);
      })(),
    ]).catch(() => null);

    return interaction.reply({ content: `❌ Denied #${appId}`, ephemeral: true });
  }
}

      // ── Resign: Approve ────────────────────────────────────────────────────
      if (id.startsWith('resign_approve_')) {
        const targetUserId = id.slice(15);
        const { getGuild: getResG } = await import('./src/database.js');
        const config = await getResG(interaction.guildId);

        // Kick from staff server
        const staffMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

        // Remove all roles except verified in main server
        const mainGuildId = process.env.MAIN_GUILD_ID;
        if (mainGuildId) {
          try {
            const mainGuild = client.guilds.cache.get(mainGuildId) || await client.guilds.fetch(mainGuildId).catch(() => null);
            if (mainGuild) {
              const mainMember = await mainGuild.members.fetch(targetUserId).catch(() => null);
              if (mainMember) {
                const rolesToRemove = mainMember.roles.cache
                  .filter(r => r.id !== mainGuild.id && !r.managed && r.id !== config.verified_role_id)
                  .map(r => r.id);
                if (rolesToRemove.length) await mainMember.roles.remove(rolesToRemove).catch(() => null);
              }
            }
          } catch {}
        }

        // DM the staff member
        try {
          const targetUser = staffMember?.user || await client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            await targetUser.send({
              embeds: [new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('📝 Resignation Approved')
                .setDescription(`Your resignation has been approved by **${interaction.user.tag}**.\n\nYour staff roles have been removed. Thank you for your service!`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        // Kick from staff server after DM
        if (staffMember) {
          await staffMember.kick('Resignation approved').catch(() => null);
        }

        const { EmbedBuilder: EBR } = discordPkg;
        const approvedEmbed = EBR.from(interaction.message.embeds[0])
          .setColor(0x22c55e)
          .addFields({ name: '✅ Approved', value: `by ${interaction.user.tag}`, inline: false });

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`resign_approve_${targetUserId}`).setLabel('✅ Approved').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(`resign_deny_${targetUserId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
        );

        return interaction.update({ embeds: [approvedEmbed], components: [disabledRow] });
      }

      // ── Resign: Deny ───────────────────────────────────────────────────────
      if (id.startsWith('resign_deny_')) {
        const targetUserId = id.slice(12);
        const { EmbedBuilder: EBR2 } = discordPkg;

        try {
          const targetUser = await client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            await targetUser.send({
              embeds: [new EBR2()
                .setColor(0xFFA500)
                .setTitle('📝 Resignation Denied')
                .setDescription(`Your resignation request was denied by **${interaction.user.tag}**.`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        const deniedEmbed = EBR2.from(interaction.message.embeds[0])
          .setColor(0xef4444)
          .addFields({ name: '❌ Denied', value: `by ${interaction.user.tag}`, inline: false });

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`resign_approve_${targetUserId}`).setLabel('✅ Approve Resignation').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(`resign_deny_${targetUserId}`).setLabel('❌ Denied').setStyle(ButtonStyle.Danger).setDisabled(true),
        );

        return interaction.update({ embeds: [deniedEmbed], components: [disabledRow] });
      }

      // ── Application: Approve — show role pickers ───────────────────────────
      if (id.startsWith('app_approve_')) {
        const applicantId = id.slice(12);
        const { RoleSelectMenuBuilder } = discordPkg;
        const key = `${interaction.guildId}_${interaction.user.id}`;
        pendingApprovals.set(key, { applicantId, staffRoleId: null, teamRoleId: null });

        const staffSelect = new RoleSelectMenuBuilder()
          .setCustomId(`app_role_select_${applicantId}`)
          .setPlaceholder('Select the staff role to give')
          .setMinValues(1)
          .setMaxValues(1);

        const teamSelect = new RoleSelectMenuBuilder()
          .setCustomId(`app_team_select_${applicantId}`)
          .setPlaceholder('Select the team role to give')
          .setMinValues(0)
          .setMaxValues(1);

        const confirmBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`app_confirm_${applicantId}`)
            .setLabel('✅ Confirm & Accept Applicant')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`app_deny_${applicantId}`)
            .setLabel('❌ Deny Instead')
            .setStyle(ButtonStyle.Danger),
        );

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎭 Pick Roles for Applicant')
            .setDescription(`Pick the roles to assign to <@${applicantId}>, then click **Confirm**.`)
            .setTimestamp()
          ],
          components: [
            new ActionRowBuilder().addComponents(staffSelect),
            new ActionRowBuilder().addComponents(teamSelect),
            confirmBtn,
          ],
          flags: 64,
        });
      }

      // ── Application: Deny ──────────────────────────────────────────────────
      if (id.startsWith('app_deny_')) {
        const applicantId = id.slice(9);
        const { removeApplication: removeApp } = await import('./src/database.js');
        await removeApp(interaction.guildId, applicantId);

        try {
          const targetUser = await client.users.fetch(applicantId).catch(() => null);
          if (targetUser) {
            await targetUser.send({
              embeds: [new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('📋 Application Denied')
                .setDescription('Unfortunately your staff application was not successful this time. You are welcome to apply again in the future.')
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        const { EmbedBuilder: EBApp } = discordPkg;
        try {
          const deniedEmbed = EBApp.from(interaction.message.embeds[0])
            .setColor(0xef4444)
            .addFields({ name: '❌ Denied', value: `by ${interaction.user.tag}`, inline: false });
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_approve_${applicantId}`).setLabel('✅ Accept Application').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`app_deny_${applicantId}`).setLabel('❌ Denied').setStyle(ButtonStyle.Danger).setDisabled(true),
          );
          await interaction.update({ embeds: [deniedEmbed], components: [disabledRow] });
        } catch {
          await interaction.reply({ content: '❌ Application denied.', flags: 64 });
        }
        return;
      }

      // ── Application: Confirm (after picking roles) ─────────────────────────
      if (id.startsWith('app_confirm_')) {
        const applicantId = id.slice(12);
        const key = `${interaction.guildId}_${interaction.user.id}`;
        const pending = pendingApprovals.get(key);

        if (!pending || pending.applicantId !== applicantId) {
          return interaction.reply({ content: '❌ No pending role selection found. Please click Approve on the application again.', flags: 64 });
        }

        const { removeApplication: removeAppC } = await import('./src/database.js');
        await removeAppC(interaction.guildId, applicantId);
        pendingApprovals.delete(key);

        // Apply roles in this guild
        const member = await interaction.guild.members.fetch(applicantId).catch(() => null);
        if (member) {
          if (pending.staffRoleId) await member.roles.add(pending.staffRoleId).catch(() => null);
          if (pending.teamRoleId)  await member.roles.add(pending.teamRoleId).catch(() => null);
        }

        // DM the applicant
        try {
          const targetUser = member?.user || await client.users.fetch(applicantId).catch(() => null);
          if (targetUser) {
            const roleText = [pending.staffRoleId && `<@&${pending.staffRoleId}>`, pending.teamRoleId && `<@&${pending.teamRoleId}>`].filter(Boolean).join(' and ') || 'your new role';
            await targetUser.send({
              embeds: [new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎉 Application Accepted!')
                .setDescription(`Congratulations! Your staff application has been accepted by **${interaction.user.tag}**.\n\nYou have been given ${roleText}. Welcome to the team!`)
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        return interaction.update({
          embeds: [new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Application Accepted')
            .setDescription(`<@${applicantId}> has been accepted and their roles have been applied.`)
            .setTimestamp()
          ],
          components: [],
        });
      }

    } // end isButton()

    // ── Role Select Menus (application role picking) ───────────────────────────
    if (interaction.isRoleSelectMenu()) {
      const sid = interaction.customId;
      const key  = `${interaction.guildId}_${interaction.user.id}`;

      if (sid.startsWith('app_role_select_')) {
        const pending = pendingApprovals.get(key);
        if (pending) {
          pending.staffRoleId = interaction.values[0] || null;
          pendingApprovals.set(key, pending);
        }
        return interaction.deferUpdate();
      }

      if (sid.startsWith('app_team_select_')) {
        const pending = pendingApprovals.get(key);
        if (pending) {
          pending.teamRoleId = interaction.values[0] || null;
          pendingApprovals.set(key, pending);
        }
        return interaction.deferUpdate();
      }
    }

    // ── Break Request Modal Submit ─────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('break_request_modal_')) {
      const guildId = interaction.customId.slice(20);
      const daysRaw = interaction.fields.getTextInputValue('break_days').trim();
      const reason  = interaction.fields.getTextInputValue('break_reason').trim() || null;
      const days    = parseInt(daysRaw);

      if (!days || days < 1 || days > 365 || isNaN(days)) {
        return interaction.reply({ content: '❌ Please enter a valid number of days (1–365).', flags: 64 });
      }

      const { getGuild: getBGM, isOnBreak: iobM } = await import('./src/database.js');

      if (await iobM(guildId, interaction.user.id)) {
        return interaction.reply({ content: '❌ You are already on break. Use `/break-end` to end it first.', flags: 64 });
      }

      const config = await getBGM(guildId);
      if (!config.break_request_channel_id) {
        return interaction.reply({ content: '❌ No break request channel is configured. Ask an admin to run `/setup-break`.', flags: 64 });
      }

      const channel = interaction.guild?.channels?.cache.get(config.break_request_channel_id)
        || await interaction.client.channels.fetch(config.break_request_channel_id).catch(() => null);

      if (!channel) {
        return interaction.reply({ content: '❌ The configured break request channel could not be found.', flags: 64 });
      }

      const endPreview = Math.floor(Date.now() / 1000) + days * 86400;

      const reqEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('☕ Break Request')
        .setDescription(`**${interaction.user.tag}** is requesting a break.`)
        .addFields(
          { name: '👤 Staff Member', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
          { name: '📅 Duration', value: `${days} day${days !== 1 ? 's' : ''}`, inline: true },
          { name: '🔚 Would End', value: `<t:${endPreview}:F>`, inline: true },
          { name: '📝 Reason', value: reason || 'No reason provided', inline: false },
          { name: '🕒 Requested', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Approve or deny this break request below' });

      const reqRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`break_req_approve_${interaction.user.id}_${days}`)
          .setLabel('✅ Approve Break')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`break_req_deny_${interaction.user.id}`)
          .setLabel('❌ Deny Break')
          .setStyle(ButtonStyle.Danger),
      );

      await channel.send({ embeds: [reqEmbed], components: [reqRow] });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('☕ Break Request Sent')
            .setDescription(`Your request for **${days} day${days !== 1 ? 's' : ''}** has been sent to <#${config.break_request_channel_id}> for approval.${reason ? `\n**Reason:** ${reason}` : ''}`)
            .setTimestamp()
        ],
        flags: 64,
      });
    }

    // ── Resign Request Modal Submit ────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('resign_request_modal_')) {
      const guildId = interaction.customId.slice(21);
      const reason  = interaction.fields.getTextInputValue('resign_reason').trim();
      const { getGuild: getRG } = await import('./src/database.js');
      const config = await getRG(guildId);

      if (!config.resign_channel_id) {
        return interaction.reply({ content: '❌ No resign request channel is configured. Ask an admin to run `/setup-resign`.', flags: 64 });
      }

      const channel = interaction.guild?.channels?.cache.get(config.resign_channel_id)
        || await interaction.client.channels.fetch(config.resign_channel_id).catch(() => null);
      if (!channel) {
        return interaction.reply({ content: '❌ The configured resign channel could not be found.', flags: 64 });
      }

      const resignEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('📝 Resignation Request')
        .setDescription(`**${interaction.user.tag}** has submitted a resignation request.`)
        .addFields(
          { name: '👤 Staff Member', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
          { name: '🕒 Requested', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Approve to process the resignation' });

      const resignRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`resign_approve_${interaction.user.id}`)
          .setLabel('✅ Approve Resignation')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`resign_deny_${interaction.user.id}`)
          .setLabel('❌ Deny')
          .setStyle(ButtonStyle.Danger),
      );

      await channel.send({ embeds: [resignEmbed], components: [resignRow] });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('📝 Resignation Request Sent')
          .setDescription(`Your resignation request has been sent for review.\n**Reason:** ${reason}`)
          .setTimestamp()
        ],
        flags: 64,
      });
    }

    // ── Application Modal Submit ───────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal_')) {
      const guildId = interaction.customId.slice(18);
      const why        = interaction.fields.getTextInputValue('app_why').trim();
      const experience = interaction.fields.getTextInputValue('app_experience').trim();
      const timezone   = interaction.fields.getTextInputValue('app_timezone').trim();
      const age        = interaction.fields.getTextInputValue('app_age').trim();

      const { getGuild: getAG, saveApplication: saveApp } = await import('./src/database.js');
      const config = await getAG(guildId);

      if (!config.applications_channel_id) {
        return interaction.reply({ content: '❌ No applications channel is configured. Ask an admin to run `/setup-resign`.', flags: 64 });
      }

      const channel = interaction.guild?.channels?.cache.get(config.applications_channel_id)
        || await interaction.client.channels.fetch(config.applications_channel_id).catch(() => null);
      if (!channel) {
        return interaction.reply({ content: '❌ The configured applications channel could not be found.', flags: 64 });
      }

      await saveApp(guildId, interaction.user.id, interaction.user.tag, { why, experience, timezone, age });

      const appEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Staff Application')
        .setDescription(`**${interaction.user.tag}** has applied for a staff position.`)
        .addFields(
          { name: '👤 Applicant', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
          { name: '🎂 Age', value: age, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true },
          { name: '❓ Why they want to join', value: why, inline: false },
          { name: '📜 Experience', value: experience, inline: false },
          { name: '🕒 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Use the buttons below to accept or deny this application' });

      const appRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_approve_${interaction.user.id}`)
          .setLabel('✅ Accept Application')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_deny_${interaction.user.id}`)
          .setLabel('❌ Deny Application')
          .setStyle(ButtonStyle.Danger),
      );

      await channel.send({ embeds: [appEmbed], components: [appRow] });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Application Submitted')
          .setDescription('Your application has been submitted and is under review. You will be notified of the outcome.')
          .setTimestamp()
        ],
        flags: 64,
      });
    }

    // ── Network Apply Modal Submit ─────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('napply_modal_')) {
      const targetGuildId = interaction.customId.slice(13);
      const why        = interaction.fields.getTextInputValue('app_why').trim();
      const experience = interaction.fields.getTextInputValue('app_experience').trim();
      const timezone   = interaction.fields.getTextInputValue('app_timezone').trim();
      const age        = interaction.fields.getTextInputValue('app_age').trim();

      const { getNetworkApplyConfig: getNAC, saveNetworkApplication: saveNA } = await import('./src/database.js');
      const config = await getNAC(targetGuildId);

      if (!config.logChannelId) {
        return interaction.reply({ content: '❌ This server has not configured its application system yet. Try again later.', flags: 64 });
      }

      const logChannel = await interaction.client.channels.fetch(config.logChannelId).catch(() => null);
      if (!logChannel) {
        return interaction.reply({ content: '❌ The application review channel could not be reached. Please contact an admin.', flags: 64 });
      }

      const avatar = interaction.user.displayAvatarURL({ size: 64, extension: 'png' });
      const appId = await saveNA(targetGuildId, interaction.user.id, interaction.user.tag, avatar, why, experience, timezone, age);

      const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
      const serverName = targetGuild?.name || 'Unknown Server';

      const appEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 Server Application — ${serverName}`)
        .setDescription(`**${interaction.user.tag}** wants to join **${serverName}**.`)
        .setThumbnail(avatar)
        .addFields(
          { name: '👤 Applicant', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
          { name: '🎂 Age', value: age, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true },
          { name: '❓ Why they want to join', value: why },
          { name: '📜 Experience', value: experience },
          { name: '🎭 Roles on Acceptance', value: config.roles.length ? config.roles.map(r => `<@&${r}>`).join(', ') : 'None configured', inline: true },
          { name: '🕒 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        )
        .setFooter({ text: `Application ID: ${appId}` })
        .setTimestamp();

      const appRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`napply_accept_${targetGuildId}_${interaction.user.id}_${appId}`)
          .setLabel('✅ Accept Application')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`napply_deny_${targetGuildId}_${interaction.user.id}_${appId}`)
          .setLabel('❌ Deny Application')
          .setStyle(ButtonStyle.Danger),
      );

      await logChannel.send({ embeds: [appEmbed], components: [appRow] });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Application Submitted!')
          .setDescription(`Your application to join **${serverName}** has been submitted. An admin will review it and you'll receive a DM with the outcome.`)
          .setTimestamp()
        ],
        flags: 64,
      });
    }

    if (interaction.isCommand()) {
      const name = interaction.commandName;
      const handler = botHandlers[name];
      if (handler) {
        if (interaction.guildId && await isCommandDisabled(interaction.guildId, name)) {
          return interaction.reply({ content: '❌ This command has been disabled in this server.', flags: 64 });
        }
        await handler(interaction);
      } else if (setupCommands.some(c => c.name === name)) {
        // handled by setup handlers above via botHandlers mapping
      }
    }

    if (interaction.isButton() && interaction.customId?.startsWith('req:')) {
      await handleRequestButton(interaction);
    }

    if (interaction.isButton() && interaction.customId?.startsWith('modguide:')) {
      await handleModGuideButton(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      }
    } catch {}
  }
});

// ── Message Delete → HTML Transcript ─────────────────────────────────────────

function buildDeleteTranscriptHtml(msg) {
  const author      = msg.author;
  const avatarUrl   = author?.displayAvatarURL?.({ size: 64, extension: 'png' }) ?? '';
  const username    = author?.username ?? 'Unknown User';
  const userId      = author?.id ?? 'unknown';
  const content     = msg.content || '';
  const channelName = msg.channel?.name ?? 'unknown-channel';
  const guildName   = msg.guild?.name   ?? 'Unknown Server';
  const sentAt      = msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString();
  const deletedAt   = new Date().toISOString();

  const attachmentRows = [...(msg.attachments?.values() ?? [])].map(a => `
    <div class="attachment">
      ${a.contentType?.startsWith('image/') ? `<img src="${a.url}" alt="${a.name}" loading="lazy" />` : ''}
      <a href="${a.url}" target="_blank" rel="noreferrer">📎 ${a.name}</a>
    </div>`).join('');

  const escapedContent = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deleted Message — ${channelName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1a2e; color: #dcddde; font-family: 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; }
    .container { width: 100%; max-width: 760px; }
    .header { background: #16213e; border: 1px solid #2d2f45; border-radius: 12px 12px 0 0; padding: 20px 28px; display: flex; align-items: center; gap: 14px; }
    .header-icon { font-size: 28px; }
    .header-info h1 { font-size: 17px; font-weight: 700; color: #fff; }
    .header-info p { font-size: 13px; color: #8e9297; margin-top: 3px; }
    .badge { display: inline-block; background: #ed4245; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 8px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-strip { background: #0f3460; border-left: 1px solid #2d2f45; border-right: 1px solid #2d2f45; padding: 10px 28px; display: flex; gap: 24px; flex-wrap: wrap; }
    .meta-strip span { font-size: 12px; color: #8e9297; }
    .meta-strip strong { color: #b9bbbe; }
    .message-card { background: #1e1f2e; border: 1px solid #2d2f45; border-radius: 0 0 12px 12px; padding: 20px 28px; }
    .message-author { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #36393f; flex-shrink: 0; }
    .avatar-placeholder { width: 40px; height: 40px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; color: #fff; flex-shrink: 0; }
    .author-name { font-weight: 700; font-size: 15px; color: #fff; }
    .author-id { font-size: 11px; color: #8e9297; margin-top: 2px; font-family: monospace; }
    .message-body { padding-left: 52px; }
    .message-content { font-size: 15px; line-height: 1.6; color: #dcddde; word-break: break-word; white-space: pre-wrap; }
    .message-content em { color: #8e9297; font-style: italic; }
    .attachments { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
    .attachment img { max-width: 400px; max-height: 300px; border-radius: 8px; display: block; margin-bottom: 4px; }
    .attachment a { color: #00b0f4; font-size: 13px; text-decoration: none; }
    .attachment a:hover { text-decoration: underline; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #4f545c; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-icon">🗑️</div>
      <div class="header-info">
        <h1>${guildName} — Deleted Message Log <span class="badge">deleted</span></h1>
        <p>Channel: <strong>#${channelName}</strong></p>
      </div>
    </div>
    <div class="meta-strip">
      <span>Sent: <strong>${sentAt}</strong></span>
      <span>Deleted: <strong>${deletedAt}</strong></span>
      <span>Channel: <strong>#${channelName}</strong></span>
    </div>
    <div class="message-card">
      <div class="message-author">
        ${avatarUrl
          ? `<img class="avatar" src="${avatarUrl}" alt="${username}" />`
          : `<div class="avatar-placeholder">${username.charAt(0).toUpperCase()}</div>`}
        <div>
          <div class="author-name">${username}</div>
          <div class="author-id">${userId}</div>
        </div>
      </div>
      <div class="message-body">
        <div class="message-content">${escapedContent || '<em>[no text content]</em>'}</div>
        ${attachmentRows ? `<div class="attachments">${attachmentRows}</div>` : ''}
      </div>
    </div>
    <div class="footer">Generated by Eclipse Staff Portal • ${deletedAt}</div>
  </div>
</body>
</html>`;
}

client.on('messageDelete', async (msg) => {
  if (!msg.guild || msg.author?.bot) return;

  // Always update snipe cache (used by /snipe command)
  if (msg.author) {
    const avatarUrl = msg.author.displayAvatarURL?.({ size: 64, extension: 'png' }) ?? '';
    await setSnipeCache(msg.guild.id, msg.channel.id, msg.content || '', msg.author.id, msg.author.username, avatarUrl);
  }

  const config = await getBotGuild(msg.guild.id);
  if (!config.log_channel_id) return;

  try {
    const { safeFetchChannel } = await import('./src/utils.js');
    const logChannel = await safeFetchChannel(msg.guild, config.log_channel_id);
    if (!logChannel?.isTextBased()) return;

    const html   = buildDeleteTranscriptHtml(msg);
    const buf    = Buffer.from(html, 'utf-8');
    const ts     = new Date().toISOString().replace(/[:.]/g, '-');
    const file   = new AttachmentBuilder(buf, { name: `deleted-msg-${ts}.html` });

    const notifEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'Author',  value: msg.author ? `<@${msg.author.id}> (\`${msg.author.id}\`)` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
        { name: 'Preview', value: (msg.content?.slice(0, 200) || '*[no text]*') + (msg.content?.length > 200 ? '…' : ''), inline: false },
      )
      .setFooter({ text: 'Full transcript attached below' })
      .setTimestamp();

    await logChannel.send({ embeds: [notifEmbed], files: [file] }).catch(() => null);
  } catch (err) {
    console.error('messageDelete transcript error:', err.message);
  }
});

// ── Message Tracking ──────────────────────────────────────────────────────────

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // ── Owner DM commands ───────────────────────────────────────────────────────
  if (!msg.guild && msg.author.id === OWNER_ID) {
    const parts = msg.content.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    try {
      if (cmd === 'panel' && parts[1]) {
        const panel = await buildOwnerPanel(parts[1]);
        await msg.reply(panel);
      } else if (cmd === 'disable' && parts[1] && parts[2]) {
        await dbDisableCmd(parts[1], parts[2]);
        await msg.reply(`✅ \`/${parts[2]}\` disabled in guild \`${parts[1]}\`.`);
      } else if (cmd === 'enable' && parts[1] && parts[2]) {
        await dbEnableCmd(parts[1], parts[2]);
        await msg.reply(`✅ \`/${parts[2]}\` enabled in guild \`${parts[1]}\`.`);
      } else if (cmd === 'leveling' && parts[1] && parts[2]) {
        const on = parts[1].toLowerCase() === 'on';
        await dbSetGuildConfig(parts[2], { leveling_enabled: on ? 1 : 0 });
        await msg.reply(`✅ Leveling **${on ? 'enabled' : 'disabled'}** in guild \`${parts[2]}\`.`);
      } else if (cmd === 'list' && parts[1]) {
        const disabled = await dbGetDisabledCmds(parts[1]);
        await msg.reply(disabled.length ? `Disabled commands in \`${parts[1]}\`:\n${disabled.map(c => `\`/${c}\``).join(', ')}` : `No disabled commands in \`${parts[1]}\`.`);
      } else if (cmd === 'help') {
        await msg.reply([
          '**Owner DM Commands**',
          '`panel <guildId>` — open the interactive button panel for a server',
          '`disable <guildId> <command>` — disable a command',
          '`enable <guildId> <command>` — re-enable a command',
          '`leveling on/off <guildId>` — toggle the leveling system',
          '`list <guildId>` — list disabled commands',
        ].join('\n'));
      }
    } catch (e) {
      await msg.reply(`❌ Error: ${e.message}`).catch(() => null);
    }
    return;
  }

  if (!msg.guild) return;

  await incrementMessageCount(msg.guild.id, msg.author.id);
  if (await isAdChannel(msg.guild.id, msg.channel.id)) await trackAdPost(msg.guild.id, msg.channel.id, msg.id, msg.author.id);

  // ── Prefix command: ,ar ────────────────────────────────────────────────────
  if (msg.content.startsWith(',ar')) {
    const arg = msg.content.slice(3).trim();

    if (!arg || arg === 'clear') {
      const existing = await getAutoReact(msg.guild.id, msg.author.id).catch(() => null);
      if (!existing) {
        msg.reply('❌ You don\'t have an auto-react set.').then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
      } else {
        await clearAutoReact(msg.guild.id, msg.author.id).catch(() => {});
        msg.reply('✅ Auto-react removed.').then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
      }
      return;
    }

    // Rank check — admin+ (rank 3+) are free, everyone else pays 10,000 coins
    const AR_COST = 10000;
    const rank = getStaffRank(msg.member);
    const isFree = rank >= 3;

    if (!isFree) {
      const bal = await getBalance(msg.guild.id, msg.author.id).catch(() => 0);
      if (bal < AR_COST) {
        msg.reply(`❌ You need **${AR_COST.toLocaleString()} coins** to set an auto-react. You have **${bal.toLocaleString()}**.`).then(r => setTimeout(() => r.delete().catch(() => {}), 7000));
        return;
      }
    }

    // Custom emoji: <a?:name:id>
    const customMatch = arg.match(/^<(a?):([^:]+):(\d+)>$/);
    if (customMatch) {
      const [, a, name, id] = customMatch;
      const animated = a === 'a';
      if (!isFree) await setBalance(msg.guild.id, msg.author.id, (await getBalance(msg.guild.id, msg.author.id)) - AR_COST).catch(() => {});
      await setAutoReact(msg.guild.id, msg.author.id, id, name, animated).catch(() => {});
      const suffix = isFree ? '' : ` (-${AR_COST.toLocaleString()} coins)`;
      msg.reply(`✅ Auto-react set to ${arg}.${suffix}`).then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
      return;
    }

    // Unicode emoji — test by attempting a react, then save if it works
    try {
      const test = await msg.react(arg);
      await test.remove().catch(() => {});
      if (!isFree) await setBalance(msg.guild.id, msg.author.id, (await getBalance(msg.guild.id, msg.author.id)) - AR_COST).catch(() => {});
      await setAutoReact(msg.guild.id, msg.author.id, null, arg, false).catch(() => {});
      const suffix = isFree ? '' : ` (-${AR_COST.toLocaleString()} coins)`;
      msg.reply(`✅ Auto-react set to ${arg}.${suffix}`).then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
    } catch {
      msg.reply('❌ Invalid emoji. Send a standard emoji or a custom emoji from this server.').then(r => setTimeout(() => r.delete().catch(() => {}), 5000));
    }
    return;
  }

  // Auto-react
  const ar = await getAutoReact(msg.guild.id, msg.author.id).catch(() => null);
  if (ar) {
    if (ar.emoji_id) {
      const emoji = msg.guild.emojis.cache.get(ar.emoji_id);
      if (emoji) msg.react(emoji).catch(() => {});
    } else if (ar.emoji_name) {
      msg.react(ar.emoji_name).catch(() => {});
    }
  }

  // XP gain (60-second cooldown, 15–25 XP per message)
  const cdKey = `${msg.guild.id}-${msg.author.id}`;
  const now = Date.now();
  if (now - (xpCooldowns.get(cdKey) || 0) >= 60000) {
    const xpConfig = await getBotGuild(msg.guild.id).catch(() => null);
    // Skip if leveling is disabled for this guild
    if (xpConfig?.leveling_enabled === 0) return;
    // Skip if XP is restricted to a specific channel and this isn't it
    if (xpConfig?.level_xp_channel_id && msg.channel.id !== xpConfig.level_xp_channel_id) return;

    xpCooldowns.set(cdKey, now);
    const xpGain = Math.floor(Math.random() * 11) + 15;
    const newTotal = await addUserXp(msg.guild.id, msg.author.id, xpGain);
    const oldTotal = newTotal - xpGain;
    const { level: newLevel } = computeLevel(newTotal);
    const { level: oldLevel } = computeLevel(oldTotal);
    if (newLevel > oldLevel) {
      try {
        if (xpConfig?.level_log_channel_id) {
          const levelCh = await client.channels.fetch(xpConfig.level_log_channel_id).catch(() => null);
          if (levelCh) await levelCh.send(`🎉 <@${msg.author.id}> just leveled up to **Level ${newLevel}**! Congratulations! 🎊`);
        } else if (!dmmedOwnerGuilds.has(msg.guild.id)) {
          dmmedOwnerGuilds.add(msg.guild.id);
          const owner = await client.users.fetch(OWNER_ID).catch(() => null);
          if (owner) await owner.send(`⚠️ **Level-up alert** in **${msg.guild.name}**: a user just reached Level ${newLevel} but no level log channel is configured.\nUse \`/setup level-log:#channel\` to set one.`).catch(() => null);
        }
      } catch {}
    }
  }
});

// ── Bot Ready ─────────────────────────────────────────────────────────────────

client.once('clientReady', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await initDatabase();
  setDiscordClient(client);
  setStaffDiscordClient(client);
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

  const hub = await getNetworkHub().catch(() => null);
  if (hub) {
    const allGuildIds = [...client.guilds.cache.keys()];
    await autoLinkGuilds(hub.guild_id, allGuildIds).catch(() => {});
    console.log(`🌐 Auto-linked ${allGuildIds.length - 1} servers to network hub (${hub.guild_id})`);
  }
});

client.on('guildCreate', async (guild) => {
  try {
    const hub = await getNetworkHub();
    if (hub && hub.guild_id !== guild.id) {
      await autoLinkGuilds(hub.guild_id, [guild.id]);
      console.log(`🌐 Auto-linked new server "${guild.name}" (${guild.id}) to network hub`);
    }
  } catch (err) {
    console.error('guildCreate auto-link error:', err.message);
  }
});

// ── Break Auto-Expiry ─────────────────────────────────────────────────────────

async function processExpiredBreaks() {
  try {
    const { getExpiredBreaks, endBreak: ebAuto, getGuild: gbAuto } = await import('./src/database.js');
    const expired = await getExpiredBreaks();
    for (const b of expired) {
      try {
        const entry = await ebAuto(b.guild_id, b.user_id);
        if (!entry) continue;

        const config = await gbAuto(b.guild_id);
        const guild  = client.guilds.cache.get(b.guild_id);

        if (guild) {
          const member = await guild.members.fetch(b.user_id).catch(() => null);
          if (member) {
            if (config.break_role_id) await member.roles.remove(config.break_role_id).catch(() => null);
            for (const roleId of (entry.saved_roles || [])) {
              await member.roles.add(roleId).catch(() => null);
            }
          }
        }

        const mainGuildId = process.env.MAIN_GUILD_ID;
        if (mainGuildId && config.main_break_role_id) {
          const mainGuild = client.guilds.cache.get(mainGuildId);
          if (mainGuild) {
            const mainMember = await mainGuild.members.fetch(b.user_id).catch(() => null);
            if (mainMember) await mainMember.roles.remove(config.main_break_role_id).catch(() => null);
          }
        }

        try {
          const user = await client.users.fetch(b.user_id).catch(() => null);
          if (user) {
            await user.send({
              embeds: [new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Break Ended')
                .setDescription('Your break has ended and your roles have been automatically restored. Welcome back!')
                .setTimestamp()
              ]
            }).catch(() => null);
          }
        } catch {}

        console.log(`☕ Auto-ended break for ${b.username} (${b.user_id})`);
      } catch (err) {
        console.error('Break auto-expiry error:', err.message);
      }
    }
  } catch {}
}

setInterval(processExpiredBreaks, 60 * 1000);

// ── Login ─────────────────────────────────────────────────────────────────────

if (TOKEN) {
  client.login(TOKEN).catch(err => console.error('❌ Discord login failed:', err.message));
} else {
  console.warn('⚠️  TOKEN not set — Discord bot will not start. Add TOKEN to Secrets.');
}
