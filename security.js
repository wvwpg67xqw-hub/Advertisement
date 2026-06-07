import discordPkg from 'discord.js';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordPkg;

import db from './db.js';
import { sendDM } from './dmRest.js';

// ── Get Real Client IP ─────────────────────────────────────────────────────────

export function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  ).replace(/^::ffff:/, '');
}

// ── Rate Limiting ──────────────────────────────────────────────────────────────

const rateLimitStore = new Map();

function isRateLimited(ip, key, maxRequests, windowMs) {
  const mapKey = `${key}:${ip}`;
  const now = Date.now();
  const record = rateLimitStore.get(mapKey);
  if (!record || now > record.resetAt) {
    rateLimitStore.set(mapKey, { count: 1, resetAt: now + windowMs });
    return false;
  }
  record.count++;
  return record.count > maxRequests;
}

export function rateLimit(key, maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    if (isRateLimited(ip, key, maxRequests, windowMs)) {
      sendBreachAlert({
        type: 'Rate Limit Exceeded',
        ip,
        detail: `${req.method} ${req.path}`,
        userId: req.session?.user?.userId,
        username: req.session?.user?.username,
      });
      return res.status(429).json({ error: 'Too many requests. Slow down.' });
    }
    next();
  };
}

// ── IP Blacklist Middleware ────────────────────────────────────────────────────

const BLOCKED_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access Denied — Staff Portal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0f13;color:#e2e8f0;font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;text-align:center}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:22px;font-weight:700;margin-bottom:8px;color:#f0f6fc}
  .sub{font-size:14px;color:#8b949e;margin-bottom:28px;line-height:1.6}
  .divider{height:1px;background:#30363d;margin:24px 0}
  label{display:block;text-align:left;font-size:12px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  textarea{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e2e8f0;font-size:14px;padding:12px;resize:vertical;min-height:120px;font-family:inherit;outline:none}
  textarea:focus{border-color:#58a6ff}
  button{width:100%;background:#58a6ff;color:#0d1117;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;margin-top:14px}
  button:hover{background:#79c0ff}
  button:disabled{opacity:.5;cursor:not-allowed}
  .msg{margin-top:14px;font-size:13px;padding:10px 14px;border-radius:8px;display:none}
  .msg.ok{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);display:block}
  .msg.err{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.3);display:block}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🚫</div>
  <h1>Your IP Has Been Blocked</h1>
  <p class="sub">Your IP address has been flagged and access to this portal has been restricted. If you believe this is a mistake, you can submit an appeal below.</p>
  <div class="divider"></div>
  <div id="form-wrap">
    <label for="reason">Why should your IP be unblocked?</label>
    <textarea id="reason" placeholder="Explain why your IP should be removed from the blocklist..." maxlength="2000"></textarea>
    <button id="submit-btn" onclick="submitAppeal()">Submit Appeal</button>
  </div>
  <div id="msg" class="msg"></div>
</div>
<script>
async function submitAppeal() {
  const reason = document.getElementById('reason').value.trim();
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('msg');
  msg.className = 'msg'; msg.textContent = '';
  if (!reason) { msg.className = 'msg err'; msg.textContent = 'Please explain why your IP should be unblocked.'; return; }
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const r = await fetch('/api/ip-appeal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const d = await r.json();
    if (r.ok) {
      document.getElementById('form-wrap').style.display = 'none';
      msg.className = 'msg ok'; msg.textContent = '✅ Appeal submitted! An admin will review it shortly.';
    } else {
      msg.className = 'msg err'; msg.textContent = d.error || 'Failed to submit. Try again.';
      btn.disabled = false; btn.textContent = 'Submit Appeal';
    }
  } catch { msg.className = 'msg err'; msg.textContent = 'Network error. Try again.'; btn.disabled = false; btn.textContent = 'Submit Appeal'; }
}
</script>
</body></html>`;

export function ipBlacklistMiddleware(req, res, next) {
  const ip = getClientIp(req);
  if (!db.isIpBlacklisted(ip)) return next();

  console.warn(`🚫 Blocked IP: ${ip} → ${req.method} ${req.path}`);

  // Always allow the appeal submission through
  if (req.method === 'POST' && req.path === '/api/ip-appeal') return next();

  // API routes → JSON 403
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Access denied.', blocked: true });

  // Web routes → serve the appeal page
  res.status(403).send(BLOCKED_PAGE);
}

// ── VPN / Proxy Detection ──────────────────────────────────────────────────────

const vpnCache = new Map();

export async function checkVpn(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('::') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    return false;
  }
  if (process.env.DISABLE_VPN_CHECK === 'true') return false;

  const cached = vpnCache.get(ip);
  if (cached && Date.now() - cached.checkedAt < 30 * 60 * 1000) return cached.isVpn;

  try {
    const keyParam = process.env.PROXYCHECK_KEY ? `&key=${process.env.PROXYCHECK_KEY}` : '';
    const response = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&risk=1${keyParam}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const entry = data[ip] || {};
    const isVpn = entry.proxy === 'yes' ||
      ['VPN', 'TOR', 'SOCKS4', 'SOCKS5', 'SOCKS', 'HTTP', 'HTTPS'].includes(entry.type?.toUpperCase());
    vpnCache.set(ip, { isVpn, checkedAt: Date.now() });
    return isVpn;
  } catch {
    return false;
  }
}

// ── Bot Account Detection ─────────────────────────────────────────────────────

export function isDiscordBot(discordUser) {
  if (discordUser.bot === true || discordUser.system === true) return true;
  const PUBLIC_FLAGS_BOT = 1 << 19;
  if (discordUser.public_flags && (discordUser.public_flags & PUBLIC_FLAGS_BOT)) return true;
  return false;
}

// ── Breach Alert → Owner DM (via REST, no gateway needed) ─────────────────────

export async function sendBreachAlert({ type, ip, detail, userId, username }) {
  const ownerId = process.env.OWNER_ID || '1453592157607825595';

  const embed = new EmbedBuilder()
    .setTitle(`🚨 Security Alert: ${type}`)
    .setColor(0xff3333)
    .addFields(
      { name: '📌 Event',    value: String(detail || 'N/A'),                                                    inline: false },
      { name: '🌐 IP',       value: String(ip || 'unknown'),                                                    inline: true  },
      { name: '👤 User',     value: userId ? `${username || 'Unknown'}\n\`${userId}\`` : 'Not logged in',       inline: true  },
    )
    .setTimestamp()
    .setFooter({ text: 'Staff Portal · Security' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sec_bl_${userId || 'none'}`)
      .setLabel('Blacklist User')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!userId),
    new ButtonBuilder()
      .setCustomId(`sec_ipbl_${ip}`)
      .setLabel('IP Blacklist')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!ip || ip === 'unknown'),
    new ButtonBuilder()
      .setCustomId('sec_dismiss')
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary),
  );

  await sendDM(ownerId, {
    embeds: [embed.toJSON()],
    components: [row.toJSON()],
  });
}
