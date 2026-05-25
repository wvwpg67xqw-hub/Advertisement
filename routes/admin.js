import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import discordPkg from 'discord.js';
const { EmbedBuilder } = discordPkg;

const router = Router();

let discordClient = null;
export function setDiscordClient(client) {
  discordClient = client;
}

async function sendDecisionToDiscord(app, decision, adminUser) {
  if (!discordClient) return;
  const channelId = process.env.DISCORD_REVIEW_CHANNEL_ID;
  if (!channelId) return;
  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const accepted = decision === 'accepted';
  const embed = new EmbedBuilder()
    .setTitle(accepted ? '✅ Application Accepted' : '❌ Application Denied')
    .setColor(accepted ? 0x22c55e : 0xef4444)
    .addFields(
      { name: '👤 Applicant', value: `${app.username}\n\`${app.userId}\`` },
      { name: '📌 Role', value: app.role, inline: true },
      { name: '🛡️ Reviewed by', value: adminUser?.username || 'Admin', inline: true }
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(console.error);
}

// ── Applications ──────────────────────────────────────────────────────────────

router.get('/applications', requireAdmin, (req, res) => {
  res.json(db.getApplications(req.query.status));
});

router.post('/applications/:id/accept', requireAdmin, async (req, res) => {
  const app = db.getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Already ${app.status}` });
  db.updateApplicationStatus(req.params.id, 'accepted');
  await sendDecisionToDiscord(app, 'accepted', req.session.user);
  res.json({ success: true });
});

router.post('/applications/:id/deny', requireAdmin, async (req, res) => {
  const app = db.getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Already ${app.status}` });
  db.updateApplicationStatus(req.params.id, 'denied');
  await sendDecisionToDiscord(app, 'denied', req.session.user);
  res.json({ success: true });
});

// ── Blacklist ─────────────────────────────────────────────────────────────────

router.get('/blacklist', requireAdmin, (req, res) => {
  res.json(db.getBlacklist());
});

router.post('/blacklist', requireAdmin, (req, res) => {
  const { userId, username, reason } = req.body;
  if (!userId || !username || !reason) return res.status(400).json({ error: 'Missing fields' });
  try {
    db.insertBlacklist(userId, username, reason);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Already blacklisted' });
  }
});

router.delete('/blacklist/:id', requireAdmin, (req, res) => {
  const result = db.deleteBlacklist(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── Admins ────────────────────────────────────────────────────────────────────

router.get('/admins', requireAdmin, (req, res) => {
  res.json(db.getAllAdmins());
});

router.post('/admins', requireAdmin, (req, res) => {
  const { userId, username, role } = req.body;
  if (!userId || !username) return res.status(400).json({ error: 'Missing fields' });
  try {
    db.insertAdmin(userId, username, role || 'admin');
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Admin already exists' });
  }
});

router.delete('/admins/:id', requireAdmin, (req, res) => {
  const result = db.deleteAdmin(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── Roles ─────────────────────────────────────────────────────────────────────

router.get('/roles', requireAdmin, (req, res) => {
  res.json(db.getAllRoles());
});

// ── Discord Channel Lock / Unlock ─────────────────────────────────────────────

async function discordChannelRequest(method, channelId, body = null) {
  const TOKEN = process.env.TOKEN;
  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  if (!TOKEN || !GUILD_ID) throw new Error('Missing TOKEN or DISCORD_GUILD_ID');
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/permissions/${GUILD_ID}`,
    { method, headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null }
  );
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Discord API error');
  }
  return true;
}

router.post('/channels/:channelId/lock', requireAdmin, async (req, res) => {
  try {
    await discordChannelRequest('PUT', req.params.channelId, { type: 0, deny: '2048' });
    res.json({ success: true, locked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/channels/:channelId/unlock', requireAdmin, async (req, res) => {
  try {
    await discordChannelRequest('DELETE', req.params.channelId);
    res.json({ success: true, locked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
