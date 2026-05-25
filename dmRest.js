/**
 * dmRest.js — Send Discord DMs via REST API, no gateway connection required.
 * Works immediately from startup as long as TOKEN is set.
 */

const DISCORD_API = 'https://discord.com/api/v10';

async function discordRest(method, path, body) {
  const TOKEN = process.env.TOKEN;
  if (!TOKEN) return null;

  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Discord REST ${method} ${path} → ${res.status}: ${err.message || JSON.stringify(err)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Send a DM to a Discord user.
 * @param {string} userId  Discord user ID
 * @param {object} payload  { content?, embeds?, components? }
 */
export async function sendDM(userId, payload) {
  if (!process.env.TOKEN) {
    console.warn('⚠️  TOKEN not set — DM not sent to', userId);
    return false;
  }
  try {
    // Step 1: Open (or get existing) DM channel
    const channel = await discordRest('POST', '/users/@me/channels', { recipient_id: userId });
    if (!channel?.id) throw new Error('No channel ID returned');

    // Step 2: Send the message
    await discordRest('POST', `/channels/${channel.id}/messages`, payload);
    return true;
  } catch (err) {
    console.error(`⚠️  DM to ${userId} failed:`, err.message);
    return false;
  }
}
