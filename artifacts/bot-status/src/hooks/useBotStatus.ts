import { useEffect, useState } from "react";
import { BotStatus, fetchBotStatus } from "../api/bot";

export function useBotStatus() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;

    async function init() {
      try {
        const data = await fetchBotStatus();
        setStatus(data);
      } catch {
        setStatus({
          online: false,
          status: "offline",
          bot: "offline",
          guilds: 0,
          uptime: 0,
        });
      }

      ws = new WebSocket("wss://your-domain/ws");

      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);

      ws.onmessage = (event) => {
        try {
          setStatus(JSON.parse(event.data));
        } catch {}
      };
    }

    init();
    return () => ws?.close();
  }, []);

  return { status, connected };
}