import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

// ── Webhook helper ────────────────────────────────────────────

async function sendDecisionWebhook(app, decision, adminUser) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const accepted = decision === 'accepted';
  const embed = {
    title: accepted ? '✅ Application Accepted' : '❌ Application Denied',
    color: accepted ? 0x22c55e : 0xef4444,
    thumbnail: app.avatar ? { url: app.avatar } : undefined,
    fields: [
      { name: '👤 Applicant', value: `**${app.username}**\n\`${app.userId}\``, inline: true },
      { name: '📌 Role',      value: app.role,                                  inline: true },
      { name: '🛡️ Reviewed by', value: adminUser?.username || 'Admin',         inline: true },
    ],
    footer: { text: 'Staff Portal • Application System' },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error('Decision webhook failed:', err.message);
  }
}

// ── Applications ──────────────────────────────────────────────

router.get('/applications', requireAdmin, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM applications';
  const params = [];
  if (status && ['pending', 'accepted', 'denied'].includes(status)) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY createdAt DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/applications/:id/accept', requireAdmin, async (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare("UPDATE applications SET status = 'accepted' WHERE id = ?").run(req.params.id);
  sendDecisionWebhook(app, 'accepted', req.session.user);
  res.json({ success: true });
});

router.post('/applications/:id/deny', requireAdmin, async (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare("UPDATE applications SET status = 'denied' WHERE id = ?").run(req.params.id);
  sendDecisionWebhook(app, 'denied', req.session.user);
  res.json({ success: true });
});

// ── Blacklist ─────────────────────────────────────────────────

router.get('/blacklist', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM blacklist ORDER BY createdAt DESC').all());
});

router.post('/blacklist', requireAdmin, (req, res) => {
  const { userId, username, reason } = req.body;
  if (!userId || !username || !reason) return res.status(400).json({ error: 'userId, username, and reason are required' });
  try {
    db.prepare('INSERT INTO blacklist (userId, username, reason) VALUES (?, ?, ?)').run(userId, username, reason);
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'User is already blacklisted' }); }
});

router.delete('/blacklist/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM blacklist WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// ── Admins ────────────────────────────────────────────────────

router.get('/admins', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM admins ORDER BY createdAt DESC').all());
});

router.post('/admins', requireAdmin, (req, res) => {
  const { userId, username, role } = req.body;
  if (!userId || !username) return res.status(400).json({ error: 'userId and username are required' });
  try {
    db.prepare('INSERT INTO admins (userId, username, role) VALUES (?, ?, ?)').run(userId, username, role || 'admin');
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'Admin already exists' }); }
});

router.delete('/admins/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found' });
  res.json({ success: true });
});

// ── Application Roles ─────────────────────────────────────────

router.get('/roles', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM app_roles ORDER BY sort_order ASC, id ASC').all());
});

router.post('/roles', requireAdmin, (req, res) => {
  const { name, description, emoji, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM app_roles').get().m ?? -1;
    db.prepare('INSERT INTO app_roles (name, description, emoji, color, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), description?.trim() || '', emoji?.trim() || '📋', color?.trim() || '#6c63ff', maxOrder + 1);
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'A role with that name already exists' }); }
});

router.put('/roles/:id', requireAdmin, (req, res) => {
  const { name, description, emoji, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('UPDATE app_roles SET name = ?, description = ?, emoji = ?, color = ? WHERE id = ?')
    .run(name.trim(), description?.trim() || '', emoji?.trim() || '📋', color?.trim() || '#6c63ff', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Role not found' });
  res.json({ success: true });
});

router.patch('/roles/:id/toggle', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT active FROM app_roles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Role not found' });
  db.prepare('UPDATE app_roles SET active = ? WHERE id = ?').run(row.active ? 0 : 1, req.params.id);
  res.json({ success: true, active: !row.active });
});

router.delete('/roles/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM app_roles WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Role not found' });
  res.json({ success: true });
});

// ── Channel Lock / Unlock ─────────────────────────────────────

async function discordChannelRequest(method, channelId, body = null) {
  const TOKEN     = process.env.TOKEN;
  const GUILD_ID  = process.env.DISCORD_GUILD_ID;

  if (!TOKEN || !GUILD_ID) {
    throw new Error('TOKEN and DISCORD_GUILD_ID must be set to manage channels');
  }

  const opts = {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const r = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/permissions/${GUILD_ID}`,
    opts,
  );

  if (!r.ok && r.status !== 204) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Discord API returned ${r.status}`);
  }
  return true;
}

router.post('/channels/:channelId/lock', requireAdmin, async (req, res) => {
  try {
    // Deny SEND_MESSAGES (2048) for @everyone (role ID = guild ID)
    await discordChannelRequest('PUT', req.params.channelId, { type: 0, deny: '2048' });
    res.json({ success: true, locked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/channels/:channelId/unlock', requireAdmin, async (req, res) => {
  try {
    // Remove @everyone override — restores channel to its default/category permissions
    await discordChannelRequest('DELETE', req.params.channelId);
    res.json({ success: true, locked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
