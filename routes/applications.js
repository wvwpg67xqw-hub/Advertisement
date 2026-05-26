import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';
import client from '../botClient.js';
import { rateLimit, getClientIp } from '../security.js';

import discordPkg from 'discord.js';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = discordPkg;

const router = Router();

// ── Input sanitisation helpers ────────────────────────────────────────────────

function sanitize(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

function truncate(value, max) {
  return sanitize(value).slice(0, max);
}

// ── POST /api/applications ────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  rateLimit('applications', 5, 60 * 60 * 1000),
  async (req, res) => {
    try {
      const { role, age, timezone, experience, motivation, availability } = req.body;
      const { userId, username, avatar } = req.session.user;

      if (!role || !age || !timezone || !experience || !motivation || !availability) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Length guards
      if (String(age).length > 10) return res.status(400).json({ error: 'Age value too long' });
      if (String(timezone).length > 60) return res.status(400).json({ error: 'Timezone value too long' });
      if (String(experience).length > 2000) return res.status(400).json({ error: 'Experience must be under 2000 characters' });
      if (String(motivation).length > 2000) return res.status(400).json({ error: 'Motivation must be under 2000 characters' });
      if (String(availability).length > 500) return res.status(400).json({ error: 'Availability must be under 500 characters' });
      if (String(role).length > 100) return res.status(400).json({ error: 'Invalid role' });

      if (isBlacklisted(userId)) {
        return res.status(403).json({ error: 'You are blacklisted and cannot apply' });
      }

      const validRole = db.getRole(sanitize(role));
      if (!validRole) {
        return res.status(400).json({ error: 'Invalid or inactive role selected' });
      }

      const existing = db.getPendingApplication(userId, validRole.name);
      if (existing) {
        return res.status(409).json({ error: 'You already have a pending application for this role' });
      }

      const cleanAge = truncate(age, 10);
      const cleanTimezone = truncate(timezone, 60);
      const cleanExperience = truncate(experience, 2000);
      const cleanMotivation = truncate(motivation, 2000);
      const cleanAvailability = truncate(availability, 500);

      const result = db.insertApplication({
        userId,
        username,
        avatar,
        role: validRole.name,
        age: cleanAge,
        timezone: cleanTimezone,
        experience: cleanExperience,
        motivation: cleanMotivation,
        availability: cleanAvailability,
      });

      const applicationId = result.lastInsertRowid;

      // ── Discord Embed ────────────────────────────────
      const embed = new EmbedBuilder()
        .setTitle('📋 New Staff Application')
        .setColor(0x5865f2)
        .addFields(
          { name: '👤 Applicant', value: `${username}\n\`${userId}\``, inline: true },
          { name: '📌 Role', value: validRole.name, inline: true },
          { name: '🎂 Age', value: cleanAge, inline: true },
          { name: '🌍 Timezone', value: cleanTimezone, inline: true },
          { name: '📅 Availability', value: cleanAvailability, inline: false },
          { name: '📖 Experience', value: cleanExperience, inline: false },
          { name: '💬 Motivation', value: cleanMotivation, inline: false },
        )
        .setFooter({
          text: `Application ID: ${applicationId} · IP: ${getClientIp(req)}`
        })
        .setTimestamp();

      // ── Buttons ────────────────────────────────
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_accept_${applicationId}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`app_deny_${applicationId}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger),
      );

      // ── HARD CODED CHANNEL ────────────────────────────────
      const channelId = "1503147704522637494";

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return res.status(500).json({ error: 'Cannot find Discord channel' });
      }

      await channel.send({
        embeds: [embed],
        components: [row],
      });

      return res.json({
        success: true,
        message: 'Application submitted successfully',
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;