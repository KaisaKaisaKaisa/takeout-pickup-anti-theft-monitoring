import type { GuardSnapshot } from "../types";

export function OpsPage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace ops-page" id="ops">
      <div className="page-title">
        <span className="eyebrow">readiness / audit / topology</span>
        <h1>运维与系统状态</h1>
        <p>生产拓扑明确为 API 处理请求与 WebSocket，worker 负责后台循环；这里集中健康检查、审计和配置入口。</p>
      </div>
      <div className="ops-grid">
        {[
          ["API", "ready", "FastAPI 请求与 WebSocket"],
          ["worker", "active", "后台循环独立运行"],
          ["Redis", "observed", "async cache + fallback log"],
          ["MinIO", "ready", "证据对象存储与签名 URL"],
        ].map(([label, status, note]) => (
          <article className="ops-card" key={label}>
            <span>{label}</span>
            <strong>{status}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <article className="panel">
        <h2>当前拓扑摘要</h2>
        <p>订单 {snapshot.orders.length} 个，设备 {snapshot.devices.length} 个，告警 {snapshot.alerts.length} 个，会话 {snapshot.sessions.length} 个。</p>
      </article>
    </section>
  );
}
