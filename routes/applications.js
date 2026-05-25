import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';

const router = Router();

async function sendWebhook(application, user) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const truncate = (str, len = 1024) => str?.length > len ? str.slice(0, len - 3) + '...' : str;

  const roleRow = db.prepare('SELECT color FROM app_roles WHERE name = ?').get(application.role);
  const hexColor = roleRow?.color?.replace('#', '') || '6c63ff';
  const color = parseInt(hexColor, 16);

  const embed = {
    title: '📋 New Staff Application',
    color,
    thumbnail: user.avatar ? { url: user.avatar } : undefined,
    fields: [
      { name: '👤 Applicant', value: `**${user.username}**\n\`${user.userId}\``, inline: true },
      { name: '📌 Role',      value: application.role,                            inline: true },
      { name: '🎂 Age',       value: application.age,                             inline: true },
      { name: '🌍 Timezone',  value: application.timezone,                        inline: true },
      { name: '📅 Availability', value: truncate(application.availability, 256),  inline: true },
      { name: '\u200b',       value: '\u200b',                                    inline: true },
      { name: '📖 Experience',  value: truncate(application.experience),          inline: false },
      { name: '💬 Motivation',  value: truncate(application.motivation),          inline: false },
    ],
    footer: { text: 'Staff Portal • Application System' },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error('Webhook send failed:', err.message);
  }
}

router.post('/', requireAuth, async (req, res) => {
  const { role, age, timezone, experience, motivation, availability } = req.body;
  const { userId, username, avatar } = req.session.user;

  if (!role || !age || !timezone || !experience || !motivation || !availability) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (isBlacklisted(userId)) {
    return res.status(403).json({ error: 'You are blacklisted and cannot apply' });
  }

  const validRole = db.prepare('SELECT * FROM app_roles WHERE name = ? AND active = 1').get(role);
  if (!validRole) {
    return res.status(400).json({ error: 'Invalid or inactive role selected' });
  }

  const existing = db.prepare(
    "SELECT * FROM applications WHERE userId = ? AND role = ? AND status = 'pending'"
  ).get(userId, role);
  if (existing) {
    return res.status(409).json({ error: 'You already have a pending application for this role' });
  }

  db.prepare(`
    INSERT INTO applications (userId, username, avatar, role, age, timezone, experience, motivation, availability)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, username, avatar ?? null, role, age, timezone, experience, motivation, availability);

  sendWebhook({ role, age, timezone, experience, motivation, availability }, { userId, username, avatar });

  res.json({ success: true, message: 'Application submitted successfully' });
});

export default router;
