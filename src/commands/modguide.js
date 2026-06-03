import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from './shared.js';
import { hasCommandPermission } from '../utils.js';
import { deny } from './shared.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('modguide')
    .setDescription('Send the moderator guide with action guidelines')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Channel to post the guide in (leave blank to post here)')),
];

// ── Guide Pages ───────────────────────────────────────────────────────────────

const PAGES = {
  overview: {
    label: '📋 General Info',
    color: 0x5865F2,
    title: '📋 Moderator Guide',
    description: [
      'Click a button below to privately view that section.',
      'Only you will see the content — it won\'t show in chat.',
      '',
      '**📋 General Info** — your role, rules, and escalation order',
      '**⚠️ Warnings** — when to warn, what counts, good reasons',
      '**📩 Requests** — how to escalate to senior staff properly',
    ].join('\n'),
  },

  warnings: {
    label: '⚠️ Warnings',
    color: 0xF59E0B,
    title: '⚠️ When & How to Warn',
    description: [
      '**When to warn**',
      '> Use `/warn` after a verbal reminder has been ignored, or for a clear rule break.',
      '> Do not warn for something you would not say out loud in front of senior staff.',
      '',
      '**✅ Warn for**',
      '> • Disrespect or toxicity toward members or staff',
      '> • Spamming messages, pings, or reactions',
      '> • NSFW or inappropriate content outside designated channels',
      '> • Unsolicited advertising',
      '> • Ignoring mod instructions after a verbal reminder',
      '> • Evading an active mute or punishment',
      '',
      '**❌ Do not warn for**',
      '> • First-time minor slip-ups — a reminder is enough',
      '> • Off-server behaviour with no evidence',
      '> • Banter or jokes with no real harm done',
      '',
      '**Good vs bad reasons**',
      '> ❌ `"was being rude"`',
      '> ✅ `"Called multiple members slurs in #general after being told to stop — [message link]"`',
      '',
      '> ❌ `"spam"`',
      '> ✅ `"Sent 15+ identical messages in #chat within 2 minutes — [message link]"`',
    ].join('\n'),
  },

  requests: {
    label: '📩 Requests',
    color: 0x10B981,
    title: '📩 How to Submit a Request Properly',
    description: [
      '**What counts as a request**',
      '> A request is when you escalate to senior staff to take action you cannot take yourself',
      '> — such as a ban, network ban, or blacklist.',
      '',
      '**When to submit a request**',
      '> • User has accumulated multiple warns/mutes with no change',
      '> • Serious rule break that goes beyond a warn or mute (hate speech, doxxing, scamming)',
      '> • User is ban-evading on an alt account',
      '> • User is a threat across multiple servers (network ban)',
      '',
      '**❌ Do not submit a request for**',
      '> • Something a warn or mute would handle',
      '> • Off-server behaviour with no proof',
      '> • Personal disputes — you must be impartial',
      '',
      '**How to write a good request reason**',
      '> Follow this format exactly:',
      '> `[What they did] — [History of actions taken] — [Evidence]`',
      '',
      '> ❌ `"been causing issues for a while"`',
      '> ✅ `"Repeated hate speech in #general — 2 warns + 24h mute, no improvement — [case IDs + message links]"`',
      '',
      '> ❌ `"scammer"`',
      '> ✅ `"Sent phishing links to 3 members in DMs, confirmed via screenshots — [evidence]"`',
      '',
      '**Tip:** The more detail you give, the faster senior staff can action it.',
    ].join('\n'),
  },
};

// ── Build embed + row from a page key ────────────────────────────────────────

function buildPage(key) {
  const page = PAGES[key];
  const embed = new EmbedBuilder()
    .setColor(page.color)
    .setTitle(page.title)
    .setDescription(page.description)
    .setFooter({ text: 'Moderator Guide • Use the buttons to navigate' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('modguide:overview')
      .setLabel('📋 General Info')
      .setStyle(key === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:warnings')
      .setLabel('⚠️ Warnings')
      .setStyle(key === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:requests')
      .setLabel('📩 Requests')
      .setStyle(key === 'requests' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── Slash command handler ─────────────────────────────────────────────────────

export async function handleModGuide(interaction) {
  if (!await hasCommandPermission(interaction.member, 'modguide')) return deny(interaction);

  const target = interaction.options.getChannel('channel');

  if (target) {
    if (!target.isTextBased()) {
      return interaction.reply({ content: '❌ Please choose a text channel.', flags: 64 });
    }
    await target.send(buildPage('overview'));
    return interaction.reply({ content: `✅ Mod guide posted in ${target}.`, flags: 64 });
  }

  await interaction.reply(buildPage('overview'));
}

// ── Button interaction handler (called from server.js) ────────────────────────

export async function handleModGuideButton(interaction) {
  const key = interaction.customId.slice('modguide:'.length);
  if (!PAGES[key]) return;
  const page = PAGES[key];
  const embed = new EmbedBuilder()
    .setColor(page.color)
    .setTitle(page.title)
    .setDescription(page.description)
    .setFooter({ text: 'Moderator Guide • Only you can see this' })
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: 64 });
}
