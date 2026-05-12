export interface BotStatus {
  online: boolean;
  status: string;
  bot: string;
  guilds: number;
  uptime: number;
  timestamp?: string;
}

export async function fetchBotStatus(): Promise<BotStatus> {
  const res = await fetch("/api/bot-status");

  if (!res.ok) {
    throw new Error("Failed to fetch bot status");
  }

  return res.json();
}