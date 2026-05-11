import { Router } from "express";

const router = Router();

const BOT_HEALTH_URL = "http://localhost:5000/health";

router.get("/bot-status", async (req, res) => {
  try {
    const upstream = await fetch(BOT_HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    const data = await upstream.json() as Record<string, unknown>;
    res.json({ online: true, ...data });
  } catch {
    res.json({ online: false, status: "offline", bot: "offline", guilds: 0, uptime: 0 });
  }
});

export default router;
