let createCanvas, loadImage;
try {
  const canvasPkg = await import('@napi-rs/canvas');
  createCanvas = canvasPkg.createCanvas;
  loadImage    = canvasPkg.loadImage;
} catch {
  createCanvas = null;
  loadImage    = null;
}

const DISCORD_BG       = '#313338';
const CARD_BG          = '#2b2d31';
const TEXT_PRIMARY     = '#dbdee1';
const TEXT_SECONDARY   = '#949ba4';
const USERNAME_COLOR   = '#ffffff';
const TIMESTAMP_COLOR  = '#87898c';
const PADDING          = 20;
const AVATAR_SIZE      = 40;
const WIDTH            = 680;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function splitNewlines(ctx, text, maxWidth) {
  const result = [];
  for (const raw of text.split('\n')) {
    const wrapped = wrapText(ctx, raw, maxWidth);
    result.push(...(wrapped.length ? wrapped : ['']));
  }
  return result;
}

function formatTimestamp(date) {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export async function buildMessageCard(msgData) {
  if (!createCanvas || !loadImage) return null;
  const {
    avatarUrl,
    username,
    content,
    timestamp,
    channelName,
    guildName,
    starCount,
    attachmentUrl,
  } = msgData;

  // ── Measure text to determine canvas height ──────────────────────────────

  const innerWidth = WIDTH - PADDING * 2;
  const textX      = PADDING + AVATAR_SIZE + 14;
  const textWidth  = innerWidth - AVATAR_SIZE - 14;

  // Temp canvas for measuring
  const tmp = createCanvas(WIDTH, 100);
  const tctx = tmp.getContext('2d');
  tctx.font = '15px sans-serif';

  const contentLines = content ? splitNewlines(tctx, content, textWidth) : [];

  // Heights
  const headerH    = 22;
  const lineH      = 22;
  const contentH   = contentLines.length * lineH;
  const footerH    = 28;
  const imgH       = attachmentUrl ? 200 : 0;
  const imgGap     = attachmentUrl ? 10 : 0;
  const topPad     = PADDING;
  const botPad     = PADDING;

  const HEIGHT = topPad + Math.max(AVATAR_SIZE, headerH + contentH) + imgGap + imgH + footerH + botPad + 8;

  // ── Draw ──────────────────────────────────────────────────────────────────

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Left accent bar
  ctx.fillStyle = '#5865f2';
  ctx.fillRect(0, 0, 4, HEIGHT);

  // Avatar circle
  const avatarX = PADDING + 4;
  const avatarY = topPad;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    ctx.drawImage(img, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
  } catch {
    ctx.fillStyle = '#5865f2';
    ctx.fillRect(avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
  }
  ctx.restore();

  // Username
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = USERNAME_COLOR;
  ctx.fillText(username, textX, topPad + 15);

  // Timestamp
  const nameWidth = ctx.measureText(username).width;
  ctx.font = '12px sans-serif';
  ctx.fillStyle = TIMESTAMP_COLOR;
  ctx.fillText(formatTimestamp(timestamp), textX + nameWidth + 8, topPad + 14);

  // Content
  ctx.font = '15px sans-serif';
  ctx.fillStyle = TEXT_PRIMARY;
  let lineY = topPad + headerH + 4;
  for (const line of contentLines) {
    ctx.fillText(line, textX, lineY + 15);
    lineY += lineH;
  }

  // Attached image
  let imgBottom = topPad + Math.max(AVATAR_SIZE, headerH + contentH);
  if (attachmentUrl) {
    imgBottom += imgGap;
    try {
      const img = await loadImage(attachmentUrl);
      const ratio  = img.width / img.height;
      const drawW  = Math.min(textWidth, img.width);
      const drawH  = Math.min(imgH, drawW / ratio);
      ctx.drawImage(img, textX, imgBottom, drawW, drawH);
      imgBottom += drawH;
    } catch {}
  }

  // Footer bar
  const footerY = HEIGHT - footerH - botPad + 4;
  ctx.fillStyle = DISCORD_BG;
  ctx.fillRect(0, footerY, WIDTH, footerH + botPad);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.fillText(`#${channelName}  ·  ${guildName}`, PADDING + 8, footerY + 17);

  ctx.fillStyle = '#ffd700';
  const starLabel = `⭐ ${starCount}`;
  const starW     = ctx.measureText(starLabel).width;
  ctx.fillText(starLabel, WIDTH - PADDING - starW - 4, footerY + 17);

  return canvas.toBuffer('image/png');
}
