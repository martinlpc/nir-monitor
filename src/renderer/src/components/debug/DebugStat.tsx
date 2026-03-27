export default function DebugStat({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

