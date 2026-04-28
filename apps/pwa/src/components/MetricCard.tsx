interface MetricCardProps {
  label: string;
  value: string | number;
  note: string;
  tone?: "sensor" | "danger" | "evidence" | "safe";
}

export function MetricCard({ label, value, note, tone = "sensor" }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`} data-evidence-target>
      <i className="metric-dial" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
