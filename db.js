import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'app.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    role TEXT DEFAULT 'user',
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS app_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '📋',
    color TEXT NOT NULL DEFAULT '#6c63ff',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    role TEXT NOT NULL,
    age TEXT NOT NULL,
    timezone TEXT NOT NULL,
    experience TEXT NOT NULL,
    motivation TEXT NOT NULL,
    availability TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    reason TEXT NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Migrate applications table to add avatar column if missing
try { db.exec('ALTER TABLE applications ADD COLUMN avatar TEXT'); } catch {}

// Seed default roles if table is empty
const roleCount = db.prepare('SELECT COUNT(*) as c FROM app_roles').get().c;
if (roleCount === 0) {
  const defaults = [
    { name: 'Moderator',       description: 'Enforce community rules, manage disputes, handle reports, and maintain a safe environment for all members.', emoji: '🔨', color: '#6c63ff', sort_order: 0 },
    { name: 'Human Resources', description: 'Onboard new staff, handle staff issues, manage promotions, and ensure team wellbeing and cohesion.',           emoji: '🤝', color: '#22c55e', sort_order: 1 },
    { name: 'Partnership',     description: 'Build relationships with other communities, negotiate partnership deals, and grow our network.',                emoji: '🌐', color: '#f59e0b', sort_order: 2 },
  ];
  for (const r of defaults) {
    db.prepare('INSERT OR IGNORE INTO app_roles (name, description, emoji, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(r.name, r.description, r.emoji, r.color, r.sort_order);
  }
}

export default db;
