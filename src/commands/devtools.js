import { SlashCommandBuilder, EmbedBuilder } from './shared.js';
import db from '../../db.js';
import { sendDM } from '../../dmRest.js';

const BOT_DEV_ID = process.env.OWNER_ID || '1453592157607825595';

const TOS_MESSAGE = `**📋 Staff Portal — Terms of Service**

You have been **unbanned** from the Staff Portal. Before logging back in, please read and follow our Terms of Service:

> • Be respectful to all staff and community members.
> • Do not abuse the application system or submit spam applications.
> • Do not attempt to bypass security measures (VPNs, alt accounts, etc.).
> • Decisions made by staff and management are final.
> • Any further violations will result in a permanent ban with no appeal.

You may now log back in at the Staff Portal. Welcome back.`;

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

  const blacklist = db.getBlacklist();
  if (blacklist.length === 0) {
    return interaction.editReply({ content: '✅ No one is currently blacklisted.' });
  }

  let unbanned = 0;
  let dmSent = 0;
  let dmFailed = 0;

  for (const entry of blacklist) {
    try {
      db.deleteBlacklistByUserId(entry.userId);
      unbanned++;
    } catch {}

    try {
      const tosEmbed = new EmbedBuilder()
        .setTitle('🔓 You have been unbanned from the Staff Portal')
        .setDescription(TOS_MESSAGE)
        .setColor(0x22c55e)
        .setTimestamp()
        .setFooter({ text: 'Staff Portal · Terms of Service' });

      const ok = await sendDM(entry.userId, { embeds: [tosEmbed.toJSON()] });
      if (ok) dmSent++; else dmFailed++;
    } catch {
      dmFailed++;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Unblock All Complete')
    .setColor(0x22c55e)
    .addFields(
      { name: '🔓 Unbanned',      value: String(unbanned),  inline: true },
      { name: '📬 DMs Sent',      value: String(dmSent),    inline: true },
      { name: '⚠️ DMs Failed',   value: String(dmFailed),  inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Dev Tools' });

  return interaction.editReply({ embeds: [embed] });
}
