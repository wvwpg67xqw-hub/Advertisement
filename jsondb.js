import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

export function readCol(name) {
  const path = join(dataDir, `${name}.json`);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

export function writeCol(name, data) {
  writeFileSync(join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));
}

export function nextId(name) {
  const rows = readCol(name);
  if (!rows.length) return 1;
  return Math.max(...rows.map(r => r.id || 0)) + 1;
}

export function ts() {
  return Math.floor(Date.now() / 1000);
}
