import { EmbedBuilder } from 'discord.js';
import { getGuild } from './database.js';

const ABUSE_ROLE_ID = '1518775422836539442';

// in-memory store: key → array of timestamps (ms)
const _store = new Map();

// Rules — threshold actions within windowMs trigger an alert
// scope 'target' = per moderator+target combo, 'mod' = per moderator only
const RULES = [
  { action: 'mute',    scope: 'target', windowMs: 10 * 60_000, threshold: 2, label: '🔇 Mute Spam',    desc: 'The same user was muted multiple times in a short period.' },
  { action: 'warn',    scope: 'target', windowMs: 10 * 60_000, threshold: 3, label: '⚠️ Warn Spam',    desc: 'Multiple warns issued against the same user in a short period.' },
  { action: 'ad-warn', scope: 'mod',    windowMs:  5 * 60_000, threshold: 3, label: '📢 Ad-Warn Spam', desc: 'Multiple ad-warns issued in a short period.' },
  { action: 'strike',  scope: 'target', windowMs: 10 * 60_000, threshold: 2, label: '❗ Strike Spam',  desc: 'The same user was struck multiple times in a short period.' },
  { action: 'ban',     scope: 'mod',    windowMs:  5 * 60_000, threshold: 3, label: '🔨 Ban Spam',     desc: 'Multiple bans issued in a short period.' },
  { action: 'jail',    scope: 'target', windowMs: 10 * 60_000, threshold: 2, label: '🔒 Jail Spam',    desc: 'The same user was jailed multiple times in a short period.' },
];

const RULE_MAP = new Map(RULES.map(r => [r.action, r]));

function makeKey(rule, guildId, moderatorId, targetId) {
  return rule.scope === 'target'
    ? `${guildId}:${rule.action}:${moderatorId}:${targetId}`
    : `${guildId}:${rule.action}:${moderatorId}`;
}

async function sendAbuseAlert(guild, rule, moderatorId, targetId, count) {
  try {
    const config = await getGuild(guild.id).catch(() => null);
    if (!config) return;

    const logChannelId = config.log_channel_id || config.request_log_channel_id || config.general_log_channel_id;
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel?.isTextBased()) return;

    const windowMin = Math.round(rule.windowMs / 60_000);
    const targetLine = rule.scope === 'target' && targetId
      ? `\n**Target:** <@${targetId}> (\`${targetId}\`)`
      : '';

    const embed = new EmbedBuilder()
      .setColor(0xFF4444)
      .setTitle(`🚨 Command Abuse Detected — ${rule.label}`)
      .setDescription(rule.desc)
      .addFields(
        { name: '👮 Moderator',   value: `<@${moderatorId}> (\`${moderatorId}\`)`, inline: true },
        { name: '📋 Action',      value: `\`${rule.action}\``,                      inline: true },
        { name: '🔢 Count',       value: `**${count}** in the last ${windowMin} min`, inline: true },
      )
      .setFooter({ text: 'Review this moderator\'s recent actions immediately.' })
      .setTimestamp();

    if (rule.scope === 'target' && targetId) {
      embed.addFields({ name: '🎯 Target User', value: `<@${targetId}> (\`${targetId}\`)`, inline: false });
    }

    await logChannel.send({
      content: `<@&${ABUSE_ROLE_ID}> **Possible command abuse detected.**${targetLine}`,
      embeds: [embed],
    });
  } catch { /* best-effort */ }
}

/**
 * Call this after every moderation action completes successfully.
 * @param {object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {string} opts.action  - 'mute' | 'warn' | 'ad-warn' | 'strike' | 'ban' | 'jail'
 * @param {string} opts.moderatorId
 * @param {string} [opts.targetId]  - required for target-scoped rules
 */
export async function trackAbuse({ guild, action, moderatorId, targetId = null }) {
  const rule = RULE_MAP.get(action);
  if (!rule) return;

  const key  = makeKey(rule, guild.id, moderatorId, targetId);
  const now  = Date.now();
  const cutoff = now - rule.windowMs;

  if (!_store.has(key)) _store.set(key, []);
  const times = _store.get(key).filter(t => t > cutoff);
  times.push(now);
  _store.set(key, times);

  if (times.length >= rule.threshold) {
    // Reset so we don't fire the same alert on every subsequent action
    _store.set(key, []);
    await sendAbuseAlert(guild, rule, moderatorId, targetId, times.length);
  }
}
