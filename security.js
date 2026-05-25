import discordPkg from 'discord.js';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordPkg;

import client from './botClient.js';
import db from './db.js';

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

export function ipBlacklistMiddleware(req, res, next) {
  const ip = getClientIp(req);
  if (db.isIpBlacklisted(ip)) {
    console.warn(`🚫 Blocked IP: ${ip} → ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
}

// ── VPN / Proxy Detection ──────────────────────────────────────────────────────

const vpnCache = new Map();

export async function checkVpn(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('::') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    return false;
  }
  if (process.env.DISABLE_VPN_CHECK === 'true') return false;

  const cached = vpnCache.get(ip);
  if (cached && Date.now() - cached.checkedAt < 30 * 60 * 1000) {
    return cached.isVpn;
  }

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

// ── Breach Alert → Owner DM ───────────────────────────────────────────────────

export async function sendBreachAlert({ type, ip, detail, userId, username }) {
  const ownerId = process.env.OWNER_ID || process.env.ADMIN_ID;
  if (!ownerId) return;
  if (!client.isReady()) return;

  try {
    const owner = await client.users.fetch(ownerId).catch(() => null);
    if (!owner) return;

    const dmChannel = await owner.createDM().catch(() => null);
    if (!dmChannel) return;

    const embed = new EmbedBuilder()
      .setTitle(`🚨 Security Alert: ${type}`)
      .setColor(0xff3333)
      .addFields(
        { name: '📌 Event', value: String(detail || 'N/A'), inline: false },
        { name: '🌐 IP Address', value: String(ip || 'unknown'), inline: true },
        { name: '👤 User', value: userId ? `${username || 'Unknown'}\n\`${userId}\`` : 'Not logged in', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Discord Staff Portal · Security' });

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

    await dmChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('⚠️  Breach alert DM failed:', err.message);
  }
}
