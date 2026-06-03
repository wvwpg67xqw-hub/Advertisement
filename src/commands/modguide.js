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
      '**📢 Ad Warn** — ad channel violations and how to handle them',
      '**🔵 Conduct** — general conduct rules for moderators',
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

  adwarn: {
    label: '📢 Ad Warn',
    color: 0xA855F7,
    title: '📢 Ad Warnings — When & How',
    description: [
      '**What is an ad warn?**',
      '> Use `/ad-warn` when a user breaks the advertising rules in an ad channel.',
      '> This is separate from a regular warn and tracked independently.',
      '',
      '**✅ Ad warn for**',
      '> • Posting an ad that does not follow the required format',
      '> • Bumping or reposting an ad before the cooldown has expired',
      '> • Posting ads in non-designated channels',
      '> • Using misleading or deceptive content in an ad',
      '> • Advertising content that violates server rules (NSFW, scam, etc.)',
      '',
      '**❌ Do not ad warn for**',
      '> • A genuine first-time formatting mistake — correct them first',
      '> • Content issues that are already covered by a regular `/warn`',
      '',
      '**How to use it**',
      '> Run `/ad-warn` and provide the **message ID or thread ID** of the ad,',
      '> plus a clear reason. The bot will log it and notify the user.',
      '',
      '**Good vs bad reasons**',
      '> ❌ `"bad ad"`',
      '> ✅ `"Ad reposted 2 hours after previous post — cooldown is 24h — [message link]"`',
      '',
      '> ❌ `"wrong format"`',
      '> ✅ `"Ad missing required description field — posted plain link with no details — [message link]"`',
    ].join('\n'),
  },

  conduct: {
    label: '📋 General Info',
    color: 0x5865F2,
    title: '📋 General Conduct',
    description: [
      '**Your role as a moderator**',
      '> You are here to keep the server safe and on-topic.',
      '> You warn and mute. Bans are handled by senior staff — always escalate.',
      '',
      '**Before you act**',
      '> • Read the full context — never moderate on a single message alone',
      '> • Give a verbal reminder first for minor things',
      '> • If in doubt, ping a senior staff member — do not guess',
      '> • Never moderate someone you have a personal issue with',
      '',
      '**General rules**',
      '> • Keep all mod actions professional and unbiased',
      '> • Always provide a clear, specific reason for every action',
      '> • Everything is logged — act as if senior staff are watching',
      '> • Do not discuss mod actions publicly with members',
      '',
      '**Escalation order**',
      '> Verbal reminder → Warn → Mute → Escalate to senior staff',
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
      .setCustomId('modguide:conduct')
      .setLabel('📋 Conduct')
      .setStyle(key === 'conduct' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:warnings')
      .setLabel('⚠️ Warnings')
      .setStyle(key === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:requests')
      .setLabel('📩 Requests')
      .setStyle(key === 'requests' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:adwarn')
      .setLabel('📢 Ad Warn')
      .setStyle(key === 'adwarn' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:overview')
      .setLabel('ℹ️ About')
      .setStyle(key === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
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
