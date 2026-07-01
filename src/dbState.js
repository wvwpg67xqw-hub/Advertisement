import mysql from 'mysql2/promise';
import { exportAllForMigration } from './jsonFallback.js';

let pool = null;
let connected = false;
let migrationDone = false;
let retryTimer = null;

const RETRY_INTERVAL_MS = 30_000;

function buildPool() {
  return mysql.createPool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit:    10,
    connectTimeout:     10000,
    multipleStatements: false,
  });
}

export function isConnected() { return connected; }
export function getPool()     { return pool; }

async function run(p, sql, params = []) {
  return p.query(sql, params).catch(() => {});
}

async function runMigration(p) {
  if (migrationDone) return;
  console.log('🔄 [DB] MySQL connected — migrating JSON fallback data...');
  try {
    const data = exportAllForMigration();

    for (const g of (data.guilds || [])) {
      await run(p,
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
        [
          g.guild_id, g.log_channel_id||null, g.warn_log_channel_id||null,
          g.strike_log_channel_id||null, g.request_log_channel_id||null, g.ad_warn_log_channel_id||null,
          g.ad_warn_dm_log_channel_id||null, g.staff_updates_channel_id||null, g.jail_role_id||null,
          g.muted_role_id||null, g.ban_request_channel_id||null, g.blacklist_request_channel_id||null,
          g.network_ban_request_channel_id||null, g.partnership_request_channel_id||null,
          g.break_request_channel_id||null, g.break_role_id||null, g.main_break_role_id||null,
          g.resign_channel_id||null, g.verified_role_id||null, g.applications_channel_id||null,
          g.referral_link||null, g.modmail_test_channel_id||null, g.pfp_url||null, g.banner_url||null,
          g.network_apply_log_channel_id||null,
          typeof g.network_apply_roles === 'string' ? g.network_apply_roles : JSON.stringify(g.network_apply_roles||[]),
          g.hub_mod_role_id||null, g.hub_team_lead_role_id||null, g.hub_admin_role_id||null, g.hub_owner_role_id||null,
          g.level_log_channel_id||null, g.level_xp_channel_id||null,
          g.leveling_enabled != null ? g.leveling_enabled : 1,
          g.abuse_log_channel_id||null, g.is_hub||0, g.hub_guild_id||null, g.github_repo||null,
          g.is_staff_server||0, g.staff_guild_id||null,
        ]
      );
    }

    for (const r of (data.warns || [])) {
      await run(p,
        `INSERT IGNORE INTO warns (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
        [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
      );
    }

    for (const r of (data.ad_warns || [])) {
      await run(p,
        `INSERT IGNORE INTO ad_warns (case_id, guild_id, user_id, moderator_id, reason, message_id, message_content, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.message_id||null, r.message_content||null, r.created_at]
      );
    }

    for (const r of (data.strikes || [])) {
      await run(p,
        `INSERT IGNORE INTO strikes (case_id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
        [r.case_id, r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
      );
    }

    for (const r of (data.jailed_users || [])) {
      await run(p,
        `INSERT IGNORE INTO jailed_users (guild_id, user_id, original_roles, jailed_at) VALUES (?,?,?,?)`,
        [r.guild_id, r.user_id, typeof r.original_roles === 'string' ? r.original_roles : JSON.stringify(r.original_roles||[]), r.jailed_at]
      );
    }

    for (const r of (data.message_counts || [])) {
      await run(p,
        `INSERT INTO message_counts (guild_id, user_id, count) VALUES (?,?,?) ON DUPLICATE KEY UPDATE count = GREATEST(count, VALUES(count))`,
        [r.guild_id, r.user_id, r.count]
      );
    }

    for (const r of (data.snipe_cache || [])) {
      await run(p,
        `INSERT INTO snipe_cache (guild_id, channel_id, content, author_id, author_name, author_avatar, deleted_at) VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE content=VALUES(content), author_id=VALUES(author_id), author_name=VALUES(author_name), author_avatar=VALUES(author_avatar), deleted_at=VALUES(deleted_at)`,
        [r.guild_id, r.channel_id, r.content, r.author_id, r.author_name, r.author_avatar, r.deleted_at]
      );
    }

    for (const r of (data.balances || [])) {
      await run(p,
        `INSERT INTO balances (guild_id, user_id, balance) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance = GREATEST(balance, VALUES(balance))`,
        [r.guild_id, r.user_id, r.balance]
      );
    }

    for (const r of (data.breaks || [])) {
      await run(p,
        `INSERT IGNORE INTO breaks (guild_id, user_id, username, reason, started_at, end_at, saved_roles) VALUES (?,?,?,?,?,?,?)`,
        [r.guild_id, r.user_id, r.username, r.reason||null, r.started_at, r.end_at||null, typeof r.saved_roles === 'string' ? r.saved_roles : JSON.stringify(r.saved_roles||[])]
      );
    }

    for (const r of (data.bot_applications || [])) {
      await run(p,
        `INSERT IGNORE INTO applications (guild_id, user_id, username, data, submitted_at) VALUES (?,?,?,?,?)`,
        [r.guild_id, r.user_id, r.username, r.data, r.submitted_at]
      );
    }

    for (const r of (data.bot_blacklist || [])) {
      await run(p,
        `INSERT IGNORE INTO bot_blacklist (guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?)`,
        [r.guild_id, r.user_id, r.moderator_id, r.reason, r.created_at]
      );
    }

    for (const r of (data.levels || [])) {
      await run(p,
        `INSERT INTO levels (guild_id, user_id, total_xp) VALUES (?,?,?) ON DUPLICATE KEY UPDATE total_xp = GREATEST(total_xp, VALUES(total_xp))`,
        [r.guild_id, r.user_id, r.total_xp]
      );
    }

    for (const r of (data.disabled_commands || [])) {
      await run(p,
        `INSERT IGNORE INTO disabled_commands (guild_id, command_name) VALUES (?,?)`,
        [r.guild_id, r.command_name]
      );
    }

    for (const r of (data.auto_reacts || [])) {
      await run(p,
        `INSERT INTO auto_reacts (guild_id, user_id, emoji_id, emoji_name, animated) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE emoji_id=VALUES(emoji_id), emoji_name=VALUES(emoji_name), animated=VALUES(animated)`,
        [r.guild_id || 'global', r.user_id, r.emoji_id||null, r.emoji_name||'', r.animated||0]
      );
    }

    for (const r of (data.invite_blacklist || [])) {
      await run(p,
        `INSERT IGNORE INTO invite_blacklist (guild_id, blocked_guild_id, added_by, added_at) VALUES (?,?,?,?)`,
        [r.guild_id, r.blocked_guild_id, r.added_by, r.added_at]
      );
    }

    for (const r of (data.network_applications || [])) {
      await run(p,
        `INSERT IGNORE INTO network_applications (target_guild_id, applicant_id, applicant_username, applicant_avatar, why, experience, timezone, age, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [r.target_guild_id, r.applicant_id, r.applicant_username, r.applicant_avatar||null, r.why, r.experience, r.timezone, r.age, r.status||'pending', r.created_at]
      );
    }

    for (const r of (data.sticky_messages || [])) {
      await run(p,
        `INSERT INTO sticky_messages (guild_id, channel_id, message) VALUES (?,?,?) ON DUPLICATE KEY UPDATE message=VALUES(message)`,
        [r.guild_id, r.channel_id, r.message]
      );
    }

    for (const r of (data.sticky_channel_state || [])) {
      await run(p,
        `INSERT INTO sticky_channel_state (guild_id, channel_id, last_message_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_message_id=VALUES(last_message_id)`,
        [r.guild_id, r.channel_id, r.last_message_id]
      );
    }

    for (const r of (data.hall_of_shame || [])) {
      await run(p,
        `INSERT IGNORE INTO hall_of_shame (guild_id, message_id) VALUES (?,?)`,
        [r.guild_id, r.message_id]
      );
    }

    for (const r of (data.honeypot_config || [])) {
      await run(p,
        `INSERT IGNORE INTO honeypot_config (guild_id, channel_id, alert_channel_id, action, created_at, created_by) VALUES (?,?,?,?,?,?)`,
        [r.guild_id, r.channel_id, r.alert_channel_id||null, r.action||'none', r.created_at, r.created_by]
      );
    }

    for (const r of (data.honeypot_triggers || [])) {
      await run(p,
        `INSERT IGNORE INTO honeypot_triggers (guild_id, user_id, username, content_preview, triggered_at, action_taken) VALUES (?,?,?,?,?,?)`,
        [r.guild_id, r.user_id, r.username||null, r.content_preview||null, r.triggered_at, r.action_taken||'none']
      );
    }

    for (const r of (data.ad_channels || [])) {
      await run(p,
        `INSERT IGNORE INTO ad_channels (guild_id, channel_id) VALUES (?,?)`,
        [r.guild_id, r.channel_id]
      );
    }

    for (const r of (data.ad_posts || [])) {
      await run(p,
        `INSERT IGNORE INTO ad_posts (guild_id, channel_id, message_id, user_id, created_at) VALUES (?,?,?,?,?)`,
        [r.guild_id, r.channel_id, r.message_id, r.user_id, r.created_at]
      );
    }

    migrationDone = true;
    console.log('✅ [DB] JSON → MySQL migration complete.');
  } catch (err) {
    console.error('⚠️  [DB] Migration error (non-fatal):', err.message);
  }
}

async function initTables(p) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      coins INT DEFAULT 0,
      xp INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS guilds (
      guild_id VARCHAR(20) PRIMARY KEY,
      log_channel_id VARCHAR(20),
      warn_log_channel_id VARCHAR(20),
      strike_log_channel_id VARCHAR(20),
      request_log_channel_id VARCHAR(20),
      ad_warn_log_channel_id VARCHAR(20),
      ad_warn_dm_log_channel_id VARCHAR(20),
      level_log_channel_id VARCHAR(20),
      level_xp_channel_id VARCHAR(20),
      leveling_enabled SMALLINT DEFAULT 1,
      staff_updates_channel_id VARCHAR(20),
      jail_role_id VARCHAR(20),
      muted_role_id VARCHAR(20),
      command_roles TEXT,
      ban_request_channel_id VARCHAR(20),
      blacklist_request_channel_id VARCHAR(20),
      network_ban_request_channel_id VARCHAR(20),
      partnership_request_channel_id VARCHAR(20),
      is_hub SMALLINT DEFAULT 0,
      hub_guild_id VARCHAR(20),
      break_request_channel_id VARCHAR(20),
      break_role_id VARCHAR(20),
      main_break_role_id VARCHAR(20),
      resign_channel_id VARCHAR(20),
      verified_role_id VARCHAR(20),
      applications_channel_id VARCHAR(20),
      referral_link TEXT,
      modmail_test_channel_id VARCHAR(20),
      pfp_url TEXT,
      banner_url TEXT,
      network_apply_log_channel_id VARCHAR(20),
      network_apply_roles TEXT,
      abuse_log_channel_id VARCHAR(20),
      hub_mod_role_id VARCHAR(20),
      hub_team_lead_role_id VARCHAR(20),
      hub_admin_role_id VARCHAR(20),
      hub_owner_role_id VARCHAR(20),
      github_repo VARCHAR(200),
      is_staff_server SMALLINT DEFAULT 0,
      staff_guild_id VARCHAR(20),
      staff_server_role_map TEXT,
      staff_server_skip_roles TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS warns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS ad_warns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      message_id VARCHAR(20),
      message_content TEXT,
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS strikes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS jailed_users (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      original_roles TEXT,
      jailed_at INT,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS message_counts (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      count INT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS snipe_cache (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      content TEXT,
      author_id VARCHAR(20),
      author_name VARCHAR(200),
      author_avatar TEXT,
      deleted_at INT,
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS balances (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      balance INT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS breaks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(200),
      reason TEXT,
      started_at INT,
      end_at INT,
      saved_roles TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(200),
      data TEXT,
      submitted_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS levels (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      total_xp BIGINT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS disabled_commands (
      guild_id VARCHAR(20),
      command_name VARCHAR(100),
      PRIMARY KEY (guild_id, command_name)
    )`,
    `CREATE TABLE IF NOT EXISTS bot_blacklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS network_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target_guild_id VARCHAR(20),
      applicant_id VARCHAR(20),
      applicant_username VARCHAR(200),
      applicant_avatar TEXT,
      why TEXT,
      experience TEXT,
      timezone VARCHAR(100),
      age VARCHAR(10),
      status VARCHAR(20) DEFAULT 'pending',
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS ad_channels (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ad_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      message_id VARCHAR(20),
      user_id VARCHAR(20),
      created_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS auto_reacts (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      emoji_id VARCHAR(20),
      emoji_name VARCHAR(100) NOT NULL DEFAULT '',
      animated SMALLINT DEFAULT 0,
      ar_expires_at DATETIME NULL,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sticky_messages (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      message TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sticky_channel_state (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      last_message_id VARCHAR(20),
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS hall_of_shame (
      guild_id VARCHAR(20),
      message_id VARCHAR(20),
      PRIMARY KEY (guild_id, message_id)
    )`,
    `CREATE TABLE IF NOT EXISTS invite_blacklist (
      guild_id VARCHAR(20),
      blocked_guild_id VARCHAR(20),
      added_by VARCHAR(20),
      added_at INT,
      PRIMARY KEY (guild_id, blocked_guild_id)
    )`,
    `CREATE TABLE IF NOT EXISTS honeypot_config (
      guild_id VARCHAR(20) PRIMARY KEY,
      channel_id VARCHAR(20) NOT NULL,
      alert_channel_id VARCHAR(20),
      action VARCHAR(20) NOT NULL DEFAULT 'none',
      created_at INT NOT NULL,
      created_by VARCHAR(20) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS honeypot_triggers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(20) NOT NULL,
      user_id VARCHAR(20) NOT NULL,
      username VARCHAR(200),
      content_preview TEXT,
      triggered_at INT NOT NULL,
      action_taken VARCHAR(20) NOT NULL DEFAULT 'none'
    )`,
  ];
  for (const sql of tables) await p.query(sql).catch(() => {});

  const colMigrations = [
    `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS staff_server_role_map TEXT`,
    `ALTER TABLE guilds ADD COLUMN IF NOT EXISTS staff_server_skip_roles TEXT`,
  ];
  for (const sql of colMigrations) await p.query(sql).catch(() => {});

  console.log('✅ [DB] MySQL tables ready');
}

async function tryConnect(isRetry = false) {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const name = process.env.DB_NAME;

  if (!host || !user || !name) {
    console.error('❌ [DB] DB_HOST, DB_USER, and DB_NAME must be set — cannot connect to MySQL.');
    return false;
  }

  if (!isRetry) {
    console.log(`🔌 [DB] Connecting to MySQL: ${user}@${host}:${process.env.DB_PORT || 3306}/${name}`);
  }

  try {
    const p = buildPool();
    const conn = await p.getConnection();
    conn.release();
    await initTables(p);
    pool = p;
    connected = true;
    console.log('✅ [DB] Connected to MySQL');
    await runMigration(p);
    return true;
  } catch (err) {
    if (!isRetry) {
      console.error('❌ [DB] MySQL connection FAILED — falling back to JSON storage.');
      console.error(`❌ [DB] Host:      ${host}:${process.env.DB_PORT || 3306}`);
      console.error(`❌ [DB] Database:  ${name}`);
      console.error(`❌ [DB] User:      ${user}`);
      console.error(`❌ [DB] Error:     ${err.message}`);
    } else {
      console.warn(`⚠️  [DB] Retry failed: ${err.code ?? err.message}`);
    }
    connected = false;
    pool = null;
    return false;
  }
}

function startRetryLoop() {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    if (connected) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
    console.log('🔁 [DB] Retrying MySQL connection...');
    const ok = await tryConnect(true);
    if (ok) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }, RETRY_INTERVAL_MS);
}

export async function initDb() {
  const ok = await tryConnect();
  if (!ok) startRetryLoop();
}
