import { lazy, Suspense, useState } from "react";
import { EvidenceVaultScene } from "../components/EvidenceVaultScene";
import { GuardAmbience, type GuardAmbienceTone } from "../components/GuardAmbience";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import type { GuardSnapshot } from "../types";
import { formatDateTime, formatTime } from "../utils/format";

const SensingField = lazy(() => import("../components/SensingField").then(({ SensingField }) => ({ default: SensingField })));

interface OverviewPageProps {
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

interface RiskWheelProps extends Pick<OverviewPageProps, "metrics" | "onNavigate"> {
  activeRisk: number;
  onActiveRiskChange: (index: number) => void;
}

function RiskWheel({ metrics, onNavigate, activeRisk, onActiveRiskChange }: RiskWheelProps) {
  const sectors = [
    { label: "盗取风险", value: metrics.openAlerts, tone: "danger" as const, page: "alerts", copy: "告警、重量骤降与物品消失复核", smoke: "橙红高光进入中心仪表，提示值班员优先研判。" },
    { label: "设备离线", value: metrics.offlineDevices, tone: "evidence" as const, page: "devices", copy: "边缘节点心跳、配置版本与在线状态", smoke: "粉紫棱镜带压低亮度，暴露离线节点和配置漂移。" },
    { label: "规则命中", value: metrics.ruleMatches, tone: "sensor" as const, page: "rules", copy: "DSL 策略命中、冷却与抑制记录", smoke: "青绿色扫描线凝固成策略轨迹，辅助复核规则噪声。" },
    { label: "证据完整", value: metrics.events24h, tone: "safe" as const, page: "evidence", copy: "媒体、事件、审计与导出链路", smoke: "白色玻璃环收束为封存态，确认取证链路可导出。" },
  ];
  const activeSector = sectors[activeRisk];

  return (
    <Card className="risk-wheel-panel">
      <CardHeader>
        <div>
          <span className="eyebrow">lightcore risk dial / shader lock</span>
          <h2>风险轮盘</h2>
        </div>
        <StatusPill status="armed">实时</StatusPill>
      </CardHeader>
      <CardContent className="risk-wheel-layout">
        <div className="risk-wheel" data-risk-tone={activeSector.tone} data-evidence-target>
          {sectors.map((sector, index) => (
            <button
              key={sector.label}
              type="button"
              className={`risk-sector risk-${sector.tone} sector-${index}${activeRisk === index ? " is-active" : ""}`}
              onPointerEnter={() => onActiveRiskChange(index)}
              onFocus={() => onActiveRiskChange(index)}
              onClick={() => onNavigate(sector.page)}
            >
              <span>{sector.label}</span>
              <strong>{sector.value}</strong>
            </button>
          ))}
          <div className="risk-smoke" aria-hidden="true" />
          <div className="risk-core">
            <span>Guard</span>
            <strong>ROI</strong>
          </div>
        </div>
        <div className="risk-copy">
          {sectors.map((sector) => (
            <button
              key={sector.label}
              type="button"
              className={activeSector.label === sector.label ? "risk-copy-active" : undefined}
              onMouseEnter={() => onActiveRiskChange(sectors.indexOf(sector))}
              onFocus={() => onActiveRiskChange(sectors.indexOf(sector))}
              onClick={() => onNavigate(sector.page)}
            >
              <strong>{sector.label}</strong>
              <span>{sector.copy}</span>
            </button>
          ))}
          <aside className={`risk-smoke-note risk-${activeSector.tone}`}>
            <strong>{activeSector.label} prism</strong>
            <span>{activeSector.smoke}</span>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function MonitoringChain({ onNavigate }: Pick<OverviewPageProps, "onNavigate">) {
  const steps = [
    { label: "订单导入", text: "配送平台或人工录入订单，生成取餐窗口。", page: "orders", plate: "import" },
    { label: "自动布防", text: "送达后创建防护会话，绑定摄像头和重量节点。", page: "sessions", plate: "arm" },
    { label: "边缘感知", text: "设备上传运动、重量和图像事件，进入实时流。", page: "devices", plate: "sense" },
    { label: "告警研判", text: "规则引擎识别盗取风险，推送给值班员处理。", page: "alerts", plate: "review" },
    { label: "证据归档", text: "事件、媒体、审计和报表形成可导出的取证包。", page: "evidence", plate: "archive" },
  ];

  return (
    <Card className="monitoring-chain">
      <CardHeader>
        <div>
          <span className="eyebrow">soft glass custody chain / horizontal proof</span>
          <h2>取证链路</h2>
        </div>
      </CardHeader>
      <CardContent className="chain-track">
        {steps.map((step, index) => (
          <button key={step.label} type="button" className="chain-step" onClick={() => onNavigate(step.page)} data-evidence-target>
            <img
              className={`chain-photo chain-photo-${step.plate}`}
              src={`/assets/custody-${step.plate}.png`}
              alt=""
              aria-hidden="true"
            />
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <small>{step.text} 玻璃底片留存取证状态。</small>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export function OverviewPage({ snapshot, metrics, onNavigate }: OverviewPageProps) {
  const [activeRisk, setActiveRisk] = useState(0);
  const ambienceTones: GuardAmbienceTone[] = ["danger", "evidence", "sensor", "safe"];

  return (
    <section className="page-grid overview-grid lightcore-console" id="overview">
      <div className="hero-panel">
        <GuardAmbience tone={ambienceTones[activeRisk]} />
        <div className="hero-copy">
          <span className="eyebrow">Lightcore Prism / soft glass guard console</span>
          <h1>外卖取餐防盗值守中枢</h1>
          <p>
            浅色棱镜背景、软玻璃控件和青绿色激活态把订单、边缘设备、告警和证据链路收进同一张实时控制台。
          </p>
          <div className="hero-actions">
            <Button type="button" variant="amber" onClick={() => onNavigate("orders")}>导入订单</Button>
            <Button type="button" variant="secondary" onClick={() => onNavigate("alerts")}>查看告警</Button>
            <Button type="button" variant="ghost" onClick={() => onNavigate("reports")}>导出报表</Button>
          </div>
        </div>
        <div className="hero-visual-stack">
          <EvidenceVaultScene />
          <Suspense fallback={<div className="sensing-field loading-radar">正在初始化边缘感知雷达</div>}>
            <SensingField />
          </Suspense>
        </div>
      </div>

      <div className="metric-strip">
        <MetricCard label="活跃会话" value={metrics.activeSessions} note="armed / alerted" />
        <MetricCard label="在线设备" value={`${metrics.onlineDevices}/${snapshot.devices.length}`} note={`${metrics.offlineDevices} 离线`} tone="safe" />
        <MetricCard label="未处理告警" value={metrics.openAlerts} note="等待确认" tone="danger" />
        <MetricCard label="24h 事件" value={metrics.events24h} note="传感器事件流" tone="evidence" />
      </div>

      <RiskWheel metrics={metrics} onNavigate={onNavigate} activeRisk={activeRisk} onActiveRiskChange={setActiveRisk} />

      <MonitoringChain onNavigate={onNavigate} />

      <article className="panel surface-map">
        <div className="panel-head">
          <div>
            <span className="eyebrow">takeout rack roi</span>
            <h2>取餐防护地图</h2>
          </div>
          <StatusPill status="armed">布防中</StatusPill>
        </div>
        <div className="rack-map" data-evidence-target>
          {snapshot.orders.slice(0, 6).map((order, index) => (
            <button key={order.id} className={`rack-cell cell-${index}`} type="button" onClick={() => onNavigate("orders")}>
              <span>{order.merchant_name || "取餐位"}</span>
              <strong>{order.status}</strong>
              <small>{formatTime(order.expected_pickup_by)}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="panel live-list">
        <div className="panel-head">
          <h2>最新订单队列</h2>
          <button type="button" onClick={() => onNavigate("orders")}>全部订单</button>
        </div>
        {snapshot.orders.slice(0, 4).map((order) => (
          <div className="data-row" key={order.id} data-evidence-target>
            <div>
              <strong>{order.merchant_name}</strong>
              <small>{order.item_summary}</small>
            </div>
            <span>{formatDateTime(order.expected_pickup_by)}</span>
            <StatusPill status={order.status}>{order.status}</StatusPill>
          </div>
        ))}
      </article>

      <article className="panel live-list">
        <div className="panel-head">
          <h2>告警处理队列</h2>
          <button type="button" onClick={() => onNavigate("alerts")}>进入告警</button>
        </div>
        {snapshot.alerts.slice(0, 4).map((alert) => (
          <div className="data-row" key={alert.id} data-danger-target={alert.level === "critical" ? "true" : undefined}>
            <div>
              <strong>{alert.summary || alert.alert_type}</strong>
              <small>{alert.alert_type} · {formatDateTime(alert.triggered_at)}</small>
            </div>
            <StatusPill status={alert.level}>{alert.level}</StatusPill>
            <StatusPill status={alert.status}>{alert.status}</StatusPill>
          </div>
        ))}
      </article>

      <article className="panel event-stream">
        <div className="panel-head">
          <h2>传感器事件流</h2>
          <span className="mono">{metrics.ruleMatches} matches</span>
        </div>
        {snapshot.ruleMatches.map((match) => (
          <div className="event-line" key={match.id}>
            <span className="event-dot" />
            <strong>{match.event_type}</strong>
            <small>{match.rule_name}</small>
            <code>{JSON.stringify(match.metrics)}</code>
          </div>
        ))}
      </article>
    </section>
  );
}
