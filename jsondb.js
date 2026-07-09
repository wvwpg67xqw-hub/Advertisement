import pool from './postgres.js';

export async function readCol(name) {
  const result = await pool.query(`SELECT * FROM ${name}`);
  return result.rows;
}

export async function writeCol(name, data) {
  await pool.query(`DELETE FROM ${name}`);

  for (const row of data) {
    const keys = Object.keys(row);
    const values = Object.values(row);

    await pool.query(
      `INSERT INTO ${name} (${keys.join(', ')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
      values
    );
  }
}

export async function nextId(name) {
  const result = await pool.query(
    `SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${name}`
  );

  return Number(result.rows[0].next);
}

export function ts() {
  return Math.floor(Date.now() / 1000);
}