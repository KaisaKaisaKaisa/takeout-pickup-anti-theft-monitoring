import { Boxes, Map, ScrollText, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";

interface TemplatesPageProps {
  snapshot: GuardSnapshot;
  onNavigate: (page: string) => void;
}

const templates = [
  {
    id: "campus-rack",
    title: "校园档口取餐架",
    scene: "campus",
    copy: "高峰期订单密集，按点位拓扑预置 6 个 ROI、重量阈值和超时取餐动作。",
    route: "orders",
    action: "导入订单",
  },
  {
    id: "residence-night",
    title: "公寓夜间暂存柜",
    scene: "night",
    copy: "深夜低照度场景启用视觉停留、重量骤降和设备离线兜底规则。",
    route: "rules",
    action: "配置规则",
  },
  {
    id: "enterprise-lobby",
    title: "企业大堂取餐点",
    scene: "enterprise",
    copy: "多商户混放时把默认规则、证据包生成和处置动作按楼层分组管理。",
    route: "devices",
    action: "校准设备",
  },
];

export function TemplatesPage({ snapshot, onNavigate }: TemplatesPageProps) {
  const enabledRules = snapshot.ruleMatches.filter((match) => !match.suppressed).length;
  const onlineDevices = snapshot.devices.filter((device) => device.status === "online").length;

  return (
    <section className="page-grid showcase-page eastern-workspace templates-page" id="templates">
      <div className="showcase-heading page-title">
        <span className="eyebrow">deployment kit</span>
        <h1>部署模板</h1>
        <p>模板不是展示卡片，而是值守前的部署预案：覆盖点位拓扑、传感器组合、默认规则和处置动作。</p>
      </div>

      <article className="panel template-deploy-board">
        <div className="panel-head">
          <div>
            <span className="eyebrow">template baseline</span>
            <h2>选择场景后直接进入订单导入、设备阈值和规则集配置</h2>
          </div>
          <StatusPill status="armed">ready</StatusPill>
        </div>
        <div className="workspace-status-grid">
          <MetricCard label="点位拓扑" value={snapshot.devices.length || 3} note="camera / weight / edge" />
          <MetricCard label="默认规则" value={enabledRules || 4} note="规则命中预案" tone="evidence" />
          <MetricCard label="在线节点" value={onlineDevices} note="设备心跳校验" tone="safe" />
          <MetricCard label="处置动作" value="4" note="确认 / 误报 / 取证 / 运维" tone="danger" />
        </div>
      </article>

      <div className="template-grid">
        {templates.map((template, index) => (
          <article className="template-card" key={template.id} data-evidence-target>
            <div className={`template-preview template-preview-${index + 1}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="template-body">
              <span className="eyebrow">{template.scene}</span>
              <h2>{template.title}</h2>
              <p>{template.copy}</p>
              <button type="button" onClick={() => onNavigate(template.route)}>
                {template.action}
              </button>
            </div>
          </article>
        ))}
      </div>

      <article className="panel template-runbook">
        <button type="button" onClick={() => onNavigate("devices")}>
          <Map size={18} />
          点位拓扑
        </button>
        <button type="button" onClick={() => onNavigate("devices")}>
          <SlidersHorizontal size={18} />
          传感器组合
        </button>
        <button type="button" onClick={() => onNavigate("rules")}>
          <ScrollText size={18} />
          默认规则
        </button>
        <button type="button" onClick={() => onNavigate("alerts")}>
          <ShieldCheck size={18} />
          处置动作
        </button>
        <button type="button" onClick={() => onNavigate("ops")}>
          <Boxes size={18} />
          运维检查
        </button>
      </article>
    </section>
  );
}
