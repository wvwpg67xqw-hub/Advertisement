import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';
import client from '../botClient.js';

import discordPkg from 'discord.js';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = discordPkg;

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { role, age, timezone, experience, motivation, availability } = req.body;
  const { userId, username, avatar } = req.session.user;

  if (!role || !age || !timezone || !experience || !motivation || !availability) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (isBlacklisted(userId)) {
    return res.status(403).json({ error: 'You are blacklisted and cannot apply' });
  }

  const validRole = db.getRole(role);
  if (!validRole) {
    return res.status(400).json({ error: 'Invalid or inactive role selected' });
  }

  const existing = db.getPendingApplication(userId, role);
  if (existing) {
    return res.status(409).json({ error: 'You already have a pending application for this role' });
  }

  const result = db.insertApplication({ userId, username, avatar, role, age, timezone, experience, motivation, availability });
  const applicationId = result.lastInsertRowid;

  const embed = new EmbedBuilder()
    .setTitle('📋 New Staff Application')
    .setColor(0x5865f2)
    .addFields(
      { name: '👤 Applicant', value: `${username}\n\`${userId}\``, inline: true },
      { name: '📌 Role', value: role, inline: true },
      { name: '🎂 Age', value: String(age), inline: true },
      { name: '🌍 Timezone', value: timezone, inline: true },
      { name: '📅 Availability', value: availability.slice(0, 1024), inline: false },
      { name: '📖 Experience', value: experience.slice(0, 1024), inline: false },
      { name: '💬 Motivation', value: motivation.slice(0, 1024), inline: false }
    )
    .setFooter({ text: `Application ID: ${applicationId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accept_${applicationId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_deny_${applicationId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );

  const channelId = process.env.APPLICATION_CHANNEL_ID;
  if (!channelId) {
    return res.status(500).json({ error: 'Server misconfigured (missing channel)' });
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return res.status(500).json({ error: 'Cannot find Discord channel' });
  }

  await channel.send({ embeds: [embed], components: [row] });

  return res.json({ success: true, message: 'Application submitted successfully' });
});

export default router;
