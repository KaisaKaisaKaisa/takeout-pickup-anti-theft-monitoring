import { Activity, FileArchive, RadioTower, Waves } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

interface PlaybackPageProps {
  snapshot: GuardSnapshot;
  onNavigate: (page: string) => void;
}

const fallbackTimeline = [
  { id: "armed", label: "送达布防", detail: "订单进入取餐架 ROI", time: "00:00", status: "armed" },
  { id: "sensor", label: "传感触发", detail: "重量曲线出现骤降", time: "00:17", status: "warning" },
  { id: "rule", label: "规则命中", detail: "vision_stop + weight_drop", time: "00:21", status: "critical" },
  { id: "archive", label: "证据归档", detail: "生成证据包 manifest", time: "00:42", status: "resolved" },
];

const waveform = [36, 42, 30, 56, 78, 44, 62, 86, 52, 40, 68, 34, 58, 74, 46, 64];

export function PlaybackPage({ snapshot, onNavigate }: PlaybackPageProps) {
  const timeline = snapshot.alerts.slice(0, 4).map((alert, index) => ({
    id: alert.id,
    label: index === 0 ? "规则命中" : "事件时间线",
    detail: alert.summary || `${alert.alert_type} 触发复核`,
    time: formatDateTime(alert.triggered_at),
    status: alert.level || alert.status,
  }));
  const visibleTimeline = timeline.length ? timeline : fallbackTimeline;
  const latestEvidence = snapshot.evidence[0];

  return (
    <section className="page-grid showcase-page eastern-workspace playback-page" id="playback">
      <div className="showcase-heading page-title">
        <span className="eyebrow">sensor playback</span>
        <h1>感知回放</h1>
        <p>动效只表达监控语义：事件时间线、传感波形和证据轨迹，帮助值班员判断误报和取证状态。</p>
      </div>

      <article className="panel sensor-playback-board">
        <div className="panel-head">
          <div>
            <span className="eyebrow">event replay</span>
            <h2>从传感触发到证据归档的一次完整回看</h2>
          </div>
          <StatusPill status={snapshot.alerts.length ? "warning" : "resolved"}>PLAYBACK</StatusPill>
        </div>
        <div className="workspace-status-grid playback-stats">
          <span><Activity size={18} /><b>motion</b> 动作评分</span>
          <span><Waves size={18} /><b>weight</b> 传感波形</span>
          <span><FileArchive size={18} /><b>clip</b> 证据片段</span>
        </div>
      </article>

      <div className="playback-grid">
        <article className="panel event-timeline">
          <div className="panel-head">
            <h2>事件时间线</h2>
            <button type="button" onClick={() => onNavigate("alerts")}>进入告警</button>
          </div>
          {visibleTimeline.map((item, index) => (
            <button className="timeline-replay-step" type="button" key={item.id} onClick={() => onNavigate(index > 1 ? "evidence" : "alerts")}>
              <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.label}</strong>
              <small>{item.time}</small>
              <p>{item.detail}</p>
              <StatusPill status={item.status}>{item.status}</StatusPill>
            </button>
          ))}
        </article>

        <article className="panel waveform-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">sensor waveform</span>
              <h2>传感波形</h2>
            </div>
            <RadioTower size={20} />
          </div>
          <div className="waveform" aria-label="传感波形">
            {waveform.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="waveform-legend">
            <small>baseline</small>
            <small>drop</small>
            <small>recover</small>
          </div>
        </article>

        <article className="panel evidence-track">
          <span className="eyebrow">evidence trajectory</span>
          <h2>证据轨迹</h2>
          <p>
            {latestEvidence
              ? `证据包 ${compactId(latestEvidence.id)} 当前状态为 ${latestEvidence.status}，可转入证据页继续校验 hash 与 manifest。`
              : "暂无真实证据包时展示默认轨迹，接入告警后会串联媒体片段、证据包和处置记录。"}
          </p>
          <div className="evidence-rail" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <button type="button" onClick={() => onNavigate("evidence")}>查看证据归档</button>
        </article>
      </div>
    </section>
  );
}
