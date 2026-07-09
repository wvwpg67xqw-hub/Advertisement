// ── Per-table lock: serializes read-modify-write sequences so concurrent
// callers (e.g. syncing multiple guilds at once) can't race each other. ──
const _locks = new Map();

export function withTableLock(table, fn) {
  const prev = _locks.get(table) || Promise.resolve();
  const next = prev.then(fn, fn); // run fn after prev settles, even if prev rejected
  _locks.set(table, next.catch(() => {})); // keep chain alive even on error
  return next;
}