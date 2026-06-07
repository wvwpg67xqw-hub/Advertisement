import { readCol, writeCol, nextId, ts } from './jsondb.js';

// ── Seed managed bots ─────────────────────────────────────────────────────────
if (!readCol('managed_bots').length) {
  writeCol('managed_bots', [
    {
      id: 1,
      name: 'Staff Portal Bot',
      clientId: '1508745748815282217',
      description: 'The main staff management bot — handles moderation, breaks, requests, and more.',
      permissions: '8',
      createdAt: ts(),
    },
    {
      id: 2,
      name: 'Applications Bot',
      clientId: '1511590386311762022',
      description: 'Handles staff applications and the application process.',
      permissions: '8',
      createdAt: ts(),
    },
  ]);
} else {
  // Migration: ensure Applications Bot is present
  const _bots = readCol('managed_bots');
  if (!_bots.find(b => b.clientId === '1511590386311762022')) {
    _bots.push({
      id: nextId('managed_bots'),
      name: 'Applications Bot',
      clientId: '1511590386311762022',
      description: 'Handles staff applications and the application process.',
      permissions: '8',
      createdAt: ts(),
    });
    writeCol('managed_bots', _bots);
  }
}

// ── Seed default app roles ────────────────────────────────────────────────────
if (!readCol('app_roles').length) {
  writeCol('app_roles', [
    { id: 1, name: 'Moderator',       description: 'Enforce community rules, manage disputes, handle reports, and maintain a safe environment for all members.', emoji: '🔨', color: '#6c63ff', active: 1, sort_order: 0 },
    { id: 2, name: 'Human Resources', description: 'Onboard new staff, handle staff issues, manage promotions, and ensure team wellbeing and cohesion.',           emoji: '🤝', color: '#22c55e', active: 1, sort_order: 1 },
    { id: 3, name: 'Partnership',     description: 'Build relationships with other communities, negotiate partnership deals, and grow our network.',                emoji: '🌐', color: '#f59e0b', active: 1, sort_order: 2 },
  ]);
}

// ── Seed default apply servers ────────────────────────────────────────────────
if (!readCol('apply_servers').length) {
  writeCol('apply_servers', []);
}

function parseApp(app) {
  if (!app) return null;
  return {
    ...app,
    answers: app.answers ? JSON.parse(app.answers) : [],
  };
}

const db = {
  // ── Users ──────────────────────────────────────────────────────────────────
  upsertUser(userId, username, avatar) {
    const rows = readCol('users');
    const i = rows.findIndex(u => u.userId === userId);
    const isNew = i < 0;
    if (i >= 0) { rows[i].username = username; rows[i].avatar = avatar; rows[i].lastSeen = ts(); }
    else rows.push({ id: nextId('users'), userId, username, avatar: avatar ?? null, role: 'user', createdAt: ts(), lastSeen: ts() });
    writeCol('users', rows);
    return { isNew };
  },

  // ── Admins ─────────────────────────────────────────────────────────────────
  seedAdmin(userId, username, role) {
    const rows = readCol('admins');
    if (rows.find(a => a.userId === userId)) return;
    rows.push({ id: nextId('admins'), userId, username, role, createdAt: ts() });
    writeCol('admins', rows);
  },

  getAdmin(userId) {
    return readCol('admins').find(a => a.userId === userId) ?? null;
  },

  getAllAdmins() {
    return readCol('admins').sort((a, b) => b.createdAt - a.createdAt);
  },

  insertAdmin(userId, username, role) {
    const rows = readCol('admins');
    if (rows.find(a => a.userId === userId)) throw new Error('Admin already exists');
    const entry = { id: nextId('admins'), userId, username, role: role || 'admin', createdAt: ts() };
    rows.push(entry);
    writeCol('admins', rows);
    return entry;
  },

  deleteAdmin(id) {
    const rows = readCol('admins');
    const next = rows.filter(a => a.id !== Number(id));
    writeCol('admins', next);
    return { changes: rows.length - next.length };
  },

  deleteAdminByUserId(userId) {
    const rows = readCol('admins');
    const next = rows.filter(a => a.userId !== userId);
    writeCol('admins', next);
    return { changes: rows.length - next.length };
  },

  // ── App Roles ──────────────────────────────────────────────────────────────
  getActiveRoles() {
    return readCol('app_roles')
      .filter(r => r.active === 1)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  },

  getAllRoles() {
    return readCol('app_roles').sort((a, b) => a.sort_order - b.sort_order);
  },

  getRole(name) {
    return readCol('app_roles').find(r => r.name === name && r.active === 1) ?? null;
  },

  // ── Applications ───────────────────────────────────────────────────────────
  getApplication(id) {
    return parseApp(readCol('applications').find(a => a.id === Number(id)) ?? null);
  },

  getApplications(status) {
    let rows = readCol('applications');
    if (status && ['pending', 'accepted', 'denied'].includes(status)) {
      rows = rows.filter(a => a.status === status);
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt).map(parseApp);
  },

  getPendingApplication(userId, role) {
    return readCol('applications').find(
      a => a.userId === userId && a.role === role && a.status === 'pending'
    ) ?? null;
  },

  insertApplication({ userId, username, avatar, role, answers, guildId }) {
    const rows = readCol('applications');
    const id = nextId('applications');
    const age = Array.isArray(answers) ? (answers[0] || '') : '';
    const timezone = Array.isArray(answers) ? (answers[1] || '') : '';
    rows.push({
      id, userId, username, avatar: avatar ?? null, role,
      guildId: guildId || null,
      age, timezone,
      answers: Array.isArray(answers) ? JSON.stringify(answers) : null,
      discord_message_id: null,
      discord_thread_id: null,
      status: 'pending', createdAt: ts(),
    });
    writeCol('applications', rows);
    return { lastInsertRowid: id };
  },

  updateApplicationStatus(id, status) {
    const rows = readCol('applications');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) rows[i].status = status;
    writeCol('applications', rows);
  },

  updateApplicationDiscordIds(id, messageId, threadId) {
    const rows = readCol('applications');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) {
      rows[i].discord_message_id = messageId ?? null;
      rows[i].discord_thread_id = threadId ?? null;
      writeCol('applications', rows);
    }
  },

  // ── Apply Servers ──────────────────────────────────────────────────────────
  getApplyServers(activeOnly = false) {
    const rows = readCol('apply_servers');
    const filtered = activeOnly ? rows.filter(s => s.active === 1) : rows;
    return filtered.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.id - b.id);
  },

  getApplyServer(id) {
    return readCol('apply_servers').find(s => s.id === Number(id)) ?? null;
  },

  getApplyServerByGuildId(guildId) {
    return readCol('apply_servers').find(s => s.guildId === guildId) ?? null;
  },

  insertApplyServer({ guildId, name, short_name, description, icon_url, log_channel_id, apply_channel_id, sort_order }) {
    const rows = readCol('apply_servers');
    if (rows.find(s => s.guildId === guildId)) throw new Error('Server already exists');
    const entry = {
      id: nextId('apply_servers'),
      guildId, name, short_name: short_name || name,
      description: description || '',
      icon_url: icon_url || null,
      log_channel_id: log_channel_id || null,
      apply_channel_id: apply_channel_id || null,
      active: 1,
      sort_order: sort_order ?? rows.length,
      createdAt: ts(),
    };
    rows.push(entry);
    writeCol('apply_servers', rows);
    return entry;
  },

  updateApplyServer(id, fields) {
    const rows = readCol('apply_servers');
    const i = rows.findIndex(s => s.id === Number(id));
    if (i < 0) throw new Error('Server not found');
    const allowed = ['name', 'short_name', 'description', 'icon_url', 'log_channel_id', 'apply_channel_id', 'active', 'sort_order'];
    for (const key of allowed) {
      if (key in fields) rows[i][key] = fields[key];
    }
    writeCol('apply_servers', rows);
    return rows[i];
  },

  deleteApplyServer(id) {
    const rows = readCol('apply_servers');
    const next = rows.filter(s => s.id !== Number(id));
    writeCol('apply_servers', next);
    return { changes: rows.length - next.length };
  },

  // ── User Blacklist ─────────────────────────────────────────────────────────
  getBlacklist() {
    return readCol('web_blacklist').sort((a, b) => b.createdAt - a.createdAt);
  },

  insertBlacklist(userId, username, reason) {
    const rows = readCol('web_blacklist');
    if (rows.find(b => b.userId === userId)) throw new Error('Already blacklisted');
    const entry = { id: nextId('web_blacklist'), userId, username, reason, createdAt: ts() };
    rows.push(entry);
    writeCol('web_blacklist', rows);
    return entry;
  },

  deleteBlacklist(id) {
    const rows = readCol('web_blacklist');
    const next = rows.filter(b => b.id !== Number(id));
    writeCol('web_blacklist', next);
    return { changes: rows.length - next.length };
  },

  deleteBlacklistByUserId(userId) {
    const rows = readCol('web_blacklist');
    const next = rows.filter(b => b.userId !== userId);
    writeCol('web_blacklist', next);
    return { changes: rows.length - next.length };
  },

  isBlacklisted(userId) {
    return !!readCol('web_blacklist').find(b => b.userId === userId);
  },

  getBlacklistEntry(userId) {
    return readCol('web_blacklist').find(b => b.userId === userId) ?? null;
  },

  // ── IP Blacklist ───────────────────────────────────────────────────────────
  getIpBlacklist() {
    return readCol('ip_blacklist').sort((a, b) => b.createdAt - a.createdAt);
  },

  addIpBlacklist(ip, reason, addedBy) {
    const rows = readCol('ip_blacklist');
    if (rows.find(b => b.ip === ip)) throw new Error('IP already blacklisted');
    const entry = { id: nextId('ip_blacklist'), ip, reason: reason || 'No reason given', addedBy: addedBy || 'system', createdAt: ts() };
    rows.push(entry);
    writeCol('ip_blacklist', rows);
    return entry;
  },

  removeIpBlacklist(id) {
    const rows = readCol('ip_blacklist');
    const next = rows.filter(b => b.id !== Number(id));
    writeCol('ip_blacklist', next);
    return { changes: rows.length - next.length };
  },

  removeIpBlacklistByIp(ip) {
    const rows = readCol('ip_blacklist');
    const next = rows.filter(b => b.ip !== ip);
    writeCol('ip_blacklist', next);
    return { changes: rows.length - next.length };
  },

  isIpBlacklisted(ip) {
    if (!ip || ip === 'unknown') return false;
    return !!readCol('ip_blacklist').find(b => b.ip === ip);
  },

  // ── Ban Appeals ────────────────────────────────────────────────────────────
  insertAppeal({ userId, username, avatar, reason }) {
    const rows = readCol('appeals');
    const id = nextId('appeals');
    rows.push({ id, userId, username, avatar: avatar ?? null, reason, status: 'pending', createdAt: ts() });
    writeCol('appeals', rows);
    return { id };
  },

  getAppeal(id) {
    return readCol('appeals').find(a => a.id === Number(id)) ?? null;
  },

  getAppeals(status) {
    let rows = readCol('appeals');
    if (status) rows = rows.filter(a => a.status === status);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  getUserAppeal(userId) {
    const rows = readCol('appeals');
    return rows
      .filter(a => a.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },

  updateAppealStatus(id, status) {
    const rows = readCol('appeals');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) { rows[i].status = status; rows[i].reviewedAt = ts(); }
    writeCol('appeals', rows);
    return rows[i] ?? null;
  },

  // ── IP Appeals ─────────────────────────────────────────────────────────────

  insertIpAppeal(ip, reason) {
    const rows = readCol('ip_appeals');
    if (rows.find(a => a.ip === ip && a.status === 'pending')) throw new Error('A pending appeal for this IP already exists');
    const entry = { id: nextId('ip_appeals'), ip, reason: String(reason).slice(0, 2000), status: 'pending', createdAt: ts() };
    rows.push(entry);
    writeCol('ip_appeals', rows);
    return entry;
  },

  getIpAppeal(id) {
    return readCol('ip_appeals').find(a => a.id === Number(id)) ?? null;
  },

  getIpAppeals(status) {
    let rows = readCol('ip_appeals');
    if (status && ['pending', 'accepted', 'denied'].includes(status)) rows = rows.filter(a => a.status === status);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  updateIpAppealStatus(id, status) {
    const rows = readCol('ip_appeals');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) { rows[i].status = status; rows[i].reviewedAt = ts(); }
    writeCol('ip_appeals', rows);
    return rows[i] ?? null;
  },

  // ── Managed Bots ───────────────────────────────────────────────────────────

  getAllBots() {
    return readCol('managed_bots').sort((a, b) => a.createdAt - b.createdAt);
  },

  addBot(name, clientId, description, permissions) {
    const rows = readCol('managed_bots');
    if (rows.find(b => b.clientId === clientId)) throw new Error('A bot with this Client ID already exists');
    const entry = { id: nextId('managed_bots'), name, clientId, description: description || '', permissions: permissions || '8', createdAt: ts() };
    rows.push(entry);
    writeCol('managed_bots', rows);
    return entry;
  },

  updateBot(id, fields) {
    const rows = readCol('managed_bots');
    const i = rows.findIndex(b => b.id === Number(id));
    if (i < 0) return null;
    rows[i] = { ...rows[i], ...fields };
    writeCol('managed_bots', rows);
    return rows[i];
  },

  removeBot(id) {
    const rows = readCol('managed_bots');
    const i = rows.findIndex(b => b.id === Number(id));
    if (i < 0) return null;
    const [removed] = rows.splice(i, 1);
    writeCol('managed_bots', rows);
    return removed;
  },
};

export default db;
