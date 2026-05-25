import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';
import client from '../botClient.js';

import discordPkg from 'discord.js';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = discordPkg;

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const {
    role,
    age,
    timezone,
    experience,
    motivation,
    availability,
  } = req.body;

  const { userId, username, avatar } = req.session.user;

  // ─────────────────────────────
  // VALIDATION
  // ─────────────────────────────

  if (!role || !age || !timezone || !experience || !motivation || !availability) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (isBlacklisted(userId)) {
    return res.status(403).json({
      error: 'You are blacklisted and cannot apply',
    });
  }

  const validRole = db
    .prepare('SELECT * FROM app_roles WHERE name = ? AND active = 1')
    .get(role);

  if (!validRole) {
    return res.status(400).json({
      error: 'Invalid or inactive role selected',
    });
  }

  const existing = db
    .prepare(
      "SELECT * FROM applications WHERE userId = ? AND role = ? AND status = 'pending'"
    )
    .get(userId, role);

  if (existing) {
    return res.status(409).json({
      error: 'You already have a pending application for this role',
    });
  }

  // ─────────────────────────────
  // SAVE APPLICATION
  // ─────────────────────────────

  const result = db
    .prepare(`
      INSERT INTO applications
      (userId, username, avatar, role, age, timezone, experience, motivation, availability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      userId,
      username,
      avatar ?? null,
      role,
      age,
      timezone,
      experience,
      motivation,
      availability
    );

  const applicationId = result.lastInsertRowid;

  // ─────────────────────────────
  // BUILD DISCORD EMBED
  // ─────────────────────────────

  const embed = new EmbedBuilder()
    .setTitle('📋 New Staff Application')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '👤 Applicant',
        value: `${username}\n\`${userId}\``,
        inline: true,
      },
      {
        name: '📌 Role',
        value: role,
        inline: true,
      },
      {
        name: '🎂 Age',
        value: String(age),
        inline: true,
      },
      {
        name: '🌍 Timezone',
        value: timezone,
        inline: true,
      },
      {
        name: '📅 Availability',
        value: availability.slice(0, 1024),
        inline: false,
      },
      {
        name: '📖 Experience',
        value: experience.slice(0, 1024),
        inline: false,
      },
      {
        name: '💬 Motivation',
        value: motivation.slice(0, 1024),
        inline: false,
      }
    )
    .setFooter({ text: `Application ID: ${applicationId}` })
    .setTimestamp();

  // ─────────────────────────────
  // ACCEPT / DENY BUTTONS
  // ─────────────────────────────

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${applicationId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`app_deny_${applicationId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
  );

  // ─────────────────────────────
  // SEND TO DISCORD CHANNEL
  // ─────────────────────────────

  const channelId = process.env.APPLICATION_CHANNEL_ID;

  if (!channelId) {
    console.error('❌ Missing APPLICATION_CHANNEL_ID in .env');
    return res.status(500).json({
      error: 'Server misconfigured (missing channel)',
    });
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    console.error('❌ Cannot find application channel');
    return res.status(500).json({
      error: 'Cannot find Discord channel',
    });
  }

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  // ─────────────────────────────
  // RESPONSE
  // ─────────────────────────────

  return res.json({
    success: true,
    message: 'Application submitted successfully',
  });
});

export default router;