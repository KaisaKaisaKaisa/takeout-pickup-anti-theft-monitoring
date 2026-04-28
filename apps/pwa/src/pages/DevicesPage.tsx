import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

export function DevicesPage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace devices-page" id="devices">
      <div className="page-title">
        <span className="eyebrow">edge devices</span>
        <h1>边缘设备运维面板</h1>
        <p>像真实运维面板一样展示在线状态、最近心跳、配置版本、ROI 和队列健康。</p>
      </div>
      <div className="device-grid">
        {snapshot.devices.map((device) => (
          <article className="device-card" key={device.id} data-evidence-target>
            <div className="panel-head">
              <div>
                <span className="mono">{compactId(device.id)}</span>
                <h3>{device.name}</h3>
              </div>
              <StatusPill status={device.status}>{device.status}</StatusPill>
            </div>
            <dl className="kv-grid">
              <div><dt>类型</dt><dd>{device.device_type}</dd></div>
              <div><dt>设备码</dt><dd>{device.device_code || "-"}</dd></div>
              <div><dt>最近心跳</dt><dd>{formatDateTime(device.last_seen_at)}</dd></div>
              <div><dt>配置</dt><dd>{JSON.stringify(device.config || {})}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
