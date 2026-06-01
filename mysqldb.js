import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'nc1.lemonhost.me',
  port:     Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'mysql',
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS guilds (
      guild_id                     VARCHAR(20) PRIMARY KEY,
      log_channel_id               VARCHAR(20),
      warn_log_channel_id          VARCHAR(20),
      strike_log_channel_id        VARCHAR(20),
      request_log_channel_id       VARCHAR(20),
      ad_warn_log_channel_id       VARCHAR(20),
      staff_updates_channel_id     VARCHAR(20),
      jail_role_id                 VARCHAR(20),
      muted_role_id                VARCHAR(20),
      command_roles                TEXT,
      ban_request_channel_id       VARCHAR(20),
      blacklist_request_channel_id VARCHAR(20),
      network_ban_request_channel_id VARCHAR(20),
      partnership_request_channel_id VARCHAR(20),
      is_hub                       TINYINT(1) DEFAULT 0,
      hub_guild_id                 VARCHAR(20),
      break_request_channel_id     VARCHAR(20),
      break_role_id                VARCHAR(20),
      main_break_role_id           VARCHAR(20),
      resign_channel_id            VARCHAR(20),
      verified_role_id             VARCHAR(20),
      applications_channel_id      VARCHAR(20),
      referral_link                TEXT,
      modmail_test_channel_id      VARCHAR(20),
      pfp_url                      TEXT,
      banner_url                   TEXT,
      network_apply_log_channel_id VARCHAR(20),
      network_apply_roles          TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS warns (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      case_id      VARCHAR(20),
      guild_id     VARCHAR(20),
      user_id      VARCHAR(20),
      moderator_id VARCHAR(20),
      reason       TEXT,
      created_at   INT
    )`,
    `CREATE TABLE IF NOT EXISTS ad_warns (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      case_id         VARCHAR(20),
      guild_id        VARCHAR(20),
      user_id         VARCHAR(20),
      moderator_id    VARCHAR(20),
      reason          TEXT,
      message_id      VARCHAR(20),
      message_content TEXT,
      created_at      INT
    )`,
    `CREATE TABLE IF NOT EXISTS strikes (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      case_id      VARCHAR(20),
      guild_id     VARCHAR(20),
      user_id      VARCHAR(20),
      moderator_id VARCHAR(20),
      reason       TEXT,
      created_at   INT
    )`,
    `CREATE TABLE IF NOT EXISTS jailed_users (
      guild_id       VARCHAR(20),
      user_id        VARCHAR(20),
      original_roles TEXT,
      jailed_at      INT,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS message_counts (
      guild_id VARCHAR(20),
      user_id  VARCHAR(20),
      count    INT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS snipe_cache (
      guild_id     VARCHAR(20),
      channel_id   VARCHAR(20),
      content      TEXT,
      author_id    VARCHAR(20),
      author_name  VARCHAR(200),
      author_avatar TEXT,
      deleted_at   INT,
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS balances (
      guild_id VARCHAR(20),
      user_id  VARCHAR(20),
      balance  INT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS breaks (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      guild_id    VARCHAR(20),
      user_id     VARCHAR(20),
      username    VARCHAR(200),
      reason      TEXT,
      started_at  INT,
      end_at      INT,
      saved_roles TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS applications (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      guild_id     VARCHAR(20),
      user_id      VARCHAR(20),
      username     VARCHAR(200),
      data         TEXT,
      submitted_at INT
    )`,
    `CREATE TABLE IF NOT EXISTS bot_blacklist (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      guild_id     VARCHAR(20),
      user_id      VARCHAR(20),
      moderator_id VARCHAR(20),
      reason       TEXT,
      created_at   INT
    )`,
    `CREATE TABLE IF NOT EXISTS network_applications (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      target_guild_id     VARCHAR(20),
      applicant_id        VARCHAR(20),
      applicant_username  VARCHAR(200),
      applicant_avatar    TEXT,
      why                 TEXT,
      experience          TEXT,
      timezone            VARCHAR(100),
      age                 VARCHAR(10),
      status              VARCHAR(20) DEFAULT 'pending',
      created_at          INT
    )`,
    `CREATE TABLE IF NOT EXISTS ad_channels (
      guild_id   VARCHAR(20),
      channel_id VARCHAR(20),
      PRIMARY KEY (guild_id, channel_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ad_posts (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      guild_id   VARCHAR(20),
      channel_id VARCHAR(20),
      message_id VARCHAR(20),
      user_id    VARCHAR(20),
      created_at INT
    )`,
  ];

  for (const sql of tables) {
    await pool.execute(sql);
  }
  console.log('✅ MySQL tables initialized');
}

export default pool;
