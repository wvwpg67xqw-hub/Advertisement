import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';

const router = Router();

router.post('/', requireAuth, (req, res) => {
  const { role, age, timezone, experience, motivation, availability } = req.body;
  const { userId, username } = req.session.user;

  if (!role || !age || !timezone || !experience || !motivation || !availability) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (isBlacklisted(userId)) {
    return res.status(403).json({ error: 'You are blacklisted and cannot apply' });
  }

  const existing = db.prepare(
    "SELECT * FROM applications WHERE userId = ? AND role = ? AND status = 'pending'"
  ).get(userId, role);

  if (existing) {
    return res.status(409).json({ error: 'You already have a pending application for this role' });
  }

  db.prepare(`
    INSERT INTO applications (userId, username, role, age, timezone, experience, motivation, availability)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, username, role, age, timezone, experience, motivation, availability);

  res.json({ success: true, message: 'Application submitted successfully' });
});

export default router;
