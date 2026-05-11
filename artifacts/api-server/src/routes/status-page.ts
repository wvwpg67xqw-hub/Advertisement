import { Router } from "express";

const router = Router();

const STATUS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bot Status</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #1a1a2e;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #fff;
      padding: 24px;
    }
    .card {
      background: #2d2d44;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      text-align: center;
    }
    .avatar {
      width: 80px; height: 80px;
      border-radius: 50%;
      background: #5865F2;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px;
      font-size: 36px;
      position: relative;
    }
    .dot {
      position: absolute; bottom: 4px; right: 4px;
      width: 20px; height: 20px;
      border-radius: 50%;
      border: 3px solid #2d2d44;
    }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; }
    .sub { margin: 0 0 32px; color: #8e9197; font-size: 14px; }
    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      border-radius: 20px; padding: 6px 16px; margin-bottom: 32px;
      font-size: 14px; font-weight: 600;
      border: 1px solid;
    }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px; }
    .stat {
      background: #23233a; border-radius: 10px; padding: 16px 12px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .stat-icon { font-size: 20px; margin-bottom: 6px; }
    .stat-value { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 2px; }
    .stat-label { font-size: 12px; color: #8e9197; }
    .section {
      background: #23233a; border-radius: 10px; padding: 16px;
      margin-bottom: 24px; text-align: left;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .section-title { margin: 0 0 10px; font-size: 12px; font-weight: 600; color: #8e9197; text-transform: uppercase; letter-spacing: 0.08em; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag {
      background: rgba(88,101,242,0.2);
      border: 1px solid rgba(88,101,242,0.4);
      border-radius: 6px; padding: 3px 10px;
      font-size: 12px; color: #949cf7;
    }
    .info-box {
      background: rgba(88,101,242,0.1);
      border-radius: 10px; padding: 14px 16px;
      border: 1px solid rgba(88,101,242,0.2);
      text-align: left; margin-bottom: 20px;
      font-size: 12px; color: #949cf7; line-height: 1.6;
    }
    .info-box strong { color: #c3c6ff; }
    code { background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
    .footer { margin: 0; font-size: 12px; color: #5c5f66; }
    .loading { color: #faa61a; border-color: #faa61a; background: rgba(250,166,26,0.15); }
    .online  { color: #23a55a; border-color: #23a55a; background: rgba(35,165,90,0.15); }
    .offline { color: #ed4245; border-color: #ed4245; background: rgba(237,66,69,0.15); }
  </style>
</head>
<body>
  <div class="card">
    <div class="avatar">
      🤖
      <div class="dot" id="dot" style="background:#faa61a"></div>
    </div>
    <h1>Moderation Bot</h1>
    <p class="sub">Discord Moderation &amp; Staff Network Bot</p>

    <div class="badge loading" id="badge">
      <span class="badge-dot"></span>
      <span id="badge-text">Checking...</span>
    </div>

    <div class="grid">
      <div class="stat"><div class="stat-icon">🏠</div><div class="stat-value" id="guilds">—</div><div class="stat-label">Servers</div></div>
      <div class="stat"><div class="stat-icon">⏱️</div><div class="stat-value" id="uptime">—</div><div class="stat-label">Uptime</div></div>
      <div class="stat"><div class="stat-icon">⚡</div><div class="stat-value">35</div><div class="stat-label">Commands</div></div>
      <div class="stat"><div class="stat-icon">📡</div><div class="stat-value" id="ping">—</div><div class="stat-label">Ping</div></div>
    </div>

    <div class="section">
      <p class="section-title">Command Categories</p>
      <div class="tags">
        <span class="tag">Setup</span>
        <span class="tag">Warnings</span>
        <span class="tag">Ad Warns</span>
        <span class="tag">Moderation</span>
        <span class="tag">Strikes</span>
        <span class="tag">Jail</span>
        <span class="tag">Requests</span>
        <span class="tag">Utility</span>
      </div>
    </div>

    <div class="info-box">
      <strong>Keep alive with UptimeRobot:</strong><br>
      Point UptimeRobot at <code>/health</code> every 5 minutes to prevent sleeping.
    </div>

    <p class="footer" id="footer"></p>
  </div>

  <script>
    function fmt(s) {
      if (!s) return '—';
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
            m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
      if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
      if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
      if (m > 0) return m + 'm ' + sec + 's';
      return sec + 's';
    }
    async function fetchStatus() {
      try {
        const res = await fetch('/api/bot-status');
        const data = await res.json();
        const online = data.online && data.bot === 'online';
        const badge = document.getElementById('badge');
        badge.className = 'badge ' + (online ? 'online' : 'offline');
        document.getElementById('badge-text').textContent = online ? 'Online' : 'Offline';
        document.getElementById('dot').style.background = online ? '#23a55a' : '#ed4245';
        document.getElementById('guilds').textContent = (data.guilds ?? 0).toLocaleString();
        document.getElementById('uptime').textContent = fmt(data.uptime ?? 0);
        document.getElementById('ping').textContent = 'Active';
      } catch {
        const badge = document.getElementById('badge');
        badge.className = 'badge offline';
        document.getElementById('badge-text').textContent = 'Offline';
        document.getElementById('dot').style.background = '#ed4245';
      }
      document.getElementById('footer').textContent =
        'Last checked: ' + new Date().toLocaleTimeString() + ' · refreshes every 30s';
    }
    fetchStatus();
    setInterval(fetchStatus, 30000);
  </script>
</body>
</html>`;

router.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

router.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(STATUS_HTML);
});

export default router;
