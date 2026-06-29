import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, deny } from './shared.js';
import {
  getMessageCount, getMessageLeaderboard, resetMessages, resetMessagesAll,
  getSnipeCache, getBalance, addBalance, getCaseInfo, getGuild, setAutoReact, getAutoReact, clearAutoReact, setOwnerRole,
  getArExpiry,
} from '../database.js';
import { hasCommandPermission, getStaffRank } from '../utils.js';
import { uploadAppEmoji, emojiCdnUrl, deleteAppEmoji } from '../appEmoji.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('messages')
    .setDescription('Check message count for a user')
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),

  new SlashCommandBuilder()
    .setName('message-leaderboard')
    .setDescription('Show the message count leaderboard'),

  new SlashCommandBuilder()
    .setName('case-info')
    .setDescription('Look up a case by ID')
    .addStringOption(o => o.setName('case-id').setDescription('Case ID (e.g. CASE-0001)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check the coin balance of a user')
    .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')),

  new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show the last deleted message in this channel'),

  new SlashCommandBuilder()
    .setName('reset-messages')
    .setDescription('Reset message count for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reset-messages-all')
    .setDescription('Reset message counts for ALL users in this server'),

  new SlashCommandBuilder()
    .setName('addbalance')
    .setDescription('Add coins to a user\'s balance (Team Lead+)')
    .addUserOption(o => o.setName('user').setDescription('User to give coins to').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount of coins to add').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('setbalance')
    .setDescription('Set a user\'s balance to an exact amount (Admin+)')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('New balance amount').setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName('setup-owner-role')
    .setDescription('Set the Owner role that has access to all commands (Admin+)')
    .addRoleOption(o => o.setName('role').setDescription('The Owner role').setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post an embed panel with a link button')
    .addStringOption(o => o.setName('link').setDescription('URL the button should open').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Embed title (auto-generated from the link if omitted)'))
    .addStringOption(o => o.setName('description').setDescription('Embed description text'))
    .addStringOption(o => o.setName('button-label').setDescription('Label shown on the button (default: Click Here)'))
    .addStringOption(o => o.setName('color').setDescription('Embed colour as a hex code, e.g. #5865F2').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (defaults to current channel)')),

  new SlashCommandBuilder()
    .setName('ar')
    .setDescription('Set your auto-react emoji — any emoji or image, uploaded to the bot (no server emoji needed)')
    .addStringOption(o => o.setName('emoji').setDescription('Paste any emoji — Unicode 😄 or custom <:name:id> from any server').setRequired(false))
    .addAttachmentOption(o => o.setName('image').setDescription('Upload an image to use as your auto-react emoji').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ar-clear')
    .setDescription('Remove your auto-react'),
];

export async function handleMessages(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const count = await getMessageCount(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Count')
      .setDescription(`**${target.tag}** has sent **${count.toLocaleString()}** messages in this server.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleMessageLeaderboard(interaction) {
  if (!await hasCommandPermission(interaction.member, 'message-leaderboard')) return deny(interaction);
  const top = await getMessageLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply({ content: '📭 No messages have been counted yet.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('💬 Message Leaderboard')
    .setDescription(top.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.count.toLocaleString()} msgs`).join('\n'))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

export async function handleCaseInfo(interaction) {
  if (!await hasCommandPermission(interaction.member, 'case-info')) return deny(interaction);
  const caseId = interaction.options.getString('case-id').toUpperCase();
  const info = await getCaseInfo(interaction.guildId, caseId);
  if (!info) return interaction.reply({ content: `❌ No case found with ID **${caseId}**.`, flags: 64 });
  const typeLabel = { warn: '⚠️ Warning', ad_warn: '📢 Ad Warning', strike: '🚫 Strike' }[info.type] || 'Case';
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${typeLabel} — ${info.case_id}`)
    .addFields(
      { name: 'User', value: `<@${info.user_id}>`, inline: true },
      { name: 'Moderator', value: `<@${info.moderator_id}>`, inline: true },
      { name: 'Date', value: `<t:${info.created_at}:F>`, inline: true },
      { name: 'Reason', value: info.reason },
    ).setTimestamp();
  if (info.message_content) embed.addFields({ name: 'Deleted Message', value: info.message_content.slice(0, 1024) });
  await interaction.reply({ embeds: [embed], flags: 64 });
}

export async function handleBalance(interaction) {
  if (!await hasCommandPermission(interaction.member, 'balance')) return deny(interaction);
  const target = interaction.options.getUser('user') || interaction.user;
  const bal = await getBalance(interaction.guildId, target.id);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('💰 Balance')
      .setDescription(`**${target.tag}** has **${bal.toLocaleString()} coins**.`)
      .setThumbnail(target.displayAvatarURL()).setTimestamp()],
    flags: 64,
  });
}

export async function handleSnipe(interaction) {
  if (!await hasCommandPermission(interaction.member, 'snipe')) return deny(interaction);
  const cached = await getSnipeCache(interaction.guildId, interaction.channelId);
  if (!cached) return interaction.reply({ content: '📭 No recently deleted messages in this channel.', flags: 64 });
  const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('🔍 Sniped Message')
    .setDescription(cached.content || '*[no text content]*')
    .setAuthor({ name: cached.author_name, iconURL: cached.author_avatar || undefined })
    .setFooter({ text: 'Deleted' }).setTimestamp(cached.deleted_at * 1000);
  await interaction.reply({ embeds: [embed] });
}

export async function handleResetMessages(interaction) {
  if (!await hasCommandPermission(interaction.member, 'reset-messages')) return deny(interaction);
  const target = interaction.options.getUser('user');
  await resetMessages(interaction.guildId, target.id);
  await interaction.reply({ content: `✅ Message count reset for **${target.tag}**.`, flags: 64 });
}

export async function handleResetMessagesAll(interaction) {
  if (!await hasCommandPermission(interaction.member, 'reset-messages-all')) return deny(interaction);
  await resetMessagesAll(interaction.guildId);
  await interaction.reply({ content: '✅ All message counts have been reset.', flags: 64 });
}

export async function handleSetupOwnerRole(interaction) {
  if (!await hasCommandPermission(interaction.member, 'setup-owner-role')) return deny(interaction);
  const role = interaction.options.getRole('role');
  await setOwnerRole(interaction.guildId, role.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Owner Role Set')
        .setDescription(`<@&${role.id}> is now the Owner role.\nMembers with this role have access to all bot commands.`)
        .setFooter({ text: `Set by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
    flags: 64,
  });
}

export async function handleSetBalance(interaction) {
  const rank = getStaffRank(interaction.member);
  if (rank < 3) return deny(interaction);

  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  await addBalance(interaction.guildId, target.id, amount - await getBalance(interaction.guildId, target.id));

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💰 Balance Set')
        .addFields(
          { name: 'User',    value: `<@${target.id}>`,              inline: true },
          { name: 'Balance', value: `${amount.toLocaleString()} coins`, inline: true },
        )
        .setFooter({ text: `Set by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
    flags: 64,
  });
}

export async function handleAddBalance(interaction) {
  const rank = getStaffRank(interaction.member);
  if (rank < 2) return deny(interaction);

  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  const current = await getBalance(interaction.guildId, target.id);
  const newBal = current + amount;
  await addBalance(interaction.guildId, target.id, amount);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22C55E)
        .setTitle('💰 Balance Updated')
        .addFields(
          { name: 'User',    value: `<@${target.id}>`,                   inline: true },
          { name: 'Added',   value: `+${amount.toLocaleString()} coins`, inline: true },
          { name: 'Balance', value: `${newBal.toLocaleString()} coins`,  inline: true },
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
    flags: 64,
  });
}

export async function handleAutoReact(interaction) {
  const raw        = interaction.options.getString('emoji');
  const attachment = interaction.options.getAttachment('image');

  if (!raw && !attachment) {
    return interaction.reply({ content: '❌ Provide an emoji or attach an image.', flags: 64 });
  }

  // Subscription gate — any staff (rank 1+) or server admin/manager bypasses
  const rank = getStaffRank(interaction.member);
  const perms = interaction.memberPermissions;
  const isStaffOrAdmin = rank >= 1
    || perms?.has('Administrator')
    || perms?.has('ManageGuild');
  if (!isStaffOrAdmin) {
    const expiry = await getArExpiry(interaction.user.id);
    const active = expiry && new Date(expiry) > new Date();
    if (!active) {
      return interaction.reply({
        content: '❌ You need an active auto-react subscription. Use `/buy ar` (20,000 coins/week) to purchase one.',
        flags: 64,
      });
    }
  }

  await interaction.deferReply({ flags: 64 });

  try {
    if (attachment) {
      const appEmoji = await uploadAppEmoji(
        attachment.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || 'custom',
        attachment.url,
      );
      await setAutoReact(interaction.guildId, interaction.user.id, appEmoji.id, appEmoji.name, appEmoji.animated);
      return interaction.editReply({ content: `✅ Done! The bot will now react with <:${appEmoji.name}:${appEmoji.id}> to every message you send.` });
    }

    const customMatch = raw.match(/^<(a?):([^:]+):(\d+)>$/);
    if (customMatch) {
      const [, a, name, id] = customMatch;
      const animated = a === 'a';
      const appEmoji = await uploadAppEmoji(name, emojiCdnUrl(id, animated), animated);
      await setAutoReact(interaction.guildId, interaction.user.id, appEmoji.id, appEmoji.name, appEmoji.animated);
      return interaction.editReply({ content: `✅ Done! The bot will now react with <${appEmoji.animated ? 'a' : ''}:${appEmoji.name}:${appEmoji.id}> to every message you send.` });
    }

    await setAutoReact(interaction.guildId, interaction.user.id, null, raw, false);
    return interaction.editReply({ content: `✅ Done! The bot will now react with ${raw} to every message you send.` });
  } catch (err) {
    return interaction.editReply({ content: `❌ Failed to set auto-react: ${err.message}` });
  }
}

export async function handleAutoReactClear(interaction) {
  const existing = await getAutoReact(interaction.guildId, interaction.user.id);
  if (!existing) {
    return interaction.reply({ content: '❌ You don\'t have an auto-react set in this server.', flags: 64 });
  }
  if (existing.emoji_id) await deleteAppEmoji(existing.emoji_id).catch(() => {});
  await clearAutoReact(interaction.guildId, interaction.user.id);
  await interaction.reply({ content: '✅ Your auto-react has been removed.', flags: 64 });
}


export async function handlePanel(interaction) {
  if (!await hasCommandPermission(interaction.member, 'panel')) return deny(interaction);

  const link        = interaction.options.getString('link');
  const description = interaction.options.getString('description') || null;
  const label       = interaction.options.getString('button-label') || 'Click Here';
  const colorHex    = interaction.options.getString('color') || '#5865F2';
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

  // Validate URL and auto-generate title from hostname
  let parsedUrl;
  try { parsedUrl = new URL(link); } catch {
    return interaction.reply({ content: '❌ Invalid URL. Make sure it starts with `https://`.', flags: 64 });
  }
  const title = interaction.options.getString('title') ||
    parsedUrl.hostname.replace(/^www\./, '').split('.').slice(0, -1).join('.') ||
    parsedUrl.hostname;

  // Validate hex colour
  const hexMatch = colorHex.replace('#', '');
  const color = parseInt(hexMatch, 16);
  if (isNaN(color) || hexMatch.length !== 6) {
    return interaction.reply({ content: '❌ Invalid colour. Use a 6-digit hex code like `#5865F2`.', flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (description) embed.setDescription(description);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(label)
      .setURL(link)
      .setStyle(ButtonStyle.Link),
  );

  try {
    await targetChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Panel posted in ${targetChannel}.`, flags: 64 });
  } catch {
    await interaction.reply({ content: '❌ Could not post in that channel. Check my permissions.', flags: 64 });
  }
}
