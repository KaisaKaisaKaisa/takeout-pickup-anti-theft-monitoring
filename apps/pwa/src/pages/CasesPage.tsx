import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { formatDateTime } from "../utils/format";

interface CasesPageProps {
  snapshot: GuardSnapshot;
  onNavigate: (page: string) => void;
}

export function CasesPage({ snapshot, onNavigate }: CasesPageProps) {
  const cases = snapshot.alerts.slice(0, 3).map((alert, index) => ({
    id: alert.id,
    eyebrow: index === 0 ? "case console" : "case replay",
    title: alert.summary || alert.alert_type,
    copy: "送达布防、传感触发、规则命中、证据归档按同一条链路复盘，便于判断是否误报或升级处理。",
    meta: `${alert.alert_type} · ${formatDateTime(alert.triggered_at)}`,
    status: alert.status,
  }));
  const fallbackCases = [
    {
      id: "fallback-a",
      eyebrow: "case console",
      title: "夜间取餐架 A3 重量骤降",
      copy: "送达布防后出现重量骤降和 ROI 停留，规则命中后生成证据包。",
      meta: "weight_drop · 6 节点",
      status: "review",
    },
    {
      id: "fallback-b",
      eyebrow: "case replay",
      title: "午高峰遮挡异常复核",
      copy: "设备同步误触发片段，值班员按事件时间线回看后标记为已确认。",
      meta: "object_missing · 3 片段",
      status: "acknowledged",
    },
    {
      id: "fallback-c",
      eyebrow: "case archive",
      title: "多设备心跳断续",
      copy: "模板阈值偏低导致边缘节点反复离线，已转入运维规则调整。",
      meta: "device_offline · ops",
      status: "resolved",
    },
  ];
  const visibleCases = cases.length ? cases : fallbackCases;

  return (
    <section className="page-grid showcase-page eastern-workspace cases-page" id="cases">
      <div className="showcase-heading page-title">
        <span className="eyebrow">case console</span>
        <h1>案例复盘</h1>
        <p>把真实场景拆成告警来源、证据状态和处置动作，让每次规则命中都能回到业务判断。</p>
      </div>

      <div className="case-grid">
        {visibleCases.map((item) => (
          <article className="case-card" key={item.id} data-evidence-target>
            <span className="eyebrow">{item.eyebrow}</span>
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
            <div className="case-card-footer">
              <small>{item.meta}</small>
              <StatusPill status={item.status}>{item.status}</StatusPill>
            </div>
          </article>
        ))}
      </div>

      <article className="panel review-path">
        <h2>复盘链路</h2>
        {["送达布防", "传感触发", "规则命中", "证据归档"].map((step, index) => (
          <button key={step} type="button" onClick={() => onNavigate(index < 2 ? "orders" : "evidence")}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </button>
        ))}
      </article>
    </section>
  );
}
