import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from './shared.js';
import { hasCommandPermission } from '../utils.js';
import { deny } from './shared.js';

export const defs = [
  new SlashCommandBuilder()
    .setName('modguide')
    .setDescription('Send the moderator guide with action guidelines'),
];

// ── Guide Pages ───────────────────────────────────────────────────────────────

const PAGES = {
  overview: {
    label: '📋 Overview',
    color: 0x5865F2,
    title: '📋 Moderator Guide — Overview',
    description: [
      'Welcome to the moderator guide. Use the buttons below to navigate each section.',
      '',
      '**Sections**',
      '> ⚠️ **Warnings** — when and how to warn correctly',
      '> 🔇 **Mutes** — when to mute and for how long',
      '> 🚫 **Strikes** — when a strike is appropriate',
      '> 🔒 **Jail** — when to jail a user',
      '',
      '**Golden Rules**',
      '> • Always act professionally and without bias',
      '> • Document everything — vague reasons will be rejected',
      '> • Escalate to senior staff if you are unsure — do not guess',
      '> • Never moderate someone you have a personal conflict with',
      '> • All actions are logged and reviewed by senior staff',
      '> • Bans are handled by senior staff — escalate, do not attempt them yourself',
    ].join('\n'),
  },

  warnings: {
    label: '⚠️ Warnings',
    color: 0xF59E0B,
    title: '⚠️ How to Warn Correctly',
    description: [
      '**When to issue a `/warn`**',
      '> Use `/warn` for clear rule violations that do not require an immediate mute.',
      '> Warnings are on record and stack — repeated offenders escalate automatically.',
      '',
      '**✅ Valid warning reasons**',
      '> • Disrespectful or toxic behaviour toward members or staff',
      '> • Spamming messages, reactions, or mentions',
      '> • Posting NSFW or inappropriate content in non-designated channels',
      '> • Advertising without permission',
      '> • Ignoring moderator instructions after a verbal reminder',
      '> • Bypassing a timeout or active punishment',
      '',
      '**❌ Do NOT warn for**',
      '> • Minor misunderstandings — give a verbal reminder first',
      '> • Things that happened off-server with no evidence',
      '> • Jokes or sarcasm with no real harm',
      '',
      '**Writing a good reason**',
      '> ❌ Bad: `"being rude"`',
      '> ✅ Good: `"Repeatedly insulted members in #general after a verbal warning — [message link]"`',
      '',
      '**Escalation path**',
      '> Verbal reminder → `/warn` → `/mute` → `/strike` → escalate to senior staff',
    ].join('\n'),
  },

  mutes: {
    label: '🔇 Mutes',
    color: 0xF97316,
    title: '🔇 When & How to Mute',
    description: [
      '**When to issue a `/mute`**',
      '> Mute when a user needs to be silenced immediately or has ignored warnings.',
      '',
      '**✅ Valid mute reasons**',
      '> • Continued behaviour after one or more warnings',
      '> • Active spamming or flooding a channel',
      '> • Heated argument that is escalating — mute all parties to cool down',
      '> • Posting disruptive or harmful content repeatedly',
      '',
      '**⏱️ Duration guide**',
      '> • First offence / cooling off: `10m` – `1h`',
      '> • Repeated minor behaviour: `1h` – `6h`',
      '> • Serious or continued violation: `12h` – `24h`',
      '> • Anything longer → escalate to senior staff for a strike instead',
      '',
      '**❌ Do NOT mute for**',
      '> • A single, minor message — warn first',
      '> • Personal disagreements between members with no rule break',
      '',
      '**Writing a good reason**',
      '> ❌ Bad: `"spam"`',
      '> ✅ Good: `"Spamming #general with repeated pings after a warn — [message link]"`',
    ].join('\n'),
  },

  strikes: {
    label: '🚫 Strikes',
    color: 0xEF4444,
    title: '🚫 When to Issue a Strike',
    description: [
      '**When to issue a `/strike`**',
      '> Strikes are serious — use them when warns and mutes have not worked,',
      '> or when a violation is severe enough to skip straight to this level.',
      '',
      '**✅ Valid strike reasons**',
      '> • Multiple warnings with no improvement in behaviour',
      '> • Returning from a mute and immediately reoffending',
      '> • Serious disrespect or harassment toward staff or members',
      '> • Attempting to undermine or bypass moderation',
      '> • Sharing harmful content (non-bannable, but clearly intentional)',
      '',
      '**❌ Do NOT strike for**',
      '> • A first-time minor offence — warn or mute first',
      '> • Situations where the user was unaware of the rule',
      '',
      '**After 3 strikes**',
      '> Escalate to senior staff. You do not issue bans — hand it over with a',
      '> full summary of the warn/mute/strike history and evidence.',
      '',
      '**Writing a good reason**',
      '> ❌ Bad: `"bad behaviour"`',
      '> ✅ Good: `"Third offence — harassing members in #general after 2 warns and a 6h mute — [case IDs]"`',
    ].join('\n'),
  },

  jail: {
    label: '🔒 Jail',
    color: 0x6B7280,
    title: '🔒 When to Use Jail',
    description: [
      '**When to use `/jail`**',
      '> Jail removes all roles and isolates the user. Use it when someone needs to be',
      '> contained immediately while the situation is reviewed — not as a routine punishment.',
      '',
      '**✅ Valid jail reasons**',
      '> • User is actively causing serious disruption and needs to be stopped immediately',
      '> • Suspected account compromise — isolate while investigating',
      '> • User is evading a mute or punishment and needs full isolation',
      '> • Senior staff has instructed you to jail pending a review',
      '',
      '**❌ Do NOT jail for**',
      '> • Normal rule breaks that a warn or mute would handle',
      '> • Punishment or revenge — jail is a containment tool, not a sanction',
      '> • Extended periods without senior staff awareness',
      '',
      '**After jailing**',
      '> Immediately notify senior staff with the reason and evidence.',
      '> Do not leave a user jailed indefinitely — it must be reviewed.',
      '> Use `/unjail` once senior staff clears the user or takes over.',
      '',
      '**Writing a good reason**',
      '> ❌ Bad: `"causing issues"`',
      '> ✅ Good: `"Active raid-style message spam across 3 channels — contained pending senior review"`',
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
      .setLabel('📋 Overview')
      .setStyle(key === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:warnings')
      .setLabel('⚠️ Warnings')
      .setStyle(key === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:mutes')
      .setLabel('🔇 Mutes')
      .setStyle(key === 'mutes' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:strikes')
      .setLabel('🚫 Strikes')
      .setStyle(key === 'strikes' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('modguide:jail')
      .setLabel('🔒 Jail')
      .setStyle(key === 'jail' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── Slash command handler ─────────────────────────────────────────────────────

export async function handleModGuide(interaction) {
  if (!await hasCommandPermission(interaction.member, 'modguide')) return deny(interaction);
  await interaction.reply(buildPage('overview'));
}

// ── Button interaction handler (called from server.js) ────────────────────────

export async function handleModGuideButton(interaction) {
  const key = interaction.customId.slice('modguide:'.length);
  if (!PAGES[key]) return;
  await interaction.update(buildPage(key));
}
