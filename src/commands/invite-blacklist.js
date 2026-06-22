import discordPkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder } = discordPkg;

import pool from '../../mysqldb.js';
import client from '../../botClient.js';
import { getStaffRank } from '../utils.js';
import { deny } from './shared.js';

// ── In-memory cache: guildId → Set<blockedGuildId> ───────────────────────────

const cache = new Map();

async function loadCache(guildId) {
  const [rows] = await pool.execute(
    'SELECT blocked_guild_id FROM invite_blacklist WHERE guild_id = ?',
    [guildId],
  );
  cache.set(guildId, new Set(rows.map(r => r.blocked_guild_id)));
}

export async function isInviteBlacklisted(guildId, blockedGuildId) {
  if (!cache.has(guildId)) await loadCache(guildId);
  return cache.get(guildId).has(blockedGuildId);
}

export async function preloadInviteBlacklist(guilds) {
  for (const guildId of guilds) {
    await loadCache(guildId).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addBlocked(guildId, blockedGuildId, addedBy) {
  await pool.execute(
    `INSERT IGNORE INTO invite_blacklist (guild_id, blocked_guild_id, added_by, added_at)
     VALUES (?, ?, ?, ?)`,
    [guildId, blockedGuildId, addedBy, Math.floor(Date.now() / 1000)],
  );
  if (!cache.has(guildId)) cache.set(guildId, new Set());
  cache.get(guildId).add(blockedGuildId);
}

async function removeBlocked(guildId, blockedGuildId) {
  await pool.execute(
    'DELETE FROM invite_blacklist WHERE guild_id = ? AND blocked_guild_id = ?',
    [guildId, blockedGuildId],
  );
  cache.get(guildId)?.delete(blockedGuildId);
}

async function listBlocked(guildId) {
  const [rows] = await pool.execute(
    'SELECT blocked_guild_id, added_by, added_at FROM invite_blacklist WHERE guild_id = ? ORDER BY added_at DESC',
    [guildId],
  );
  return rows;
}

// ── Command Definitions ───────────────────────────────────────────────────────

export const defs = [
  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the invite blacklist')
    .addSubcommandGroup(g =>
      g.setName('server')
        .setDescription('Blacklist a Discord server by ID')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Block invites to a specific server')
            .addStringOption(o =>
              o.setName('id').setDescription('Discord server ID to blacklist').setRequired(true))
            .addStringOption(o =>
              o.setName('reason').setDescription('Reason (optional)').setRequired(false)))
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('Remove a server from the invite blacklist')
            .addStringOption(o =>
              o.setName('id').setDescription('Discord server ID to remove').setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('Show all blacklisted servers'))),

  new SlashCommandBuilder()
    .setName('mass-blacklist')
    .setDescription('Blacklist multiple servers at once by ID')
    .addStringOption(o =>
      o.setName('ids')
        .setDescription('Space or comma-separated server IDs')
        .setRequired(true)),
];

// ── Guard ─────────────────────────────────────────────────────────────────────

function guard(interaction) {
  const rank = getStaffRank(interaction.member);
  if (rank < 3 && !interaction.member.permissions.has(8n)) {
    deny(interaction);
    return false;
  }
  return true;
}

// ── /blacklist server handler ─────────────────────────────────────────────────

export async function handleBlacklistServer(interaction) {
  if (!guard(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'add') {
    const id     = interaction.options.getString('id').trim();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!/^\d{17,20}$/.test(id)) {
      return interaction.editReply({ content: '❌ Invalid server ID. Must be a Discord snowflake (17–20 digits).' });
    }

    if (!cache.has(guildId)) await loadCache(guildId);
    if (cache.get(guildId).has(id)) {
      return interaction.editReply({ content: `⚠️ Server \`${id}\` is already blacklisted.` });
    }

    await addBlocked(guildId, id, interaction.user.id);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚫 Server Blacklisted')
          .setColor(0xED4245)
          .addFields(
            { name: '🆔 Server ID', value: `\`${id}\``,            inline: true },
            { name: '📝 Reason',    value: reason,                  inline: true },
            { name: '👤 Added by',  value: `${interaction.user}`,   inline: true },
          )
          .setDescription('Any invite link to this server will now be automatically deleted.')
          .setTimestamp(),
      ],
    });
  }

  if (sub === 'remove') {
    const id = interaction.options.getString('id').trim();

    if (!cache.has(guildId)) await loadCache(guildId);
    if (!cache.get(guildId)?.has(id)) {
      return interaction.editReply({ content: `⚠️ Server \`${id}\` is not in the blacklist.` });
    }

    await removeBlocked(guildId, id);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Server Removed')
          .setColor(0x57F287)
          .setDescription(`Server \`${id}\` has been removed from the invite blacklist.`)
          .setTimestamp(),
      ],
    });
  }

  if (sub === 'list') {
    const rows = await listBlocked(guildId);
    if (rows.length === 0) {
      return interaction.editReply({ content: '📋 No servers are currently blacklisted.' });
    }

    const lines = rows.map((r, i) =>
      `\`${i + 1}.\` \`${r.blocked_guild_id}\` — added by <@${r.added_by}> <t:${r.added_at}:R>`,
    );

    const pages = [];
    for (let i = 0; i < lines.length; i += 20) {
      pages.push(lines.slice(i, i + 20).join('\n'));
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🚫 Blacklisted Servers (${rows.length})`)
          .setColor(0xED4245)
          .setDescription(pages[0])
          .setFooter(pages.length > 1 ? { text: `Showing 1–${Math.min(20, rows.length)} of ${rows.length}` } : null)
          .setTimestamp(),
      ],
    });
  }
}

// ── /mass-blacklist handler — applies to ALL guilds the bot is in ─────────────

export async function handleMassBlacklist(interaction) {
  if (!guard(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  const raw = interaction.options.getString('ids');
  const ids = [...new Set(raw.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s)))];

  if (ids.length === 0) {
    return interaction.editReply({ content: '❌ No valid server IDs found. IDs must be 17–20 digit snowflakes.' });
  }

  const allGuildIds = [...client.guilds.cache.keys()];
  const addedBy     = interaction.user.id;
  const now         = Math.floor(Date.now() / 1000);

  // Track which IDs are genuinely new vs already everywhere
  const added   = [];
  const already = [];

  for (const blockedId of ids) {
    let newInAny = false;

    for (const gId of allGuildIds) {
      if (!cache.has(gId)) await loadCache(gId);

      if (!cache.get(gId).has(blockedId)) {
        await pool.execute(
          `INSERT IGNORE INTO invite_blacklist (guild_id, blocked_guild_id, added_by, added_at)
           VALUES (?, ?, ?, ?)`,
          [gId, blockedId, addedBy, now],
        );
        cache.get(gId).add(blockedId);
        newInAny = true;
      }
    }

    if (newInAny) added.push(blockedId);
    else already.push(blockedId);
  }

  const fields = [];
  if (added.length)   fields.push({ name: `✅ Added to ${allGuildIds.length} servers (${added.length} IDs)`,   value: added.map(id => `\`${id}\``).join('\n').slice(0, 1024),   inline: false });
  if (already.length) fields.push({ name: `⚠️ Already fully blacklisted (${already.length})`, value: already.map(id => `\`${id}\``).join('\n').slice(0, 1024), inline: false });

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🚫 Network Mass Blacklist Complete')
        .setColor(added.length > 0 ? 0xED4245 : 0xFEE75C)
        .setDescription(`Applied across **${allGuildIds.length}** servers in the network.`)
        .addFields(...fields)
        .setFooter({ text: `Run by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
  });
}

// ── Message filter — call this from messageCreate ─────────────────────────────

const INVITE_RE = /discord(?:\.gg|(?:app)?\.com\/invite)\/([a-zA-Z0-9\-]{2,32})/gi;

export async function checkInviteBlacklist(msg) {
  // Only skip other bots — no bypass for admins, staff, server owner, or any role
  if (!msg.guild || msg.author.bot) return;

  const content = msg.content;
  const matches = [...content.matchAll(INVITE_RE)];
  if (matches.length === 0) return;

  const guildId = msg.guildId;
  if (!cache.has(guildId)) await loadCache(guildId);
  const blocked = cache.get(guildId);
  if (blocked.size === 0) return;

  for (const match of matches) {
    const code = match[1];
    let invite;
    try {
      invite = await msg.client.fetchInvite(code);
    } catch {
      continue;
    }

    const targetGuildId = invite?.guild?.id;
    if (!targetGuildId) continue;

    if (blocked.has(targetGuildId)) {
      await msg.delete().catch(() => {});

      const warn = await msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🚫 Invite Blocked')
            .setDescription(`${msg.author}, that server's invite link is not allowed here.`)
            .setTimestamp(),
        ],
      }).catch(() => null);

      if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
      return;
    }
  }
}
