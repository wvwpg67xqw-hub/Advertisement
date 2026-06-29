import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE  = path.join(DATA_DIR, 'modmail.json');

const DEFAULT_MENU_OPTIONS = [
  { value: 'Modmail',      label: 'General Support', description: 'Talk to staff about anything',    emoji: '📬', categoryId: null },
  { value: 'Partnerships', label: 'Partnership',     description: 'Propose a partnership with us',  emoji: '🤝', categoryId: null },
  { value: 'Ping on Join', label: 'Ping on Join',    description: 'Request a ping-on-join setup',   emoji: '📥', categoryId: null },
  { value: 'Appeals',      label: 'Appeal',          description: 'Appeal a punishment or ban',     emoji: '⚖️', categoryId: null },
  { value: 'Applications', label: 'Apply',           description: 'Apply for a staff or other role',emoji: '📝', categoryId: null },
];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    return { threads: {}, snippets: {}, pending: {}, blocklist: [], menuOptions: [...DEFAULT_MENU_OPTIONS] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!raw.pending)     raw.pending     = {};
    if (!raw.blocklist)   raw.blocklist   = [];
    if (!raw.menuOptions || raw.menuOptions.length === 0) raw.menuOptions = [...DEFAULT_MENU_OPTIONS];
    return raw;
  } catch {
    return { threads: {}, snippets: {}, pending: {}, blocklist: [], menuOptions: [...DEFAULT_MENU_OPTIONS] };
  }
}

function save(db) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── Threads ───────────────────────────────────────────────────────────────────

export function getThreadByChannel(channelId) {
  const db = load();
  return Object.values(db.threads).find(t => t.channelId === channelId) ?? null;
}

export function getThreadByUser(userId) {
  const db = load();
  return Object.values(db.threads).find(t => t.userId === userId && t.open) ?? null;
}

export function createThread(thread) {
  const db = load();
  db.threads[thread.threadId] = thread;
  save(db);
}

export function updateThread(threadId, updates) {
  const db = load();
  if (db.threads[threadId]) {
    db.threads[threadId] = { ...db.threads[threadId], ...updates };
    save(db);
  }
}

export function closeThread(threadId) {
  const db = load();
  if (db.threads[threadId]) {
    db.threads[threadId].open = false;
    save(db);
  }
}

export function addSubscriber(channelId, userId) {
  const db = load();
  const thread = Object.values(db.threads).find(t => t.channelId === channelId);
  if (thread && !thread.subscribers.includes(userId)) {
    thread.subscribers.push(userId);
    save(db);
  }
}

export function removeSubscriber(channelId, userId) {
  const db = load();
  const thread = Object.values(db.threads).find(t => t.channelId === channelId);
  if (thread) {
    thread.subscribers = thread.subscribers.filter(s => s !== userId);
    save(db);
  }
}

// ── Pending selections ────────────────────────────────────────────────────────

export function setPending(userId, menuMessageId, initialMessage) {
  const db = load();
  db.pending[userId] = { menuMessageId, initialMessage, createdAt: Date.now() };
  save(db);
}

export function getPending(userId) {
  const db = load();
  return db.pending[userId] ?? null;
}

export function clearPending(userId) {
  const db = load();
  delete db.pending[userId];
  save(db);
}

// ── Menu Options ──────────────────────────────────────────────────────────────

export function getMenuOptions() {
  return load().menuOptions;
}

export function updateMenuOption(value, updates) {
  const db = load();
  const idx = db.menuOptions.findIndex(o => o.value === value);
  if (idx !== -1) {
    db.menuOptions[idx] = { ...db.menuOptions[idx], ...updates };
    save(db);
  }
}

export function addMenuOption(option) {
  const db = load();
  db.menuOptions.push(option);
  save(db);
}

// ── Blocklist ─────────────────────────────────────────────────────────────────

export function isBlocked(userId) {
  const db = load();
  return db.blocklist.includes(userId);
}

export function blockUser(userId) {
  const db = load();
  if (!db.blocklist.includes(userId)) {
    db.blocklist.push(userId);
    save(db);
  }
}

export function unblockUser(userId) {
  const db = load();
  const idx = db.blocklist.indexOf(userId);
  if (idx === -1) return false;
  db.blocklist.splice(idx, 1);
  save(db);
  return true;
}

// ── Snippets ──────────────────────────────────────────────────────────────────

export function getSnippet(name) {
  const db = load();
  return db.snippets[name.toLowerCase()] ?? null;
}

export function addSnippet(name, content) {
  const db = load();
  db.snippets[name.toLowerCase()] = { name: name.toLowerCase(), content };
  save(db);
}

export function removeSnippet(name) {
  const db = load();
  if (db.snippets[name.toLowerCase()]) {
    delete db.snippets[name.toLowerCase()];
    save(db);
    return true;
  }
  return false;
}

export function listSnippets() {
  const db = load();
  return Object.values(db.snippets);
}
