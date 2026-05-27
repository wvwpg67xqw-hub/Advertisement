import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getGuild, setGuildConfig } from '../src/database.js';
import discordPkg from 'discord.js';
const { EmbedBuilder } = discordPkg;

const router = Router();

let discordClient = null;
export function setStaffDiscordClient(client) {
  discordClient = client;
}

const MAIN_GUILD_ID = () => process.env.MAIN_GUILD_ID;

// ── GET referral link ──────────────────────────────────────────────────────────

router.get('/referral-link', requireAuth, (req, res) => {
  const guildId = MAIN_GUILD_ID();
  if (!guildId) return res.json({ link: null });
  const config = getGuild(guildId);
  res.json({ link: config.referral_link || null });
});

// ── SET referral link (admin only) ────────────────────────────────────────────

router.post('/referral-link', requireAuth, (req, res) => {
  const { link } = req.body;
  if (!link || typeof link !== 'string') return res.status(400).json({ error: 'Invalid link' });

  const guildId = MAIN_GUILD_ID();
  if (!guildId) return res.status(500).json({ error: 'MAIN_GUILD_ID not set' });

  import('../db.js').then(({ default: db }) => {
    const admin = db.getAdmin(req.session.user?.userId);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });
    setGuildConfig(guildId, { referral_link: link.trim() });
    res.json({ success: true, link: link.trim() });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

// ── Apply for modmail test ─────────────────────────────────────────────────────

router.post('/apply-modmail', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const guildId = MAIN_GUILD_ID();
  if (!guildId) return res.status(500).json({ error: 'MAIN_GUILD_ID not set' });

  const config = getGuild(guildId);

  if (!config.modmail_test_channel_id) {
    return res.status(400).json({ error: 'Modmail test channel not configured. Ask an admin to run /setup-resign.' });
  }

  if (!discordClient) {
    return res.status(503).json({ error: 'Bot is not connected. Please try again shortly.' });
  }

  try {
    const channel = discordClient.channels.cache.get(config.modmail_test_channel_id)
      || await discordClient.channels.fetch(config.modmail_test_channel_id).catch(() => null);

    if (!channel) {
      return res.status(500).json({ error: 'Could not find the modmail test channel.' });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📬 Modmail Test Application')
      .setDescription(`**${user.username}** has applied to take the modmail test.`)
      .addFields(
        { name: '👤 Applicant', value: `<@${user.userId}> (\`${user.userId}\`)`, inline: true },
        { name: '🕒 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setThumbnail(user.avatar || null)
      .setTimestamp()
      .setFooter({ text: 'Applied via Staff Panel' });

    await channel.send({ embeds: [embed] });

    res.json({ success: true, message: 'Your modmail test application has been submitted.' });
  } catch (err) {
    console.error('Modmail test application error:', err.message);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
});

export default router;
