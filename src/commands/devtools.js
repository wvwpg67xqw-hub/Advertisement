import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder } = pkg;

import db from '../../db.js';
import { sendDM } from '../../dmRest.js';

const BOT_DEV_ID = process.env.OWNER_ID || '1453592157607825595';

const TOS_MESSAGE = `**Advertisement Hub Bot — Terms of Service**
*Last Updated: June 6, 2026*

By using the Advertisement Hub bot, you agree to the following terms:

**1. Acceptance of Terms**
Using the bot means you agree to follow these Terms of Service and all applicable Discord Terms and Community Guidelines.

**2. Purpose of the Bot**
The bot is provided to help manage advertisements, server partnerships, moderation, and other community features within Advertisement Hub and any servers where it is authorized.

**3. User Responsibilities**
You agree not to:
• Abuse, exploit, or attempt to break the bot.
• Use the bot for illegal activities.
• Send spam, scams, phishing links, malware, or malicious content.
• Use the bot to harass, threaten, or target other users.
• Bypass any cooldowns, restrictions, or moderation systems.

**4. Data Collection**
The bot may store Discord User IDs, Server IDs, Channel IDs, command usage data, and moderation logs. The bot does not collect passwords, payment information, or private Discord messages unless a feature specifically requires it.

**5. Availability**
The bot is provided "as is." Features may be modified, removed, or added at any time without notice.

**6. Termination**
We reserve the right to restrict access, remove users from bot services, or ban users who violate these terms.

**7. Limitation of Liability**
The bot owners are not responsible for data loss, server damage, or downtime.

**8. Changes to These Terms**
These Terms may be updated at any time. Continued use constitutes acceptance of the updated terms.

**9. Contact**
For questions, contact the Advertisement Hub staff team through the server's support channels.

*By using Advertisement Hub, you acknowledge that you have read and agreed to these Terms of Service.*`;

export const defs = [
  new SlashCommandBuilder()
    .setName('unblock-all')
    .setDescription('[Bot Dev only] Unblock everyone from the portal and DM them the ToS'),
];

export async function handleUnblockAll(interaction) {
  if (interaction.user.id !== BOT_DEV_ID) {
    return interaction.reply({ content: '❌ Only the bot developer can use this command.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const userBlacklist = db.getBlacklist();
  const ipBlacklist   = db.getIpBlacklist();

  if (userBlacklist.length === 0 && ipBlacklist.length === 0) {
    return interaction.editReply({ content: '✅ No one is currently blacklisted (users or IPs).' });
  }

  let pendingTos  = 0;
  let unbannedIps = 0;
  let dmSent      = 0;
  let dmFailed    = 0;

  for (const entry of userBlacklist) {
    try {
      db.deleteBlacklistByUserId(entry.userId);
      db.addPendingTos(entry.userId, entry.username);
      pendingTos++;
    } catch {}

    try {
      const tosEmbed = new EmbedBuilder()
        .setTitle('📋 Advertisement Hub — Terms of Service')
        .setDescription(
          TOS_MESSAGE +
          '\n\n**Click ✅ I Agree below to accept these terms and regain access to the Staff Portal.**'
        )
        .setColor(0xf59e0b)
        .setTimestamp()
        .setFooter({ text: 'Staff Portal · You must accept to continue' });

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = (await import('discord.js'));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tos_agree_${entry.userId}`)
          .setLabel('✅ I Agree')
          .setStyle(ButtonStyle.Success),
      );

      const ok = await sendDM(entry.userId, { embeds: [tosEmbed.toJSON()], components: [row.toJSON()] });
      if (ok) dmSent++; else dmFailed++;
    } catch {
      dmFailed++;
    }
  }

  for (const entry of ipBlacklist) {
    try {
      db.removeIpBlacklist(entry.id);
      unbannedIps++;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Unblock All Initiated')
    .setColor(0x22c55e)
    .setDescription('Users have been sent the ToS and must click **✅ I Agree** before they can log in.')
    .addFields(
      { name: '⏳ Awaiting ToS',  value: String(pendingTos),  inline: true },
      { name: '🌐 IPs Unbanned',  value: String(unbannedIps), inline: true },
      { name: '📬 DMs Sent',      value: String(dmSent),      inline: true },
      { name: '⚠️ DMs Failed',   value: String(dmFailed),    inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Dev Tools' });

  return interaction.editReply({ embeds: [embed] });
}
