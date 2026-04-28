import { StatusPill } from "../components/StatusPill";
import { guardApi } from "../lib/api";
import type { Alert, GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

interface AlertsPageProps {
  snapshot: GuardSnapshot;
  refresh: () => void;
}

async function runAlertAction(action: () => Promise<unknown>, refresh: () => void) {
  await action();
  refresh();
}

export function AlertsPage({ snapshot, refresh }: AlertsPageProps) {
  const renderAlert = (alert: Alert) => (
    <article className="record-card alert-card" key={alert.id} data-danger-target={alert.level === "critical" ? "true" : undefined}>
      <div className="record-main">
        <span className="mono">{compactId(alert.id)}</span>
        <h3>{alert.summary || alert.alert_type}</h3>
        <p>{alert.alert_type} · 订单 {compactId(alert.order_id)} · {formatDateTime(alert.triggered_at)}</p>
      </div>
      <div className="record-meta">
        <StatusPill status={alert.level}>{alert.level}</StatusPill>
        <StatusPill status={alert.status}>{alert.status}</StatusPill>
      </div>
      <div className="record-actions">
        <button type="button" onClick={() => runAlertAction(() => guardApi.acknowledgeAlert(alert.id), refresh)}>acknowledge</button>
        <button type="button" className="secondary" onClick={() => runAlertAction(() => guardApi.resolveAlert(alert.id), refresh)}>resolve</button>
        <button type="button" className="secondary" onClick={() => runAlertAction(() => guardApi.falsePositiveAlert(alert.id), refresh)}>false positive</button>
      </div>
    </article>
  );

  return (
    <section className="page-grid eastern-workspace alerts-page" id="alerts">
      <div className="page-title">
        <span className="eyebrow">incident response</span>
        <h1>告警处理</h1>
        <p>按级别、状态、时间、规则和设备扫描异常；详情区域展示触发事件、证据入口和处理操作。</p>
      </div>
      <div className="filter-strip panel">
        <select defaultValue="all"><option value="all">全部级别</option><option>critical</option><option>warning</option></select>
        <select defaultValue="open"><option>open</option><option>acknowledged</option><option>resolved</option></select>
        <input placeholder="搜索规则 / 订单 / 设备" />
      </div>
      <div className="record-list">{snapshot.alerts.map(renderAlert)}</div>
    </section>
  );
}
