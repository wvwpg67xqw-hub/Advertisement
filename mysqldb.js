import pool from './postgres.js';

export async function initDb() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Neon database connected');
    return true;
  } catch (err) {
    console.error('❌ Neon connection failed:', err.message);
    return false;
  }
}

export function isConnected() {
  return true;
}

export function getPool() {
  return pool;
}

// mysql2-compatible shim. Several older command modules (honeypot.js,
// invite-blacklist.js, dev-commands.js) still call pool.execute(sql, params)
// and destructure mysql2's [rows, fields] return shape, but `pool` here is a
// real `pg` Pool — pg has no `.execute()` method and returns `{ rows }`, not
// `[rows, fields]`. This wraps pg's query() to look like mysql2's execute().
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function execute(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  // Mimic mysql2's OkPacket.affectedRows for non-SELECT statements, since
  // some callers (e.g. dev-commands.js cleanup helpers) read r.affectedRows.
  const rows = result.rows;
  rows.affectedRows = result.rowCount;
  return [rows, []];
}

const poolProxy = new Proxy({ execute }, {
  get(target, prop) {
    if (prop in target) return target[prop];
    const value = pool[prop];
    return typeof value === 'function' ? value.bind(pool) : value;
  },
});

export default poolProxy;