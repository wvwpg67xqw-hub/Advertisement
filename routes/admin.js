import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import discordPkg from 'discord.js';
const { EmbedBuilder } = discordPkg;
import { sendLog, buildStaffUpdateEmbed } from '../src/utils.js';
import { getGuild as getBotGuild } from '../src/database.js';

const router = Router();

let discordClient = null;
export function setDiscordClient(client) {
  discordClient = client;
}

// ── Role map (matches server.js) ──────────────────────────────────────────────

const STAFF_ROLE_ID = '1501682950331301908';
const roleMap = {
  Moderator:         { role: '1495222811755806740', team: '1501681813398093955' },
  'Human Resources': { role: '1495222820400009246', team: '1501681511324451028' },
  Partnership:       { role: '1495222796517773335', team: '1501681321343193160' },
};

// ── Post decision embed to the application thread ─────────────────────────────

async function postThreadDecision(app, decision, adminUsername) {
  if (!discordClient || !app.discord_thread_id) return;
  try {
    const thread = await discordClient.channels.fetch(app.discord_thread_id).catch(() => null);
    if (!thread) return;
    const accepted = decision === 'accepted';
    const embed = new EmbedBuilder()
      .setTitle(accepted ? '✅ Application Accepted' : '❌ Application Denied')
      .setColor(accepted ? 0x22c55e : 0xef4444)
      .setDescription(
        accepted
          ? `**${app.username}** has been accepted for **${app.role}**. Roles will be assigned.`
          : `**${app.username}**'s application for **${app.role}** has been denied.`
      )
      .addFields({ name: '🛡️ Reviewed by', value: adminUsername || 'Admin', inline: true })
      .setTimestamp();
    await thread.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error('Thread decision post failed:', err.message);
  }
}

// ── Assign Discord roles when accepting ───────────────────────────────────────

async function assignRolesOnAccept(app, reviewerUsername) {
  if (!discordClient) return;
  const guildId = process.env.MAIN_GUILD_ID;
  if (!guildId) return;
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(app.userId).catch(() => null);
    if (!member) return;

    const roles = roleMap[app.role];
    const toAdd = [STAFF_ROLE_ID];
    if (roles?.role) toAdd.push(roles.role);
    if (roles?.team) toAdd.push(roles.team);
    await member.roles.add(toAdd).catch(e => console.error('Role add failed:', e.message));

    await member.send({
      content: `✅ Your application for **${app.role}** has been accepted! Welcome to the team.`,
    }).catch(() => null);

    // Post to staff updates channel
    try {
      const botConfig = getBotGuild(guildId);
      const staffEmbed = buildStaffUpdateEmbed('hired', {
        userId: app.userId,
        moderatorId: null,
        role: app.role,
      });
      await sendLog(guild, botConfig, 'staff_updates', staffEmbed);
    } catch {}
  } catch (err) {
    console.error('assignRolesOnAccept error:', err.message);
  }
}

// ── Also notify applicant on deny ─────────────────────────────────────────────

async function notifyApplicantDenied(app) {
  if (!discordClient) return;
  const guildId = process.env.MAIN_GUILD_ID;
  if (!guildId) return;
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(app.userId).catch(() => null);
    if (member) {
      await member.send({
        content: `❌ Your application for **${app.role}** was reviewed and has been denied. You may apply again in the future.`,
      }).catch(() => null);
    }
  } catch {}
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

  const adminUsername = req.session.user?.username || 'Admin';

  // Fire-and-forget: thread post + role assignment + DM (non-blocking)
  Promise.all([
    postThreadDecision(app, 'accepted', adminUsername),
    assignRolesOnAccept(app, adminUsername),
  ]).catch(err => console.error('Accept side effects failed:', err.message));

  res.json({ success: true });
});

router.post('/applications/:id/deny', requireAdmin, async (req, res) => {
  const app = db.getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Already ${app.status}` });

  db.updateApplicationStatus(req.params.id, 'denied');

  const adminUsername = req.session.user?.username || 'Admin';

  // Fire-and-forget: thread post + DM
  Promise.all([
    postThreadDecision(app, 'denied', adminUsername),
    notifyApplicantDenied(app),
  ]).catch(err => console.error('Deny side effects failed:', err.message));

  res.json({ success: true });
});

// ── User Blacklist ─────────────────────────────────────────────────────────────

router.get('/blacklist', requireAdmin, (req, res) => {
  res.json(db.getBlacklist());
});

router.post('/blacklist', requireAdmin, (req, res) => {
  const { userId, username, reason } = req.body;
  if (!userId || !username || !reason) return res.status(400).json({ error: 'Missing fields' });
  if (String(reason).length > 500) return res.status(400).json({ error: 'Reason too long (max 500 chars)' });
  try {
    db.insertBlacklist(String(userId).slice(0, 30), String(username).slice(0, 100), String(reason).slice(0, 500));
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

// ── IP Blacklist ───────────────────────────────────────────────────────────────

router.get('/ip-blacklist', requireAdmin, (req, res) => {
  res.json(db.getIpBlacklist());
});

router.post('/ip-blacklist', requireAdmin, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]{2,39}$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  try {
    db.addIpBlacklist(String(ip).slice(0, 45), String(reason || 'Manual').slice(0, 500), req.session.user?.userId);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'IP already blacklisted' });
  }
});

router.delete('/ip-blacklist/:id', requireAdmin, (req, res) => {
  const result = db.removeIpBlacklist(req.params.id);
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
    db.insertAdmin(String(userId).slice(0, 30), String(username).slice(0, 100), role || 'admin');
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

router.post('/roles', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol, nextId } = await import('../jsondb.js');
    const { name, description, emoji, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const rows = readCol('app_roles');
    if (rows.find(r => r.name.toLowerCase() === String(name).toLowerCase())) {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    const id = nextId('app_roles');
    rows.push({
      id,
      name: String(name).slice(0, 100),
      description: String(description || '').slice(0, 500),
      emoji: String(emoji || '📋').slice(0, 8),
      color: String(color || '#6c63ff').slice(0, 20),
      active: 1,
      sort_order: rows.length,
    });
    writeCol('app_roles', rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const i = rows.findIndex(r => r.id === Number(req.params.id));
    if (i < 0) return res.status(404).json({ error: 'Role not found' });
    const { name, description, emoji, color } = req.body;
    if (name) rows[i].name = String(name).slice(0, 100);
    if (description !== undefined) rows[i].description = String(description).slice(0, 500);
    if (emoji) rows[i].emoji = String(emoji).slice(0, 8);
    if (color) rows[i].color = String(color).slice(0, 20);
    writeCol('app_roles', rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/roles/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const i = rows.findIndex(r => r.id === Number(req.params.id));
    if (i < 0) return res.status(404).json({ error: 'Role not found' });
    rows[i].active = rows[i].active ? 0 : 1;
    writeCol('app_roles', rows);
    res.json({ success: true, active: rows[i].active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const next = rows.filter(r => r.id !== Number(req.params.id));
    if (next.length === rows.length) return res.status(404).json({ error: 'Role not found' });
    writeCol('app_roles', next);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Discord Channel Lock / Unlock ─────────────────────────────────────────────

const VALID_CHANNEL_ID = /^\d{17,20}$/;

async function discordChannelRequest(method, channelId, body = null) {
  const TOKEN = process.env.TOKEN;
  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  if (!TOKEN || !GUILD_ID) throw new Error('Missing TOKEN or DISCORD_GUILD_ID');
  if (!VALID_CHANNEL_ID.test(channelId)) throw new Error('Invalid channel ID');
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
