export function StatusBadge({
  online,
  connected,
}: {
  online: boolean;
  connected: boolean;
}) {
  const color = !connected
    ? "#faa61a"
    : online
      ? "#23a55a"
      : "#ed4245";

  const text = !connected
    ? "Reconnecting"
    : online
      ? "Online"
      : "Offline";

  return (
    <div className="badge" style={{ borderColor: color, color }}>
      <span className="dot" />
      {text}
    </div>
  );
}