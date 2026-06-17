const API = 'https://discord.com/api/v10';

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'image/png';
  const mime = contentType.split(';')[0].trim();
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime};base64,${b64}`;
}

export function emojiCdnUrl(emojiId, animated) {
  return `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`;
}

export async function uploadAppEmoji(name, imageSource, animated = false) {
  const token    = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) throw new Error('TOKEN or CLIENT_ID not set');

  const safeName = name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'custom_emoji';

  const dataUrl = imageSource.startsWith('data:')
    ? imageSource
    : await fetchImageAsDataUrl(imageSource);

  const res = await fetch(`${API}/applications/${clientId}/emojis`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: safeName, image: dataUrl }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Discord API error ${res.status}`);
  }

  const data = await res.json();
  return { id: data.id, name: data.name, animated: data.animated ?? animated };
}
