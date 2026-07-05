/**
 * autoUpdate.js
 *
 * Silently checks https://github.com/wvwpg67xqw-hub/Advertisement for new or
 * changed files and pulls them in behind the scenes.
 *
 * How local-modification protection works (no git CLI required):
 *  - A manifest file (.autoupdate-manifest.json) records the SHA of every file
 *    at the time it was last downloaded.
 *  - On each run we compute the current local SHA and compare it with the
 *    manifest SHA.  If they differ → the file was locally edited → skip it.
 *  - If the local SHA matches the manifest but differs from the remote → safe
 *    update (remote has a newer version).
 *  - Files not in the manifest that already exist locally are treated as
 *    locally owned and are never overwritten.
 *  - Files that don't exist locally at all are always added.
 *
 * Never blocks or crashes the main process.
 */

import { createHash }                      from 'crypto';
import { existsSync, readFileSync,
         writeFileSync, mkdirSync }        from 'fs';
import { dirname, join }                  from 'path';
import { execSync }                       from 'child_process';

// ── Config ─────────────────────────────────────────────────────────────────────

const REPO_OWNER    = 'wvwpg67xqw-hub';
const REPO_NAME     = 'Advertisement';
const BRANCH        = 'main';
const RAW_BASE      = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const API_BASE      = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const TAG           = '[AutoUpdate]';
const MANIFEST_PATH = join(process.cwd(), '.autoupdate-manifest.json');

// Paths that must never be touched
const SKIP_PREFIXES = [
  'node_modules/',
  'client/node_modules/',
  'client/dist/',
  'data/',
  '.cache/',
  '.local/',
  '.git/',
];
const SKIP_EXACT = new Set(['.env', '.autoupdate-manifest.json']);

// Trigger follow-up actions when these change
const TRIGGERS_NPM    = new Set(['package.json', 'package-lock.json']);
const TRIGGERS_CLIENT = new Set(['client/package.json', 'client/package-lock.json']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function shouldSkip(path) {
  if (SKIP_EXACT.has(path)) return true;
  return SKIP_PREFIXES.some(p => path.startsWith(p));
}

/** Compute the git blob SHA-1 for raw file bytes — same algorithm GitHub uses. */
function gitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`);
  return createHash('sha1').update(Buffer.concat([header, buf])).digest('hex');
}

function loadManifest() {
  try {
    if (existsSync(MANIFEST_PATH))
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {}
  return {};
}

function saveManifest(manifest) {
  try { writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2)); } catch {}
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'discord-staff-portal-autoupdate/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'discord-staff-portal-autoupdate/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Core ───────────────────────────────────────────────────────────────────────

export async function runAutoUpdate() {
  try {
    console.log(`${TAG} Checking for updates…`);

    // 1. Fetch remote tree
    const tree = await fetchJson(`${API_BASE}/git/trees/${BRANCH}?recursive=1`);
    if (!tree.tree || !Array.isArray(tree.tree)) {
      console.warn(`${TAG} Could not read repository tree — skipping.`);
      return;
    }

    const blobs    = tree.tree.filter(n => n.type === 'blob' && !shouldSkip(n.path));
    const manifest = loadManifest();

    let added      = 0;
    let updated    = 0;
    let protected_ = 0;
    let needsNpm   = false;
    let needsClient = false;

    for (const node of blobs) {
      const localPath = join(process.cwd(), node.path);
      const exists    = existsSync(localPath);

      if (exists) {
        // Compute current local SHA
        let localSha;
        try {
          localSha = gitBlobSha(readFileSync(localPath));
        } catch {
          protected_++;
          continue; // can't read — skip
        }

        // Already matches remote — nothing to do
        if (localSha === node.sha) continue;

        const manifestSha = manifest[node.path];

        if (manifestSha === undefined) {
          // File exists locally but was never pulled by us → locally owned → protect
          protected_++;
          continue;
        }

        if (localSha !== manifestSha) {
          // Local SHA differs from what we last wrote → local edit → protect
          protected_++;
          continue;
        }

        // Local SHA == manifest SHA but != remote SHA → safe to update
      }
      // else: file doesn't exist locally at all → always add

      // Download from GitHub
      let content;
      try {
        content = await fetchBinary(`${RAW_BASE}/${node.path}`);
      } catch (dlErr) {
        console.warn(`${TAG} ⚠️  Could not download ${node.path}: ${dlErr.message}`);
        continue;
      }

      const dir = dirname(localPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(localPath, content);

      // Record the SHA we wrote in the manifest
      manifest[node.path] = node.sha;

      if (exists) {
        console.log(`${TAG} 🔄 Updated ${node.path}`);
        updated++;
      } else {
        console.log(`${TAG} ➕ Added   ${node.path}`);
        added++;
      }

      if (TRIGGERS_NPM.has(node.path))    needsNpm    = true;
      if (TRIGGERS_CLIENT.has(node.path)) needsClient = true;
    }

    saveManifest(manifest);

    const total = added + updated;
    if (total === 0) {
      const note = protected_ ? ` (${protected_} locally-modified file(s) left untouched)` : '';
      console.log(`${TAG} ✅ Already up to date${note}.`);
      return;
    }

    console.log(
      `${TAG} ✅ ${added} added, ${updated} updated` +
      (protected_ ? `, ${protected_} protected` : '') + '.'
    );

    // 3. Re-run npm install if package.json changed
    if (needsNpm) {
      console.log(`${TAG} 📦 package.json changed — running npm install…`);
      try {
        execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
        console.log(`${TAG} ✅ npm install done.`);
      } catch (e) {
        console.warn(`${TAG} ⚠️  npm install failed: ${e.message}`);
      }
    }

    // 4. Rebuild React client if its package.json changed
    if (needsClient) {
      console.log(`${TAG} 🔨 Client package changed — rebuilding…`);
      try {
        execSync('cd client && npm install && npm run build', { stdio: 'inherit', cwd: process.cwd() });
        console.log(`${TAG} ✅ Client rebuilt.`);
      } catch (e) {
        console.warn(`${TAG} ⚠️  Client build failed: ${e.message}`);
      }
    }

  } catch (err) {
    console.warn(`${TAG} ⚠️  Update check failed (non-fatal): ${err.message}`);
  }
}
