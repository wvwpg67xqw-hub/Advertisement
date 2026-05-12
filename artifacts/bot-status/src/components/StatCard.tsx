export function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat">
      <div className="icon">{icon}</div>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}