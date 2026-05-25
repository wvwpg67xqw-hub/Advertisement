import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import db from './db.js';
import applicationRoutes from './routes/applications.js';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-super-secret-key-32chars',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Seed initial admin from env ───────────────────────────────
const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
if (ADMIN_ID) {
  try {
    db.prepare('INSERT OR IGNORE INTO admins (userId, username, role) VALUES (?, ?, ?)').run(ADMIN_ID, ADMIN_USERNAME, 'owner');
    console.log(`✅ Admin seeded: ${ADMIN_USERNAME} (${ADMIN_ID})`);
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

// ── Auth Routes ───────────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const admin = db.prepare('SELECT * FROM admins WHERE userId = ?').get(req.session.user.userId);
  res.json({ ...req.session.user, isAdmin: !!admin });
});

app.post('/api/auth/login', (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) {
    return res.status(400).json({ error: 'Username and User ID are required' });
  }

  const user = { username: username.trim(), userId: userId.trim() };

  // Upsert user record
  db.prepare(`
    INSERT INTO users (userId, username) VALUES (?, ?)
    ON CONFLICT(userId) DO UPDATE SET username = excluded.username
  `).run(user.userId, user.username);

  req.session.user = user;
  const admin = db.prepare('SELECT * FROM admins WHERE userId = ?').get(user.userId);
  res.json({ success: true, user: { ...user, isAdmin: !!admin } });
});

app.get('/api/auth/login', (req, res) => {
  res.redirect('/login');
});

app.get('/api/auth/callback', (req, res) => {
  res.redirect('/');
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

// ── Serve React build ─────────────────────────────────────────
const clientDist = join(__dirname, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <html><body style="background:#0f0f13;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
        <h1>⚙️ Building client...</h1>
        <p>Run <code style="background:#1a1a24;padding:4px 8px;border-radius:4px">npm run build</code> then restart the server.</p>
      </body></html>
    `);
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Staff Portal running on port ${PORT}`);
});
