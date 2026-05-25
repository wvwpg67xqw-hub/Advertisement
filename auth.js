import db from './db.js';

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE userId = ?').get(req.session.user.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function isBlacklisted(userId) {
  return !!db.prepare('SELECT 1 FROM blacklist WHERE userId = ?').get(userId);
}
