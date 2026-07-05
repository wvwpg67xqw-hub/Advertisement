import { SlashCommandBuilder, EmbedBuilder } from './shared.js';
import { isConnected, getPool } from '../dbState.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ALLOWED_GUILD_ID = '1487744336908124190';
const ALLOWED_ROLE_ID  = '1488082727205998732';

export const defs = [
  new SlashCommandBuilder()
    .setName('import-db')
    .setDescription('Import a TXT database export file into the bot database')
    .addAttachmentOption(o =>
      o.setName('file')
        .setDescription('The .txt database export file to import')
        .setRequired(true)
    ),
];

// ── JSON fallback helpers ──────────────────────────────────────────────────────

const dataDir = join(process.cwd(), 'data', 'bot');

function readCol(name) {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, `${name}.json`);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function writeCol(name, data) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));
}

function mergeJsonFallback(tableName, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return 0;

  const existing = readCol(tableName);

  // Merge strategy: add records that don't already exist
  // We use a serialized key based on primary-key-like fields per table
  const pkFields = {
    guilds:              ['guild_id'],
    warns:               ['case_id'],
    ad_warns:            ['case_id'],
    strikes:             ['case_id'],
    jailed_users:        ['guild_id', 'user_id'],
    message_counts:      ['guild_id', 'user_id'],
    snipe_cache:         ['guild_id', 'channel_id'],
    balances:            ['guild_id', 'user_id'],
    breaks:              ['guild_id', 'user_id'],
    bot_applications:    ['guild_id', 'user_id'],
    bot_blacklist:       ['guild_id', 'user_id'],
    levels:              ['guild_id', 'user_id'],
    disabled_commands:   ['guild_id', 'command_name'],
    auto_reacts:         ['guild_id', 'user_id'],
    invite_blacklist:    ['guild_id', 'blocked_guild_id'],
    network_applications:['id'],
    sticky_messages:     ['guild_id', 'channel_id'],
    sticky_channel_state:['guild_id', 'channel_id'],
    hall_of_shame:       ['guild_id', 'message_id'],
    honeypot_config:     ['guild_id'],
    honeypot_triggers:   ['id'],
    ad_channels:         ['guild_id', 'channel_id'],
    ad_posts:            ['guild_id', 'message_id'],
  };

  const keys = pkFields[tableName];
  const makeKey = r => keys ? keys.map(k => r[k]).join('|') : JSON.stringify(r);
  const existingKeys = new Set(existing.map(makeKey));

  let added = 0;
  for (const row of incoming) {
    const k = makeKey(row);
    if (!existingKeys.has(k)) {
      existing.push(row);
      existingKeys.add(k);
      added++;
    }
  }

  if (added > 0) writeCol(tableName, existing);
  return added;
}

// ── MySQL import ───────────────────────────────────────────────────────────────

async function run(sql, params = []) {
  try { await getPool().query(sql, params); } catch {}
}

async function importToMySQL(data) {
  const stats = {};

  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || rows.length === 0) { stats[table] = 0; continue; }
    let count = 0;

    for (const r of rows) {
      try {
        switch (table) {
          case 'guilds':
            await run(
              `INSERT IGNORE INTO guilds (guild_id, log_channel_id, warn_log_channel_id,
                strike_log_channel_id, request_log_channel_id, ad_warn_log_channel_id,
                ad_warn_dm_log_channel_id, staff_updates_channel_id, jail_role_id,
                muted_role_id, ban_request_channel_id, blacklist_request_channel_id,
                network_ban_request_channel_id, partnership_request_channel_id,
                break_request_channel_id, break_role_id, main_break_role_id,
                resign_channel_id, verified_role_id, applications_channel_id,
                referral_link, modmail_test_channel_id, pfp_url, banner_url,
                network_apply_log_channel_id, network_apply_roles,
                hub_mod_role_id, hub_team_lead_role_id, hub_admin_role_id, hub_owner_role_id,
                level_log_channel_id, level_xp_channel_id, leveling_enabled,
                abuse_log_channel_id, is_hub, hub_guild_id, github_repo,
                is_staff_server, staff_guild_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [r.guild_id, r.log_channel_id||null, r.warn_log_channel_id||null,
               r.strike_log_channel_id||null, r.request_log_channel_id||null, r.ad_warn_log_channel_id||null,
               r.ad_warn_dm_log_channel_id||null, r.staff_updates_channel_id||null, r.jail_role_id||null,
               r.muted_role_id||null, r.ban_request_channel_id||null, r.blacklist_request_channel_id||null,
               r.network_ban_request_channel_id||null, r.partnership_request_channel_id||null,
               r.break_request_channel_id||null, r.break_role_id||null, r.main_break_role_id||null,
               r.resign_channel_id||null, r.verified_role_id||null, r.applications_channel_id||null,
               r.referral_link||null, r.modmail_test_channel_id||null, r.pfp_url||null, r.banner_url||null,
               r.network_apply_log_channel_id||null,
               typeof r.network_apply_roles === 'string' ? r.network_apply_roles : JSON.stringify(r.network_apply_roles||[]),
               r.hub_mod_role_id||null, r.hub_team_lead_role_id||null, r.hub_admin_role_id||null, r.hub_owner_role_id||null,
               r.level_log_channel_id||null, r.level_xp_channel_id||null,
               r.leveling_enabled != null ? r.leveling_enabled : 1,
               r.abuse_log_channel_id||null, r.is_hub||0, r.hub_guild_id||null, r.github_repo||null,
               r.is_staff_server||0, r.staff_guild_id||null]
            );
            count++; break;

          case 'warns':
            await run(
              `INSERT IGNORE INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
              [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
            );
            count++; break;

          case 'ad_warns':
            await run(
              `INSERT IGNORE INTO ad_warns (case_id, guild_id, user_id, moderator_id, reason, message_id, message_content, created_at) VALUES (?,?,?,?,?,?,?,?)`,
              [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.message_id||null, r.message_content||null, r.created_at]
            );
            count++; break;

          case 'strikes':
            await run(
              `INSERT IGNORE INTO strikes (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
              [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
            );
            count++; break;

          case 'jailed_users':
            await run(
              `INSERT IGNORE INTO jailed_users (guild_id, user_id, original_roles, jailed_at) VALUES (?,?,?,?)`,
              [r.guild_id, r.user_id, typeof r.original_roles === 'string' ? r.original_roles : JSON.stringify(r.original_roles||[]), r.jailed_at]
            );
            count++; break;

          case 'message_counts':
            await run(
              `INSERT INTO message_counts (guild_id, user_id, count) VALUES (?,?,?) ON DUPLICATE KEY UPDATE count = GREATEST(count, VALUES(count))`,
              [r.guild_id, r.user_id, r.count]
            );
            count++; break;

          case 'snipe_cache':
            await run(
              `INSERT INTO snipe_cache (guild_id, channel_id, content, author_id, author_name, author_avatar, deleted_at) VALUES (?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE content=VALUES(content), author_id=VALUES(author_id), author_name=VALUES(author_name), author_avatar=VALUES(author_avatar), deleted_at=VALUES(deleted_at)`,
              [r.guild_id, r.channel_id, r.content, r.author_id, r.author_name, r.author_avatar, r.deleted_at]
            );
            count++; break;

          case 'balances':
            await run(
              `INSERT INTO balances (guild_id, user_id, balance) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance = GREATEST(balance, VALUES(balance))`,
              [r.guild_id, r.user_id, r.balance]
            );
            count++; break;

          case 'breaks':
            await run(
              `INSERT IGNORE INTO breaks (guild_id, user_id, username, reason, started_at, end_at, saved_roles) VALUES (?,?,?,?,?,?,?)`,
              [r.guild_id, r.user_id, r.username, r.reason||null, r.started_at, r.end_at||null, typeof r.saved_roles === 'string' ? r.saved_roles : JSON.stringify(r.saved_roles||[])]
            );
            count++; break;

          case 'bot_applications':
            await run(
              `INSERT IGNORE INTO applications (guild_id, user_id, username, data, submitted_at) VALUES (?,?,?,?,?)`,
              [r.guild_id, r.user_id, r.username, r.data, r.submitted_at]
            );
            count++; break;

          case 'bot_blacklist':
            await run(
              `INSERT IGNORE INTO bot_blacklist (guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?)`,
              [r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
            );
            count++; break;

          case 'levels':
            await run(
              `INSERT INTO levels (guild_id, user_id, total_xp) VALUES (?,?,?) ON DUPLICATE KEY UPDATE total_xp = GREATEST(total_xp, VALUES(total_xp))`,
              [r.guild_id, r.user_id, r.total_xp]
            );
            count++; break;

          case 'disabled_commands':
            await run(
              `INSERT IGNORE INTO disabled_commands (guild_id, command_name) VALUES (?,?)`,
              [r.guild_id, r.command_name]
            );
            count++; break;

          case 'auto_reacts':
            await run(
              `INSERT INTO auto_reacts (guild_id, user_id, emoji_id, emoji_name, animated) VALUES (?,?,?,?,?)
               ON DUPLICATE KEY UPDATE emoji_id=VALUES(emoji_id), emoji_name=VALUES(emoji_name), animated=VALUES(animated)`,
              [r.guild_id || 'global', r.user_id, r.emoji_id||null, r.emoji_name||'', r.animated||0]
            );
            count++; break;

          case 'invite_blacklist':
            await run(
              `INSERT IGNORE INTO invite_blacklist (guild_id, blocked_guild_id, added_by, added_at) VALUES (?,?,?,?)`,
              [r.guild_id, r.blocked_guild_id, r.added_by, r.added_at]
            );
            count++; break;

          case 'network_applications':
            await run(
              `INSERT IGNORE INTO network_applications (target_guild_id, applicant_id, applicant_username, applicant_avatar, why, experience, timezone, age, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [r.target_guild_id, r.applicant_id, r.applicant_username, r.applicant_avatar||null, r.why, r.experience, r.timezone, r.age, r.status||'pending', r.created_at]
            );
            count++; break;

          case 'sticky_messages':
            await run(
              `INSERT INTO sticky_messages (guild_id, channel_id, message) VALUES (?,?,?) ON DUPLICATE KEY UPDATE message=VALUES(message)`,
              [r.guild_id, r.channel_id, r.message]
            );
            count++; break;

          case 'sticky_channel_state':
            await run(
              `INSERT INTO sticky_channel_state (guild_id, channel_id, last_message_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_message_id=VALUES(last_message_id)`,
              [r.guild_id, r.channel_id, r.last_message_id]
            );
            count++; break;

          case 'hall_of_shame':
            await run(
              `INSERT IGNORE INTO hall_of_shame (guild_id, message_id) VALUES (?,?)`,
              [r.guild_id, r.message_id]
            );
            count++; break;

          case 'honeypot_config':
            await run(
              `INSERT IGNORE INTO honeypot_config (guild_id, channel_id, alert_channel_id, action, created_at, created_by) VALUES (?,?,?,?,?,?)`,
              [r.guild_id, r.channel_id, r.alert_channel_id||null, r.action||'none', r.created_at, r.created_by]
            );
            count++; break;

          case 'honeypot_triggers':
            await run(
              `INSERT IGNORE INTO honeypot_triggers (guild_id, user_id, username, content_preview, triggered_at, action_taken) VALUES (?,?,?,?,?,?)`,
              [r.guild_id, r.user_id, r.username||null, r.content_preview||null, r.triggered_at, r.action_taken||'none']
            );
            count++; break;

          case 'ad_channels':
            await run(
              `INSERT IGNORE INTO ad_channels (guild_id, channel_id) VALUES (?,?)`,
              [r.guild_id, r.channel_id]
            );
            count++; break;

          case 'ad_posts':
            await run(
              `INSERT IGNORE INTO ad_posts (guild_id, channel_id, message_id, user_id, created_at) VALUES (?,?,?,?,?)`,
              [r.guild_id, r.channel_id, r.message_id, r.user_id, r.created_at]
            );
            count++; break;
        }
      } catch {}
    }

    stats[table] = count;
  }

  return stats;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function handleDbImport(interaction) {
  // Guild lock
  if (interaction.guildId !== ALLOWED_GUILD_ID) {
    return interaction.reply({ content: '❌ This command is not available in this server.', flags: 64 });
  }

  // Role lock
  if (!interaction.member?.roles?.cache?.has(ALLOWED_ROLE_ID)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const attachment = interaction.options.getAttachment('file');

  // Validate file type
  if (!attachment.name.endsWith('.txt') && !attachment.name.endsWith('.json')) {
    return interaction.editReply({ content: '❌ Only `.txt` or `.json` export files are supported.' });
  }

  // Enforce a 10 MB size cap
  if (attachment.size > 10 * 1024 * 1024) {
    return interaction.editReply({ content: '❌ File is too large (max 10 MB).' });
  }

  // Download the file
  let raw;
  try {
    const res = await fetch(attachment.url);
    raw = await res.text();
  } catch (err) {
    return interaction.editReply({ content: `❌ Failed to download file: ${err.message}` });
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return interaction.editReply({ content: '❌ File is not valid JSON. Make sure it\'s an unmodified database export.' });
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    return interaction.editReply({ content: '❌ Invalid format — expected a JSON object with table names as keys.' });
  }

  // Known importable tables
  const KNOWN_TABLES = new Set([
    'guilds', 'warns', 'ad_warns', 'strikes', 'jailed_users',
    'message_counts', 'snipe_cache', 'balances', 'breaks', 'bot_applications',
    'bot_blacklist', 'levels', 'disabled_commands', 'auto_reacts',
    'invite_blacklist', 'network_applications', 'sticky_messages',
    'sticky_channel_state', 'hall_of_shame', 'honeypot_config',
    'honeypot_triggers', 'ad_channels', 'ad_posts',
  ]);

  // Filter to only known tables
  const filtered = {};
  for (const [k, v] of Object.entries(data)) {
    if (KNOWN_TABLES.has(k) && Array.isArray(v)) filtered[k] = v;
  }

  if (Object.keys(filtered).length === 0) {
    return interaction.editReply({ content: '❌ No recognised table data found in the file.' });
  }

  const usingMySQL = isConnected();
  let stats;

  if (usingMySQL) {
    stats = await importToMySQL(filtered);
  } else {
    stats = {};
    for (const [table, rows] of Object.entries(filtered)) {
      stats[table] = mergeJsonFallback(table, rows);
    }
  }

  // Build summary
  const totalIn  = Object.values(filtered).reduce((s, a) => s + a.length, 0);
  const totalOut = Object.values(stats).reduce((s, n) => s + n, 0);

  const lines = Object.entries(stats)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `• \`${t}\` — ${n} record${n !== 1 ? 's' : ''} added`);

  const embed = new EmbedBuilder()
    .setTitle('📥 Database Import Complete')
    .setColor(totalOut > 0 ? 0x22c55e : 0xf59e0b)
    .setDescription(
      totalOut === 0
        ? '✅ Import finished — no new records to add (all records already exist).'
        : `✅ Import finished successfully.\n\n${lines.join('\n')}`
    )
    .addFields(
      { name: '📊 Storage',   value: usingMySQL ? '🗄️ MySQL'    : '📁 JSON fallback', inline: true },
      { name: '📥 In file',   value: `${totalIn} records`,                            inline: true },
      { name: '✅ Imported',  value: `${totalOut} new records`,                        inline: true },
    )
    .setFooter({ text: `Imported by ${interaction.user.tag} • ${attachment.name}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
