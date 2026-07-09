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

const poolProxy = new Proxy({}, {
  get(_, prop) {
    return (...args) => {
      return pool[prop](...args);
    };
  },
});

export default poolProxy;