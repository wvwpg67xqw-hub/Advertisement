import {
  EmbedBuilder,
  Colors,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  getThreadByUser, getThreadByChannel, createThread, closeThread, updateThread,
  addSubscriber, removeSubscriber,
  getSnippet, addSnippet, removeSnippet, listSnippets,
  setPending, getPending, clearPending,
  isBlocked, blockUser, unblockUser,
  getMenuOptions, updateMenuOption, addMenuOption,
} from './db.js';
import { CATEGORIES } from './categories.js';
import { ensureCategories } from './setup.js';

const STAFF_SERVER_ID = process.env.STAFF_SERVER_ID;

const STAFF_ROLES = [
  { id: '1519938887416545282', label: 'Ownership' },
  { id: '1519939477303197878', label: 'Bored of Directors' },
  { id: '1519940064254361660', label: 'Management' },
];

export async function getStaffGuild(client) {
  try {
    return client.guilds.cache.get(STAFF_SERVER_ID) ?? await client.guilds.fetch(STAFF_SERVER_ID);
  } catch {
    return null;
  }
}

async function getStaffRoleLabel(client, userId) {
  try {
    const staffGuild = await getStaffGuild(client);
    if (!staffGuild) return 'Staff Team';
    const member = await staffGuild.members.fetch(userId);
    for (const role of STAFF_ROLES) {
      if (member.roles.cache.has(role.id)) return role.label;
    }
  } catch { /**/ }
  return 'Staff Team';
}

function threadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getCategoryId(guild, catName) {
  const cats = await ensureCategories(guild);
  return cats[catName] ?? null;
}

export async function openThread(client, userId, username, avatarURL, category, initialMessage, overrideCategoryId) {
  const staffGuild = await getStaffGuild(client);
  if (!staffGuild) return null;

  const catId = overrideCategoryId ?? await getCategoryId(staffGuild, category);

  const safeName  = username.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 20) || 'user';
  const prefix    = Object.entries(CATEGORIES).find(([, v]) => v === category)?.[0]?.toLowerCase() ?? 'modmail';

  const channel = await staffGuild.channels.create({
    name:   `${prefix}-${safeName}`,
    type:   ChannelType.GuildText,
    parent: catId ?? undefined,
    topic:  `[${category}] Thread for ${username} (${userId})`,
  });

  const tid = threadId();
  createThread({ threadId: tid, channelId: channel.id, userId, username, open: true, category, createdAt: Date.now(), subscribers: [] });

  const openEmbed = new EmbedBuilder()
    .setTitle(`New ${category} Thread`)
    .setDescription(`Thread opened by **${username}** (${userId})`)
    .setColor(Colors.Green)
    .setTimestamp()
    .addFields(
      { name: 'User ID',   value: userId,    inline: true },
      { name: 'Category',  value: category,  inline: true },
    );

  await channel.send({ embeds: [openEmbed] });

  if (initialMessage) {
    const msgEmbed = new EmbedBuilder()
      .setAuthor({ name: username, iconURL: avatarURL })
      .setDescription(initialMessage)
      .setColor(Colors.Blue)
      .setTimestamp();
    await channel.send({ embeds: [msgEmbed] });
  }

  return channel;
}

export async function handleUserDM(client, message) {
  if (message.author.bot) return;

  if (isBlocked(message.author.id)) {
    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚫 You are blocked')
          .setDescription('You have been blocked from contacting our modmail. If you believe this is a mistake, please reach out through another means.')
          .setColor(Colors.Red),
      ],
    }).catch(() => {});
    return;
  }

  const existingThread = getThreadByUser(message.author.id);

  if (existingThread) {
    const staffGuild = await getStaffGuild(client);
    if (!staffGuild) return;

    const channel = staffGuild.channels.cache.get(existingThread.channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || '*[no text content]*')
      .setColor(Colors.Blue)
      .setTimestamp()
      .setFooter({ text: `User ID: ${message.author.id}` });

    if (message.attachments.size > 0) {
      embed.addFields({ name: 'Attachments', value: message.attachments.map(a => a.url).join('\n') });
    }

    const mentions = existingThread.subscribers.length > 0
      ? existingThread.subscribers.map(id => `<@${id}>`).join(' ')
      : undefined;

    await channel.send({ content: mentions, embeds: [embed] });
    await message.react('✅').catch(() => {});
    return;
  }

  const pending = getPending(message.author.id);
  if (pending) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription('Please select a category from the menu above before sending a message.')
          .setColor(Colors.Yellow),
      ],
    }).catch(() => {});
    return;
  }

  const menuOpts = getMenuOptions();

  const select = new StringSelectMenuBuilder()
    .setCustomId('modmail_category')
    .setPlaceholder('Choose what you need help with…')
    .addOptions(menuOpts.map(opt => ({ label: opt.label, description: opt.description, value: opt.value, emoji: opt.emoji })));

  const row = new ActionRowBuilder().addComponents(select);

  const menuMsg = await message.author.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('Welcome to Modmail')
        .setDescription(
          'Please select the reason you\'re contacting us from the menu below.\n\n' +
          menuOpts.map(o => `${o.emoji} **${o.label}** — ${o.description}`).join('\n'),
        )
        .setColor(Colors.Blurple)
        .setFooter({ text: 'Select an option to open your thread' }),
    ],
    components: [row],
  }).catch(() => null);

  if (!menuMsg) return;
  setPending(message.author.id, menuMsg.id, message.content);
}

export async function handleCategorySelection(client, interaction) {
  const userId  = interaction.user.id;
  const chosen  = interaction.values[0];
  const pending = getPending(userId);

  await interaction.deferUpdate().catch(() => {});

  const allOpts = getMenuOptions();
  const disabledSelect = new StringSelectMenuBuilder()
    .setCustomId('modmail_category_done')
    .setPlaceholder(`Selected: ${chosen}`)
    .setDisabled(true)
    .addOptions(allOpts.map(opt => ({ label: opt.label, value: opt.value, emoji: opt.emoji })));

  await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(disabledSelect)] }).catch(() => {});

  clearPending(userId);

  const chosenOption = allOpts.find(o => o.value === chosen);

  const channel = await openThread(
    client,
    userId,
    interaction.user.tag,
    interaction.user.displayAvatarURL(),
    chosen,
    pending?.initialMessage ?? '',
    chosenOption?.categoryId,
  );

  if (!channel) {
    await interaction.user.send('❌ Something went wrong opening your thread. Please try again.').catch(() => {});
    return;
  }

  await interaction.user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${chosenOption?.emoji ?? ''} Thread Opened — ${chosen}`)
        .setDescription('Your thread has been opened! Our staff team will get back to you shortly.\n\nYou can continue sending messages here and they\'ll be forwarded to staff.')
        .setColor(Colors.Green)
        .setTimestamp(),
    ],
  }).catch(() => {});
}

export async function handleReply(message, anonymous) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This channel is not a modmail thread.'); return; }

  let user;
  try { user = await message.client.users.fetch(thread.userId); }
  catch { await message.reply('❌ Could not fetch the user.'); return; }

  const content = message.content.replace(/^\.ar?\s*/i, '').trim();
  if (!content) { await message.reply('❌ Please provide a message to send.'); return; }

  const roleLabel = anonymous ? await getStaffRoleLabel(message.client, message.author.id) : null;

  const embed = new EmbedBuilder()
    .setDescription(content)
    .setColor(anonymous ? Colors.Grey : Colors.Green)
    .setTimestamp();

  if (anonymous) {
    embed.setAuthor({ name: roleLabel });
  } else {
    embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() });
  }

  try {
    await user.send({ embeds: [embed] });
    await message.react('✅').catch(() => {});

    const senderLabel = anonymous ? `${roleLabel} (anon)` : message.author.tag;
    const logEmbed = new EmbedBuilder()
      .setAuthor({ name: senderLabel, iconURL: anonymous ? undefined : message.author.displayAvatarURL() })
      .setDescription(`→ **User:** ${content}`)
      .setColor(anonymous ? Colors.Grey : Colors.Green)
      .setTimestamp();
    await message.channel.send({ embeds: [logEmbed] });
    await message.delete().catch(() => {});
  } catch {
    await message.reply('❌ Failed to DM the user. They may have DMs disabled.');
  }
}

export async function handleClose(message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  try {
    const user = await message.client.users.fetch(thread.userId);
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Thread Closed')
          .setDescription('Your modmail thread has been closed by our staff team. Feel free to DM again if you need further assistance.')
          .setColor(Colors.Red),
      ],
    }).catch(() => {});
  } catch { /**/ }

  closeThread(thread.threadId);

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`🔒 Thread closed by **${message.author.tag}**`)
        .setColor(Colors.Red),
    ],
  });

  setTimeout(async () => { await message.channel.delete().catch(() => {}); }, 5000);
}

export async function handleSub(message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  if (thread.subscribers.includes(message.author.id)) {
    removeSubscriber(message.channel.id, message.author.id);
    await message.reply('🔕 Unsubscribed from this thread.');
  } else {
    addSubscriber(message.channel.id, message.author.id);
    await message.reply('🔔 Subscribed! You\'ll be pinged on new user messages.');
  }
}

export async function handleMove(message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  const target = message.content.replace(/^\.move\s*/i, '').trim();
  if (!target) {
    await message.reply(`❌ Usage: \`.move <category>\`. Available: ${Object.values(CATEGORIES).join(', ')}`);
    return;
  }

  const staffGuild = await getStaffGuild(message.client);
  if (!staffGuild) return;

  if (/^\d{17,20}$/.test(target)) {
    try {
      await message.channel.setParent(target, { lockPermissions: false });
      updateThread(thread.threadId, { category: `Channel ${target}` });
      await message.reply(`✅ Moved to category \`${target}\``);
    } catch {
      await message.reply('❌ Could not move to that channel ID. Make sure it\'s a valid category ID on this server.');
    }
    return;
  }

  const catMatch = Object.values(CATEGORIES).find(c => c.toLowerCase() === target.toLowerCase());
  if (!catMatch) {
    await message.reply(`❌ Unknown category \`${target}\`. Available: ${Object.values(CATEGORIES).join(', ')} or a raw category channel ID`);
    return;
  }

  const cats  = await ensureCategories(staffGuild);
  const catId = cats[catMatch];
  if (!catId) { await message.reply('❌ Could not find that category on the server.'); return; }

  await message.channel.setParent(catId, { lockPermissions: false });
  updateThread(thread.threadId, { category: catMatch });
  await message.reply(`✅ Moved to **${catMatch}**`);
}

export async function handleSnippetAdd(message) {
  const rest = message.content.replace(/^\.snippet\s+add\s*/i, '').trim();
  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) { await message.reply('❌ Usage: `.snippet add <name> <content>`'); return; }
  const name    = rest.slice(0, spaceIdx).toLowerCase();
  const content = rest.slice(spaceIdx + 1).trim();
  addSnippet(name, content);
  await message.reply(`✅ Snippet \`${name}\` saved.`);
}

export async function handleSnippetRemove(message) {
  const name = message.content.replace(/^\.snippet\s+remove\s*/i, '').trim().toLowerCase();
  if (!name) { await message.reply('❌ Usage: `.snippet remove <name>`'); return; }
  const removed = removeSnippet(name);
  await message.reply(removed ? `✅ Snippet \`${name}\` removed.` : `❌ No snippet named \`${name}\`.`);
}

export async function handleSnippetView(message, name) {
  const snippet = getSnippet(name);
  if (!snippet) { await message.reply(`❌ No snippet named \`${name}\`.`); return; }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`📋 Snippet: ${snippet.name}`)
        .setDescription(snippet.content)
        .setColor(Colors.Blurple)
        .setFooter({ text: `Use .${snippet.name} to send this to the user` }),
    ],
  });
}

export async function handleSnippetList(message) {
  const snippets = listSnippets();
  if (snippets.length === 0) {
    await message.reply('No snippets saved yet. Add one with `.snippet add <name> <content>`.');
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Snippets')
        .setColor(Colors.Blurple)
        .setDescription(snippets.map(s => `**\`${s.name}\`** — ${s.content}`).join('\n')),
    ],
  });
}

export async function handleSnippetUse(message, snippetName) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  const snippet = getSnippet(snippetName);
  if (!snippet) { await message.reply(`❌ No snippet named \`${snippetName}\`.`); return; }

  let user;
  try { user = await message.client.users.fetch(thread.userId); }
  catch { await message.reply('❌ Could not fetch the user.'); return; }

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(snippet.content)
    .setColor(Colors.Green)
    .setTimestamp();

  await user.send({ embeds: [embed] });
  await message.react('✅').catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setDescription(`**${message.author.tag}** → User (snippet \`${snippetName}\`): ${snippet.content}`)
    .setColor(Colors.Green)
    .setTimestamp();
  await message.channel.send({ embeds: [logEmbed] });
  await message.delete().catch(() => {});
}

export async function handleBlock(message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  if (isBlocked(thread.userId)) {
    await message.reply(`⚠️ **${thread.username}** is already blocked.`);
    return;
  }

  blockUser(thread.userId);

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🚫 User Blocked')
        .setDescription(`**${thread.username}** (\`${thread.userId}\`) has been blocked from sending modmail.`)
        .setColor(Colors.Red)
        .setTimestamp()
        .setFooter({ text: `Blocked by ${message.author.tag}` }),
    ],
  });
  await message.delete().catch(() => {});
}

export async function handleUnblock(message) {
  const target = message.content.replace(/^\.unblock\s*/i, '').trim();
  if (!target) { await message.reply('❌ Usage: `.unblock <user ID>`'); return; }

  const userId = target.replace(/\D/g, '');
  if (!userId) { await message.reply('❌ Please provide a valid user ID.'); return; }

  const removed = unblockUser(userId);
  await message.reply(removed ? `✅ \`${userId}\` has been unblocked.` : `⚠️ \`${userId}\` was not in the blocklist.`);
}

export async function handleEscalate(message) {
  const thread = getThreadByChannel(message.channel.id);
  if (!thread) { await message.reply('❌ This is not a modmail thread.'); return; }

  const staffGuild = await getStaffGuild(message.client);
  if (!staffGuild) return;

  const cats   = await ensureCategories(staffGuild);
  const catId  = cats['Management'] ?? cats[Object.keys(cats)[0]];

  if (!catId) { await message.reply('❌ No escalation category found.'); return; }

  try {
    await message.channel.setParent(catId, { lockPermissions: false });
    updateThread(thread.threadId, { category: 'Escalated' });
    await message.reply('⬆️ Thread escalated.');
  } catch {
    await message.reply('❌ Failed to escalate thread.');
  }
}

export async function handleHelp(message, arg) {
  const embed = new EmbedBuilder()
    .setTitle('📬 Modmail Commands')
    .setColor(Colors.Blurple)
    .setDescription(
      '`.r <msg>` — Reply to user\n' +
      '`.ar <msg>` — Anonymous reply\n' +
      '`.close` — Close the thread\n' +
      '`.sub` — Toggle ping subscription\n' +
      '`.move <category>` — Move thread\n' +
      '`.block` — Block user\n' +
      '`.unblock <id>` — Unblock user\n' +
      '`.escalate` — Escalate thread\n' +
      '`.snippet add <name> <text>` — Save snippet\n' +
      '`.snippet remove <name>` — Delete snippet\n' +
      '`.snippet list` — List snippets\n' +
      '`.<name>` — Use snippet\n' +
      '`.s <name>` — Preview snippet\n' +
      '`.menu edit` — Edit DM category menu',
    );
  await message.reply({ embeds: [embed] });
}

export async function handleMenuEdit(message) {
  const opts   = getMenuOptions();
  const select = new StringSelectMenuBuilder()
    .setCustomId('menu_edit_select')
    .setPlaceholder('Choose an option to edit, or add a new one…')
    .addOptions([
      ...opts.map(o => ({ label: o.label, value: o.value, emoji: o.emoji, description: `Edit: ${o.description}` })),
      { label: '➕ Add New Option', value: '__add_new__', description: 'Add a brand new option to the user menu' },
    ]);

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🛠️ Edit Menu')
        .setDescription(
          '**Current options:**\n' +
          opts.map((o, i) => `${i + 1}. ${o.emoji} **${o.label}** — ${o.description}`).join('\n') +
          '\n\nSelect an option to edit it, or choose **➕ Add New Option** to create one.',
        )
        .setColor(Colors.Blurple),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

export async function handleMenuEditSelection(interaction) {
  const value = interaction.values[0];

  if (value === '__add_new__') {
    const modal = new ModalBuilder().setCustomId('menu_edit_modal___add_new__').setTitle('Add New Menu Option');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label (shown to users)').setStyle(TextInputStyle.Short).setPlaceholder('e.g. Bug Report').setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description (shown under label)').setStyle(TextInputStyle.Short).setPlaceholder('e.g. Report a bug or issue').setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (e.g. 🐛)').setStyle(TextInputStyle.Short).setPlaceholder('🐛').setRequired(true).setMaxLength(32)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('categoryId').setLabel('Category Channel ID (blank = auto by name)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)),
    );
    await interaction.showModal(modal);
    return;
  }

  const opts = getMenuOptions();
  const opt  = opts.find(o => o.value === value);
  if (!opt) { await interaction.reply({ content: '❌ Option not found.', ephemeral: true }); return; }

  const modal = new ModalBuilder().setCustomId(`menu_edit_modal_${value}`).setTitle(`Edit: ${opt.label}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label (shown to users)').setStyle(TextInputStyle.Short).setValue(opt.label).setRequired(true).setMaxLength(100)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description (shown under label)').setStyle(TextInputStyle.Short).setValue(opt.description).setRequired(true).setMaxLength(100)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (e.g. 📬 or :envelope:)').setStyle(TextInputStyle.Short).setValue(opt.emoji).setRequired(true).setMaxLength(32)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('categoryId').setLabel('Category Channel ID (blank = auto by name)').setStyle(TextInputStyle.Short).setValue(opt.categoryId ?? '').setRequired(false).setMaxLength(20)),
  );
  await interaction.showModal(modal);
}

export async function handleMenuEditModalSubmit(interaction) {
  const value       = interaction.customId.replace('menu_edit_modal_', '');
  const label       = interaction.fields.getTextInputValue('label').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const emoji       = interaction.fields.getTextInputValue('emoji').trim();
  const categoryIdRaw = interaction.fields.getTextInputValue('categoryId').trim();
  const categoryId  = categoryIdRaw || null;
  const isNew       = value === '__add_new__';

  if (isNew) {
    const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `option-${Date.now()}`;
    addMenuOption({ value: slug, label, description, emoji, categoryId });
  } else {
    updateMenuOption(value, { label, description, emoji, categoryId });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(isNew ? '✅ Menu Option Added' : '✅ Menu Option Updated')
        .setColor(Colors.Green)
        .addFields(
          { name: 'Label',       value: label,                              inline: true },
          { name: 'Emoji',       value: emoji,                              inline: true },
          { name: 'Description', value: description,                        inline: false },
          { name: 'Category ID', value: categoryId ?? '*Auto (by name)*',   inline: false },
        )
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
