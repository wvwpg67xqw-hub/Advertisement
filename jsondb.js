import pool from './postgres.js';

// ── Per-table lock: serializes read-modify-write sequences so concurrent
// callers (e.g. syncing multiple guilds at once) can't race each other. ──
const _locks = new Map();

export function withTableLock(name, fn) {
  const prev = _locks.get(name) || Promise.resolve();
  const next = prev.then(fn, fn); // run fn after prev settles, even if prev rejected
  _locks.set(name, next.catch(() => {})); // keep chain alive even on error
  return next;
}

export async function readCol(name) {
  const result = await pool.query(`SELECT * FROM "${name}"`);
  return result.rows || [];
}

export async function writeCol(name, data) {
  if (!Array.isArray(data)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM "${name}"`);

    for (const row of data) {
      const keys = Object.keys(row);
      const values = Object.values(row);

      if (!keys.length) continue;

      await client.query(
        `INSERT INTO "${name}" (${keys.map(k => `"${k}"`).join(', ')})
         VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function nextId(name) {
  const result = await pool.query(
    `SELECT COALESCE(MAX(id), 0) + 1 AS next FROM "${name}"`
  );
  return Number(result.rows[0]?.next ?? 1);
}

export function ts() {
  return Math.floor(Date.now() / 1000);
}