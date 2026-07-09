import pool from '../postgres.js';

let connected = false;

export function getPool() {
  return pool;
}

export function isConnected() {
  return connected;
}

export async function initDbState() {
  const tables = [

    `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      coins INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS guilds (
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
      github_repo TEXT,
      is_staff_server SMALLINT DEFAULT 0,
      staff_guild_id VARCHAR(20),
      staff_server_role_map TEXT,
      staff_server_skip_roles TEXT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS warns (
      id SERIAL PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS ad_warns (
      id SERIAL PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      message_id VARCHAR(20),
      message_content TEXT,
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS strikes (
      id SERIAL PRIMARY KEY,
      case_id VARCHAR(20),
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS jailed_users (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      original_roles TEXT,
      jailed_at BIGINT,
      PRIMARY KEY(guild_id,user_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS message_counts (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      count INTEGER DEFAULT 0,
      PRIMARY KEY(guild_id,user_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS balances (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      balance INTEGER DEFAULT 0,
      PRIMARY KEY(guild_id,user_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS levels (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      total_xp BIGINT DEFAULT 0,
      PRIMARY KEY(guild_id,user_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS disabled_commands (
      guild_id VARCHAR(20),
      command_name VARCHAR(100),
      PRIMARY KEY(guild_id,command_name)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS snipe_cache (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      content TEXT,
      author_id VARCHAR(20),
      author_name VARCHAR(200),
      author_avatar TEXT,
      deleted_at BIGINT,
      PRIMARY KEY(guild_id,channel_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(200),
      data TEXT,
      submitted_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS breaks (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(200),
      reason TEXT,
      started_at BIGINT,
      end_at BIGINT,
      saved_roles TEXT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS bot_blacklist (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      moderator_id VARCHAR(20),
      reason TEXT,
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS network_applications (
      id SERIAL PRIMARY KEY,
      target_guild_id VARCHAR(20),
      applicant_id VARCHAR(20),
      applicant_username VARCHAR(200),
      applicant_avatar TEXT,
      why TEXT,
      experience TEXT,
      timezone VARCHAR(100),
      age VARCHAR(10),
      status VARCHAR(20) DEFAULT 'pending',
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS ad_channels (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      PRIMARY KEY(guild_id,channel_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS ad_posts (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      message_id VARCHAR(20),
      user_id VARCHAR(20),
      created_at BIGINT
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS auto_reacts (
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      emoji_id VARCHAR(20),
      emoji_name VARCHAR(100) DEFAULT '',
      animated SMALLINT DEFAULT 0,
      ar_expires_at TIMESTAMP,
      PRIMARY KEY(guild_id,user_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS sticky_messages (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      message TEXT NOT NULL,
      PRIMARY KEY(guild_id,channel_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS sticky_channel_state (
      guild_id VARCHAR(20),
      channel_id VARCHAR(20),
      last_message_id VARCHAR(20),
      PRIMARY KEY(guild_id,channel_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS hall_of_shame (
      guild_id VARCHAR(20),
      message_id VARCHAR(20),
      PRIMARY KEY(guild_id,message_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS invite_blacklist (
      guild_id VARCHAR(20),
      blocked_guild_id VARCHAR(20),
      added_by VARCHAR(20),
      added_at BIGINT,
      PRIMARY KEY(guild_id,blocked_guild_id)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS honeypot_config (
      guild_id VARCHAR(20) PRIMARY KEY,
      channel_id VARCHAR(20) NOT NULL,
      alert_channel_id VARCHAR(20),
      action VARCHAR(20) DEFAULT 'none',
      created_at BIGINT,
      created_by VARCHAR(20)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS honeypot_triggers (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(200),
      content_preview TEXT,
      triggered_at BIGINT,
      action_taken VARCHAR(20)
    )
    `
  ];

  try {
    for (const sql of tables) {
      await pool.query(sql);
    }

    connected = true;
    console.log('✅ [DB] PostgreSQL tables ready');

  } catch (err) {
    connected = false;
    console.error('❌ [DB] Table creation failed:', err);
    throw err;
  }
}