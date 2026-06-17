import { SlashCommandBuilder, EmbedBuilder } from './shared.js';
import { getBalance, addBalance, renewArSubscription, getArExpiry } from '../database.js';
import { getStaffRank } from '../utils.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase items using your coins')
    .addStringOption(o =>
      o.setName('item')
        .setDescription('Item to buy')
        .setRequired(true)
        .addChoices({ name: 'Auto-React (weekly subscription — 20,000 coins)', value: 'ar' })
    ),
];

const AR_COST = 20_000;

export async function handleBuy(interaction) {
  const item = interaction.options.getString('item');

  if (item === 'ar') {
    const rank = getStaffRank(interaction.member);
    const isFree = rank >= 3;

    await interaction.deferReply({ flags: 64 });

    if (!isFree) {
      const bal = await getBalance(interaction.guildId, interaction.user.id);
      if (bal < AR_COST) {
        return interaction.editReply({
          content: `❌ You need **${AR_COST.toLocaleString()} coins** to buy an auto-react subscription. You have **${bal.toLocaleString()}**.`,
        });
      }
      await addBalance(interaction.guildId, interaction.user.id, -AR_COST);
    }

    const newExpiry = await renewArSubscription(interaction.user.id);
    const expiryDate = newExpiry ? new Date(newExpiry) : null;
    const expiryStr = expiryDate
      ? `<t:${Math.floor(expiryDate.getTime() / 1000)}:F>`
      : 'unknown';

    const costLine = isFree
      ? 'No cost (admin)'
      : `-${AR_COST.toLocaleString()} coins`;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎉 Auto-React Subscription Purchased!')
      .setDescription(
        `Your auto-react subscription is active.\nUse \`/ar\` or \`,ar\` to set your emoji.`
      )
      .addFields(
        { name: 'Expires', value: expiryStr, inline: true },
        { name: 'Cost',    value: costLine,   inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}
