import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/applications', requireAdmin, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM applications';
  const params = [];

  if (status && ['pending', 'accepted', 'denied'].includes(status)) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY createdAt DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.post('/applications/:id/accept', requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE applications SET status = 'accepted' WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Application not found' });
  res.json({ success: true });
});

router.post('/applications/:id/deny', requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE applications SET status = 'denied' WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Application not found' });
  res.json({ success: true });
});

router.get('/blacklist', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM blacklist ORDER BY createdAt DESC').all());
});

router.post('/blacklist', requireAdmin, (req, res) => {
  const { userId, username, reason } = req.body;
  if (!userId || !username || !reason) {
    return res.status(400).json({ error: 'userId, username, and reason are required' });
  }
  try {
    db.prepare('INSERT INTO blacklist (userId, username, reason) VALUES (?, ?, ?)').run(userId, username, reason);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'User is already blacklisted' });
  }
});

router.delete('/blacklist/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM blacklist WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

router.get('/admins', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM admins ORDER BY createdAt DESC').all());
});

router.post('/admins', requireAdmin, (req, res) => {
  const { userId, username, role } = req.body;
  if (!userId || !username) {
    return res.status(400).json({ error: 'userId and username are required' });
  }
  try {
    db.prepare('INSERT INTO admins (userId, username, role) VALUES (?, ?, ?)').run(userId, username, role || 'admin');
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Admin already exists' });
  }
});

router.delete('/admins/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found' });
  res.json({ success: true });
});

export default router;
