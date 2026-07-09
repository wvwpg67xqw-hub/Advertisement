import { readCol, writeCol, nextId, ts } from './jsondb.js';

// ── Seed managed bots ─────────────────────────────────────────────────────────
async function seed() {
  const bots = await readCol('managed_bots');
  if (!bots.length) {
    await writeCol('managed_bots', [
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
    const _bots = await readCol('managed_bots');
    if (!_bots.find(b => b.clientId === '1511590386311762022')) {
      _bots.push({
        id: await nextId('managed_bots'),
        name: 'Applications Bot',
        clientId: '1511590386311762022',
        description: 'Handles staff applications and the application process.',
        permissions: '8',
        createdAt: ts(),
      });
      await writeCol('managed_bots', _bots);
    }
  }

  // ── Seed default app roles ────────────────────────────────────────────────
  const roles = await readCol('app_roles');
  if (!roles.length) {
    await writeCol('app_roles', [
      { id: 1, name: 'Moderator',       description: 'Enforce community rules, manage disputes, handle reports, and maintain a safe environment for all members.', emoji: '🔨', color: '#6c63ff', active: 1, sort_order: 0 },
      { id: 2, name: 'Human Resources', description: 'Onboard new staff, handle staff issues, manage promotions, and ensure team wellbeing and cohesion.',           emoji: '🤝', color: '#22c55e', active: 1, sort_order: 1 },
      { id: 3, name: 'Partnership',     description: 'Build relationships with other communities, negotiate partnership deals, and grow our network.',                emoji: '🌐', color: '#f59e0b', active: 1, sort_order: 2 },
    ]);
  }

  // ── Seed default apply servers ──────────────────────────────────────────
  const servers = await readCol('apply_servers');
  if (!servers.length) {
    await writeCol('apply_servers', []);
  }
}

const seedPromise = seed();

function parseApp(app) {
  if (!app) return null;
  return {
    ...app,
    answers: app.answers ? JSON.parse(app.answers) : [],
  };
}

const db = {
  ready: seedPromise,

  // ── Users ──────────────────────────────────────────────────────────────────
  async upsertUser(userId, username, avatar) {
    const rows = await readCol('users');
    const i = rows.findIndex(u => u.userId === userId);
    const isNew = i < 0;
    if (i >= 0) { rows[i].username = username; rows[i].avatar = avatar; rows[i].lastSeen = ts(); }
    else rows.push({ id: await nextId('users'), userId, username, avatar: avatar ?? null, role: 'user', createdAt: ts(), lastSeen: ts() });
    await writeCol('users', rows);
    return { isNew };
  },

  async saveUserToken(userId, accessToken) {
    const rows = await readCol('users');
    const i = rows.findIndex(u => u.userId === userId);
    if (i >= 0) { rows[i].accessToken = accessToken; await writeCol('users', rows); }
  },

  async getUserToken(userId) {
    const rows = await readCol('users');
    return rows.find(u => u.userId === userId)?.accessToken ?? null;
  },

  // ── Admins ─────────────────────────────────────────────────────────────────
  async seedAdmin(userId, username, role) {
    const rows = await readCol('admins');
    if (rows.find(a => a.userId === userId)) return;
    rows.push({ id: await nextId('admins'), userId, username, role, createdAt: ts() });
    await writeCol('admins', rows);
  },

  async getAdmin(userId) {
    const rows = await readCol('admins');
    return rows.find(a => a.userId === userId) ?? null;
  },

  async getAllAdmins() {
    const rows = await readCol('admins');
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  async insertAdmin(userId, username, role) {
    const rows = await readCol('admins');
    if (rows.find(a => a.userId === userId)) throw new Error('Admin already exists');
    const entry = { id: await nextId('admins'), userId, username, role: role || 'admin', createdAt: ts() };
    rows.push(entry);
    await writeCol('admins', rows);
    return entry;
  },

  async deleteAdmin(id) {
    const rows = await readCol('admins');
    const next = rows.filter(a => a.id !== Number(id));
    await writeCol('admins', next);
    return { changes: rows.length - next.length };
  },

  async deleteAdminByUserId(userId) {
    const rows = await readCol('admins');
    const next = rows.filter(a => a.userId !== userId);
    await writeCol('admins', next);
    return { changes: rows.length - next.length };
  },

  // ── App Roles ──────────────────────────────────────────────────────────────
  async getActiveRoles() {
    const rows = await readCol('app_roles');
    return rows
      .filter(r => r.active === 1)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  },

  async getAllRoles() {
    const rows = await readCol('app_roles');
    return rows.sort((a, b) => a.sort_order - b.sort_order);
  },

  async getRole(name) {
    const rows = await readCol('app_roles');
    return rows.find(r => r.name === name && r.active === 1) ?? null;
  },

  // ── Applications ───────────────────────────────────────────────────────────
  async getApplication(id) {
    const rows = await readCol('applications');
    return parseApp(rows.find(a => a.id === Number(id)) ?? null);
  },

  async getApplications(status) {
    let rows = await readCol('applications');
    if (status && ['pending', 'accepted', 'denied'].includes(status)) {
      rows = rows.filter(a => a.status === status);
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt).map(parseApp);
  },

  async getPendingApplication(userId, role) {
    const rows = await readCol('applications');
    return rows.find(
      a => a.userId === userId && a.role === role && a.status === 'pending'
    ) ?? null;
  },

  async insertApplication({ userId, username, avatar, role, answers, guildId, referredBy }) {
    const rows = await readCol('applications');
    const id = await nextId('applications');
    const age = Array.isArray(answers) ? (answers[0] || '') : '';
    const timezone = Array.isArray(answers) ? (answers[1] || '') : '';
    rows.push({
      id, userId, username, avatar: avatar ?? null, role,
      guildId: guildId || null,
      referredBy: referredBy || null,
      age, timezone,
      answers: Array.isArray(answers) ? JSON.stringify(answers) : null,
      discord_message_id: null,
      discord_thread_id: null,
      status: 'pending', createdAt: ts(),
    });
    await writeCol('applications', rows);
    return { lastInsertRowid: id };
  },

  async updateApplicationStatus(id, status) {
    const rows = await readCol('applications');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) rows[i].status = status;
    await writeCol('applications', rows);
  },

  async updateApplicationDiscordIds(id, messageId, threadId) {
    const rows = await readCol('applications');
    const i = rows.findIndex(a => a.id === Number(id));
    if (i >= 0) {
      rows[i].discord_message_id = messageId ?? null;
      rows[i].discord_thread_id = threadId ?? null;
      await writeCol('applications', rows);
    }
  },

  // ── Apply Servers ──────────────────────────────────────────────────────────
  async getApplyServers(activeOnly = false) {
    const rows = await readCol('apply_servers');
    const filtered = activeOnly ? rows.filter(s => s.active === 1) : rows;
    return filtered.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.id - b.id);
  },

  async getApplyServer(id) {
    const rows = await readCol('apply_servers');
    return rows.find(s => s.id === Number(id)) ?? null;
  },

  async getApplyServerByGuildId(guildId) {
    const rows = await readCol('apply_servers');
    return rows.find(s => s.guildId === guildId) ?? null;
  },

  async insertApplyServer({ guildId, name, short_name, description, icon_url, log_channel_id, apply_channel_id, sort_order, staff_role_id, role_ids }) {
    const rows = await readCol('apply_servers');
    if (rows.find(s => s.guildId === guildId)) throw new Error('Server already exists');
    const entry = {
      id: await nextId('apply_servers'),
      guildId, name, short_name: short_name || name,
      description: description || '',
      icon_url: icon_url || null,
      log_channel_id: log_channel_id || null,
      apply_channel_id: apply_channel_id || null,
      staff_role_id: staff_role_id || null,
      role_ids: role_ids ? JSON.stringify(role_ids) : null,
      active: 1,
      sort_order: sort_order ?? rows.length,
      createdAt: ts(),
    };
    rows.push(entry);
    await writeCol('apply_servers', rows);
    return entry;
  },

  async updateApplyServer(id, fields) {
    const rows = await readCol('apply_servers');
    const i = rows.findIndex(s => s.id === Number(id));
    if (i < 0) throw new Error('Server not found');
    const allowed = ['name', 'short_name', 'description', 'icon_url', 'log_channel_id', 'apply_channel_id', 'active', 'sort_order', 'staff_role_id', 'role_ids'];
    for (const key of allowed) {
      if (key in fields) {
        rows[i][key] = (key === 'role_ids' && fields[key] && typeof fields[key] === 'object')
          ? JSON.stringify(fields[key])
          : fields[key];
      }
    }
    await writeCol('apply_servers', rows);
    return rows[i];
  },

  // Upsert from Discord guild data — insert if new, refresh name/icon if existing
  async syncApplyServer({ guildId, name, icon_url }) {
    const rows = await readCol('apply_servers');
    const i = rows.findIndex(s => s.guildId === guildId);
    if (i >= 0) {
      rows[i].name     = name || rows[i].name;
      rows[i].short_name = rows[i].short_name || name || rows[i].short_name;
      rows[i].icon_url = icon_url ?? rows[i].icon_url;
      await writeCol('apply_servers', rows);
      return { created: false };
    }
    rows.push({
      id: await nextId('apply_servers'),
      guildId, name, short_name: name,
      description: '', icon_url: icon_url || null,
      log_channel_id: null, apply_channel_id: null,
      staff_role_id: null, role_ids: null,
      active: 1, sort_order: rows.length, createdAt: ts(),
    });
    await writeCol('apply_servers', rows);
    return { created: true };
  },

  async setApplyServerActive(guildId, active) {
    const rows = await readCol('apply_servers');
    const i = rows.findIndex(s => s.guildId === guildId);
    if (i >= 0) { rows[i].active = active ? 1 : 0; await writeCol('apply_servers', rows); }
  },

  async deleteApplyServer(id) {
    const rows = await readCol('apply_servers');
    const next = rows.filter(s => s.id !== Number(id));
    await writeCol('apply_servers', next);
    return { changes: rows.length - next.length };
  },

  // ── Pending ToS ────────────────────────────────────────────────────────────
  async addPendingTos(userId, username) {
    const rows = await readCol('pending_tos');
    if (rows.find(r => r.userId === userId)) return;
    rows.push({ userId, username, createdAt: ts() });
    await writeCol('pending_tos', rows);
  },

  async removePendingTos(userId) {
    const rows = (await readCol('pending_tos')).filter(r => r.userId !== userId);
    await writeCol('pending_tos', rows);
  },

  async isPendingTos(userId) {
    const rows = await readCol('pending_tos');
    return !!rows.find(r => r.userId === userId);
  },

  async getPendingTos() {
    return readCol('pending_tos');
  },

  // ── User Blacklist ─────────────────────────────────────────────────────────
  async getBlacklist() {
    const rows = await readCol('web_blacklist');
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  async insertBlacklist(userId, username, reason) {
    const rows = await readCol('web_blacklist');
    if (rows.find(b => b.userId === userId)) throw new Error('Already blacklisted');
    const entry = { id: await nextId('web_blacklist'), userId, username, reason, createdAt: ts() };
    rows.push(entry);
    await writeCol('web_blacklist', rows);
    return entry;
  },

  async deleteBlacklist(id) {
    const rows =
$$