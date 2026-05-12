import { useBotStatus } from "./hooks/useBotStatus";
import { Card } from "./components/Card";
import { StatCard } from "./components/StatCard";
import { StatusBadge } from "./components/StatusBadge";

function formatUptime(seconds: number) {
  if (!seconds) return "—";

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function App() {
  const { status, connected } = useBotStatus();

  const online = !!status?.online && status?.bot === "online";

  return (
    <div className="page">
      <Card>

        {/* HEADER */}
        <div className="header">
          <div className="avatar">🤖</div>

          <h1>Bot Status Dashboard</h1>
          <p>Enterprise Discord monitoring system</p>

          <StatusBadge online={online} connected={connected} />
        </div>

        {/* STATS */}
        <div className="grid">
          <StatCard icon="🏠" label="Servers" value={status?.guilds ?? 0} />
          <StatCard icon="⏱️" label="Uptime" value={formatUptime(status?.uptime ?? 0)} />
          <StatCard icon="📡" label="Connection" value={connected ? "Live WS" : "Offline"} />
          <StatCard icon="⚡" label="Status" value={status?.status ?? "—"} />
        </div>

        {/* SYSTEM PANEL */}
        <div className="panel">
          <strong>System Overview</strong>
          <ul>
            <li>WebSocket Live Updates</li>
            <li>Multi-Guild Monitoring</li>
            <li>Moderation Engine Active</li>
            <li>API Connected</li>
          </ul>
        </div>

        <div className="footer">
          Enterprise Dashboard • Real-time bot monitoring
        </div>

      </Card>
    </div>
  );
}