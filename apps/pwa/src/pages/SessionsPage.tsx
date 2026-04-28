import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

export function SessionsPage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace sessions-page" id="sessions">
      <div className="page-title">
        <span className="eyebrow">monitoring sessions</span>
        <h1>防护会话</h1>
        <p>每个会话把订单、设备、布防时间、取餐截止、presence 状态和灵敏度配置串起来。</p>
      </div>
      <div className="record-list">
        {snapshot.sessions.map((session) => (
          <article className="record-card" key={session.id} data-evidence-target>
            <div className="record-main">
              <span className="mono">{compactId(session.id)}</span>
              <h3>{compactId(session.order_id)}</h3>
              <p>设备 {compactId(session.device_id)} · presence {session.presence_status}</p>
            </div>
            <div className="record-meta">
              <StatusPill status={session.state}>{session.state}</StatusPill>
              <span>布防 {formatDateTime(session.armed_at)}</span>
              <span>截止 {formatDateTime(session.pickup_deadline_at)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
