import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

interface ConsolePageProps {
  snapshot: GuardSnapshot;
  metrics: {
    activeSessions: number;
    onlineDevices: number;
    offlineDevices: number;
    openAlerts: number;
    events24h: number;
    ruleMatches: number;
  };
  onNavigate: (page: string) => void;
}

export function ConsolePage({ snapshot, metrics, onNavigate }: ConsolePageProps) {
  const latestAlert = snapshot.alerts[0];
  const latestOrder = snapshot.orders[0];

  return (
    <section className="page-grid showcase-page console-page" id="console">
      <div className="showcase-heading">
        <span className="eyebrow">command console</span>
        <h1>值守控制台</h1>
        <p>当前班次把订单布防、设备心跳、告警矩阵和证据状态放在同一张操作面板内，避免值班员在多个页面间切换。</p>
      </div>

      <article className="panel command-board">
        <div className="panel-head">
          <div>
            <span className="eyebrow">live desk</span>
            <h2>当前班次：订单布防、设备心跳、告警矩阵持续在线</h2>
          </div>
          <StatusPill status={metrics.openAlerts ? "warning" : "online"}>{metrics.openAlerts ? "review" : "armed"}</StatusPill>
        </div>
        <div className="workspace-status-grid">
          <MetricCard label="活跃订单" value={snapshot.orders.length} note="最新监控会话" />
          <MetricCard label="最新告警" value={metrics.openAlerts} note="待确认事件" tone={metrics.openAlerts ? "danger" : "safe"} />
          <MetricCard label="在线设备" value={metrics.onlineDevices} note={`${metrics.offlineDevices} 离线节点`} tone="safe" />
          <MetricCard label="规则命中" value={metrics.ruleMatches} note="自动复核记录" tone="evidence" />
        </div>
      </article>

      <article className="panel console-split">
        <div>
          <span className="eyebrow">dispatch lane</span>
          <h2>{latestOrder?.merchant_name || "等待订单导入"}</h2>
          <p>{latestOrder?.item_summary || "导入订单后会在这里进入布防队列，并同步设备与规则状态。"}</p>
          <small>{latestOrder ? `截止 ${formatDateTime(latestOrder.expected_pickup_by)}` : "无当前订单"}</small>
        </div>
        <div className="console-actions">
          <button type="button" onClick={() => onNavigate("orders")}>导入订单</button>
          <button type="button" className="secondary" onClick={() => onNavigate("alerts")}>查看最新告警</button>
          <button type="button" className="secondary" onClick={() => onNavigate("ops")}>进入运维工作台</button>
        </div>
      </article>

      <article className="panel signal-board">
        <span className="eyebrow">incident matrix</span>
        <h2>{latestAlert?.summary || "暂无待处置告警"}</h2>
        <p>
          {latestAlert
            ? `${latestAlert.alert_type} · ${latestAlert.level} · ${compactId(latestAlert.order_id)}`
            : "当前班次未出现新的规则命中，设备状态仍会持续进入实时事件流。"}
        </p>
        <div className="signal-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>
    </section>
  );
}
