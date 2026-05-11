import { useEffect, useState } from "react";

interface BotStatus {
  online: boolean;
  status: string;
  bot: string;
  guilds: number;
  uptime: number;
  timestamp?: string;
}

function formatUptime(seconds: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/bot-status`);
      const data: BotStatus = await res.json();
      setStatus(data);
    } catch {
      setStatus({ online: false, status: "offline", bot: "offline", guilds: 0, uptime: 0 });
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = status?.online && status?.bot === "online";

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff", padding: "24px" }}>
      {/* Discord-style card */}
      <div style={{ background: "#2d2d44", borderRadius: "16px", padding: "48px 40px", maxWidth: "480px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", textAlign: "center" }}>

        {/* Bot avatar / icon */}
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#5865F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: "36px", position: "relative" }}>
          🤖
          {/* Status indicator dot */}
          <div style={{
            position: "absolute", bottom: "4px", right: "4px",
            width: "20px", height: "20px", borderRadius: "50%",
            background: loading ? "#faa61a" : isOnline ? "#23a55a" : "#ed4245",
            border: "3px solid #2d2d44",
          }} />
        </div>

        <h1 style={{ margin: "0 0 6px", fontSize: "24px", fontWeight: 700, color: "#fff" }}>
          Moderation Bot
        </h1>
        <p style={{ margin: "0 0 32px", color: "#8e9197", fontSize: "14px" }}>
          Discord Moderation &amp; Staff Network Bot
        </p>

        {/* Status badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          background: loading ? "rgba(250,166,26,0.15)" : isOnline ? "rgba(35,165,90,0.15)" : "rgba(237,66,69,0.15)",
          border: `1px solid ${loading ? "#faa61a" : isOnline ? "#23a55a" : "#ed4245"}`,
          borderRadius: "20px", padding: "6px 16px", marginBottom: "32px",
          fontSize: "14px", fontWeight: 600,
          color: loading ? "#faa61a" : isOnline ? "#23a55a" : "#ed4245",
        }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
          {loading ? "Checking..." : isOnline ? "Online" : "Offline"}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
          {[
            { label: "Servers", value: loading ? "—" : (status?.guilds ?? 0).toLocaleString(), icon: "🏠" },
            { label: "Uptime", value: loading ? "—" : formatUptime(status?.uptime ?? 0), icon: "⏱️" },
            { label: "Commands", value: "35", icon: "⚡" },
            { label: "Ping", value: lastChecked ? "Active" : "—", icon: "📡" },
          ].map(stat => (
            <div key={stat.label} style={{
              background: "#23233a", borderRadius: "10px", padding: "16px 12px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{stat.icon}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "2px" }}>{stat.value}</div>
              <div style={{ fontSize: "12px", color: "#8e9197" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Commands section */}
        <div style={{ background: "#23233a", borderRadius: "10px", padding: "16px", marginBottom: "24px", textAlign: "left", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 600, color: "#8e9197", textTransform: "uppercase", letterSpacing: "0.08em" }}>Command Categories</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {["Setup", "Warnings", "Ad Warns", "Moderation", "Strikes", "Jail", "Requests", "Utility"].map(cat => (
              <span key={cat} style={{
                background: "rgba(88,101,242,0.2)", border: "1px solid rgba(88,101,242,0.4)",
                borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: "#949cf7",
              }}>{cat}</span>
            ))}
          </div>
        </div>

        {/* Uptime Robot notice */}
        <div style={{ background: "rgba(88,101,242,0.1)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(88,101,242,0.2)", textAlign: "left", marginBottom: "20px" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#949cf7", lineHeight: 1.6 }}>
            <strong style={{ color: "#c3c6ff" }}>Keep alive with UptimeRobot:</strong><br />
            Point UptimeRobot at <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: "4px", fontSize: "11px" }}>/health</code> every 5 minutes to prevent sleeping.
          </p>
        </div>

        {/* Last checked */}
        {lastChecked && (
          <p style={{ margin: 0, fontSize: "12px", color: "#5c5f66" }}>
            Last checked: {lastChecked.toLocaleTimeString()} · refreshes every 30s
          </p>
        )}
      </div>
    </div>
  );
}
