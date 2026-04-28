import { statusTone } from "../utils/format";

interface StatusPillProps {
  children: React.ReactNode;
  status?: string | null;
}

export function StatusPill({ children, status }: StatusPillProps) {
  return <span className={`status-pill tone-${statusTone(status || String(children))}`}>{children}</span>;
}
