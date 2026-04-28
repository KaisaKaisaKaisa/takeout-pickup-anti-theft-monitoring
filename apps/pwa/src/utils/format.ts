export function formatTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusTone(status?: string | null) {
  const raw = (status || "").toLowerCase();
  if (["critical", "open", "alerted", "offline", "failed"].includes(raw)) {
    return "danger";
  }
  if (["warning", "acknowledged", "generating", "delivered"].includes(raw)) {
    return "evidence";
  }
  if (["online", "ready", "resolved", "armed", "picked_up", "confirmed"].includes(raw)) {
    return "safe";
  }
  return "muted";
}

export function compactId(id: string) {
  if (id.length <= 12) {
    return id;
  }
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}
