import { Router } from 'express';
import db from '../db.js';
import { requireAuth, isBlacklisted } from '../auth.js';
import client from '../botClient.js';
import { rateLimit, getClientIp } from '../security.js';
import { detectAI, progressBar } from '../src/aiDetector.js';

import discordPkg from 'discord.js';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = discordPkg;

const router = Router();

// ── Questions per role (must match client/pages/Apply.jsx) ───────────────────

export const ROLE_QUESTIONS = {
  Moderator: [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to moderating?',
    'Have you moderated a Discord server before? If so, describe your experience.',
    'What is the first thing you do when you see two members arguing in chat?',
    'A member reports someone for posting hate speech. Walk us through exactly what you would do.',
    'How do you handle a rule violation committed by a well-known or senior community member?',
    'What do you think is the most important quality a moderator should have, and why?',
    'Describe a time you had to make a difficult or unpopular decision. How did you handle it?',
    'Moderation can be stressful. How do you manage burnout or frustration on the job?',
    "Are you familiar with Discord's Terms of Service and Community Guidelines? Summarise your understanding.",
    'Which moderation bots or tools have you worked with before?',
    'How would you respond to a coordinated raid or mass-spam event in the server?',
    'A user claims you moderated them unfairly and demands an explanation. How do you respond?',
    'How do you remain unbiased when moderating a conflict between someone you know and a stranger?',
    'You disagree with a decision made by a senior staff member. What do you do?',
    'Describe how you would word a formal warning to a member who broke a rule.',
    'Three incidents happen at the same time. How do you decide what to handle first?',
    "Why do you want to be part of this community's staff team specifically?",
    'Is there anything else you would like us to know about you?',
  ],
  'Human Resources': [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to HR duties?',
    'Do you have previous HR or staff management experience? If so, describe it.',
    'A staff member has been repeatedly inactive without giving notice. How do you handle it?',
    'Two staff members are in conflict and come to you separately. How do you approach the situation?',
    'Describe how you would onboard a newly accepted staff member from day one.',
    'How do you approach addressing performance issues with a staff member sensitively?',
    'How would you identify signs of low morale within the team and what would you do about it?',
    'What qualities do you specifically look for when reviewing a staff application?',
    'A staff member shares something confidential with you. How do you handle that information?',
    'A staff member is struggling to keep up with their duties. What support do you offer?',
    'How would you approach the process of demoting or removing a staff member fairly?',
    'What ideas do you have to improve staff engagement, retention, and team culture?',
    'How do you ensure every staff member feels heard and treated equally regardless of rank?',
    'Describe a real situation where you resolved a conflict between people on a team.',
    'How comfortable are you with documentation such as keeping records and writing reports?',
    'What does a healthy and productive staff team look like to you?',
    "Why do you specifically want to join this community's HR team?",
    'Is there anything else you would like us to know about you?',
  ],
  Partnership: [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to partnership duties?',
    'Do you have any previous partnership, networking, or community relations experience?',
    'How do you decide whether a community is a good fit for a partnership?',
    'Walk us through exactly how you would reach out to a potential partner server for the first time.',
    'How do you measure whether a partnership has been successful?',
    'What would make you decline or end an existing partnership?',
    'How would you maintain a long-term partnership and keep both sides engaged over time?',
    'Describe your communication style when writing on behalf of this community.',
    'One of our partner servers is behaving inappropriately or violating our guidelines. What do you do?',
    'How comfortable are you writing partnership announcements, ad copy, or promotional content?',
    'How do you stay organised when managing a large number of active partnerships at once?',
    'What types of communities would you prioritise when looking for new partnerships?',
    'How do you handle a situation where a partnership pitch is rejected?',
    'Describe a time you successfully built a professional relationship or networked with someone new.',
    'How many Discord servers are you currently active in and what are your roles there?',
    'In your view, what makes a partnership genuinely beneficial for both communities?',
    "Why do you specifically want to join this community's partnership team?",
    'Is there anything else you would like us to know about you?',
  ],
};

// ── Input sanitisation helpers ────────────────────────────────────────────────

function sanitize(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

function truncate(value, max) {
  return sanitize(value).slice(0, max);
}

// ── GET /api/apply-servers (public) ──────────────────────────────────────────

router.get('/servers', (req, res) => {
  try {
    res.json(db.getApplyServers(true));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/applications ────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  rateLimit('applications', 5, 60 * 60 * 1000),
  async (req, res) => {
    try {
      const { role, answers, guildId, referredBy } = req.body;
      const { userId, username, avatar } = req.session.user;

      if (!role) return res.status(400).json({ error: 'Role is required' });
      if (String(role).length > 100) return res.status(400).json({ error: 'Invalid role' });
      if (!Array.isArray(answers) || answers.length !== 20) {
        return res.status(400).json({ error: 'All 20 questions must be answered' });
      }

      if (isBlacklisted(userId)) {
        return res.status(403).json({ error: 'You are blacklisted and cannot apply' });
      }

      const validRole = db.getRole(sanitize(role));
      if (!validRole) {
        return res.status(400).json({ error: 'Invalid or inactive role selected' });
      }

      const questions = ROLE_QUESTIONS[validRole.name] || [];
      if (questions.length === 0) {
        return res.status(400).json({ error: 'No questions defined for this role' });
      }

      // Validate & sanitize each answer
      const cleanAnswers = [];
      for (let i = 0; i < 20; i++) {
        const raw = answers[i];
        if (!raw || !String(raw).trim()) {
          return res.status(400).json({ error: `Question ${i + 1} requires an answer` });
        }
        cleanAnswers.push(truncate(raw, 1024));
      }

      const existing = db.getPendingApplication(userId, validRole.name);
      if (existing) {
        return res.status(409).json({ error: 'You already have a pending application for this role' });
      }

      // Look up optional per-server config (log channel override etc.)
      let applyServer = null;
      let resolvedGuildId = null;
      if (guildId) {
        resolvedGuildId = String(guildId).trim();
        applyServer = db.getApplyServerByGuildId(resolvedGuildId) || null;
        // Don't block submission if no manual config exists — any guild the bot
        // is in is valid; it will just use the default log channel.
      }

      const safeRef = referredBy && /^\d{17,20}$/.test(String(referredBy)) ? String(referredBy) : null;

      const result = db.insertApplication({
        userId, username, avatar,
        role: validRole.name,
        answers: cleanAnswers,
        guildId: resolvedGuildId || null,
        referredBy: safeRef,
      });

      const applicationId = result.lastInsertRowid;

      // ── Discord: Preview embed ──────────────────────────────────────────────

      const serverField = applyServer
        ? [{ name: '🏠 Server', value: applyServer.name, inline: true }]
        : [];

      const previewEmbed = new EmbedBuilder()
        .setTitle('📋 New Staff Application')
        .setColor(0x5865f2)
        .setThumbnail(avatar || null)
        .addFields(
          { name: '👤 Applicant', value: `**${username}**\n\`${userId}\``, inline: true },
          { name: '📌 Role', value: `${validRole.emoji || ''} ${validRole.name}`, inline: true },
          ...serverField,
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '🎂 Age', value: cleanAnswers[0] || 'N/A', inline: true },
          { name: '🌍 Timezone', value: cleanAnswers[1] || 'N/A', inline: true },
          { name: '⏰ Hours/week', value: cleanAnswers[2] || 'N/A', inline: true },
          ...(safeRef ? [{ name: '🔗 Referred By', value: `<@${safeRef}>`, inline: true }] : []),
          {
            name: `📝 ${questions[3] || 'Q4'}`,
            value: (cleanAnswers[3] || 'N/A').slice(0, 300) + (cleanAnswers[3]?.length > 300 ? '…' : ''),
            inline: false,
          },
        )
        .setFooter({ text: `Application #${applicationId} · Full answers in thread below · IP: ${getClientIp(req)}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_accept_${applicationId}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_deny_${applicationId}`)
          .setLabel('❌ Deny')
          .setStyle(ButtonStyle.Danger),
      );

      // Use server-specific log channel if set, else fall back to default
      const channelId = applyServer?.log_channel_id || '1503147704522637494';
      const channel = await client.channels.fetch(channelId).catch(() => null);

      if (channel) {
        try {
          const msg = await channel.send({ embeds: [previewEmbed], components: [row] });

          // ── Create a thread with full Q&A ────────────────────────────────
          const thread = await msg.startThread({
            name: `${username} — ${validRole.name} #${applicationId}`,
            autoArchiveDuration: 10080,
          }).catch(() => null);

          if (thread) {
            // Send full Q&A split into chunks of 10 (embed field limit)
            for (let chunk = 0; chunk < 2; chunk++) {
              const start = chunk * 10;
              const fields = questions.slice(start, start + 10).map((q, i) => ({
                name: `Q${start + i + 1}. ${q.slice(0, 250)}`,
                value: (cleanAnswers[start + i] || 'No answer').slice(0, 1024),
              }));
              if (fields.length === 0) continue;
              const chunkEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(chunk === 0 ? `📋 Full Application — ${username} (Questions 1–10)` : 'Questions 11–20')
                .addFields(fields);
              if (chunk === 0) {
                chunkEmbed.setDescription(`**Applicant:** ${username} (\`${userId}\`)\n**Role:** ${validRole.name}\n**Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>`);
              }
              await thread.send({ embeds: [chunkEmbed] }).catch(() => null);
            }

            db.updateApplicationDiscordIds(applicationId, msg.id, thread.id);

            // ── AI Detection (staff-only, posted in thread) ───────────────
            (async () => {
              try {
                // Analyse only the essay-style answers (Q4 onwards, index 3+)
                const essayText = cleanAnswers.slice(3).filter(Boolean).join('\n\n');
                const result = await detectAI(essayText);

                if (result.skipped) {
                  const skipEmbed = new EmbedBuilder()
                    .setTitle('🤖 AI Detection — Skipped')
                    .setDescription(result.error || 'Not enough text to analyse.')
                    .setColor(0x99aab5)
                    .setFooter({ text: 'Staff-only · Not visible to applicant' });
                  await thread.send({ embeds: [skipEmbed] }).catch(() => null);
                  return;
                }

                const color = result.aiScore >= 75 ? 0xed4245
                  : result.aiScore >= 45 ? 0xfee75c
                  : 0x57f287;

                const detectionEmbed = new EmbedBuilder()
                  .setTitle('🤖 AI Detection Report')
                  .setColor(color)
                  .addFields(
                    { name: '🧠 Verdict',     value: `**${result.label}**`,                   inline: false },
                    { name: '🤖 AI Score',    value: `\`${progressBar(result.aiScore)}\``,    inline: false },
                    { name: '👤 Human Score', value: `\`${progressBar(result.humanScore)}\``, inline: false },
                  )
                  .setFooter({ text: `Staff-only · Not visible to applicant · ${result.source}` })
                  .setTimestamp();

                await thread.send({ embeds: [detectionEmbed] }).catch(() => null);
              } catch (aiErr) {
                console.error('AI detection error:', aiErr.message);
              }
            })();
            // ─────────────────────────────────────────────────────────────

          } else {
            db.updateApplicationDiscordIds(applicationId, msg.id, null);
          }
        } catch (discordErr) {
          console.error('Discord send error:', discordErr.message);
        }
      }

      return res.json({ success: true, message: 'Application submitted successfully' });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
