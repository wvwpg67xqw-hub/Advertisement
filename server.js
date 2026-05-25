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

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-super-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── Seed initial admin from env ───────────────────────────────
const ADMIN_ID       = process.env.ADMIN_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Owner';
if (ADMIN_ID) {
  try {
    db.prepare('INSERT OR IGNORE INTO admins (userId, username, role) VALUES (?, ?, ?)').run(ADMIN_ID, ADMIN_USERNAME, 'owner');
    console.log(`✅ Admin seeded: ${ADMIN_USERNAME} (${ADMIN_ID})`);
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

// ── Discord OAuth ─────────────────────────────────────────────

app.get('/api/auth/login', (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send('Discord OAuth not configured. Set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI.');
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code', scope: 'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) { console.error('Token exchange failed:', await tokenRes.text()); return res.redirect('/?error=token_failed'); }
    const { access_token } = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return res.redirect('/?error=user_fetch_failed');
    const discordUser = await userRes.json();

    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 6n)}.png`;

    const user = { userId: discordUser.id, username: discordUser.username, avatar };

    db.prepare(`INSERT INTO users (userId, username, avatar) VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET username = excluded.username, avatar = excluded.avatar`)
      .run(user.userId, user.username, user.avatar);

    req.session.user = user;
    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=oauth_error');
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const admin = db.prepare('SELECT * FROM admins WHERE userId = ?').get(req.session.user.userId);
  res.json({ ...req.session.user, isAdmin: !!admin });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Public: active application roles ─────────────────────────
app.get('/api/roles', (req, res) => {
  res.json(db.prepare('SELECT * FROM app_roles WHERE active = 1 ORDER BY sort_order ASC, id ASC').all());
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

// ── Serve React build ─────────────────────────────────────────
const clientDist = join(__dirname, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send(`<html><body style="background:#0b0b10;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
    <h1>⚙️ Building client...</h1>
    <p>Run <code>npm run build</code> then restart.</p>
  </body></html>`));
}

app.listen(PORT, () => console.log(`🚀 Staff Portal running on port ${PORT}`));
