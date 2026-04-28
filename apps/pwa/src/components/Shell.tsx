import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  BookOpen,
  Brackets,
  ClipboardList,
  Cpu,
  FileArchive,
  Gauge,
  LayoutTemplate,
  PlayCircle,
  RadioTower,
  RefreshCw,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { PageId } from "../types";

export const navItems: Array<{ id: PageId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "overview", label: "概览", icon: Gauge },
  { id: "console", label: "控制台", icon: ShieldCheck },
  { id: "cases", label: "案例", icon: BookOpen },
  { id: "templates", label: "模板", icon: LayoutTemplate },
  { id: "playback", label: "动效", icon: PlayCircle },
  { id: "orders", label: "订单", icon: ClipboardList },
  { id: "sessions", label: "防护会话", icon: RadioTower },
  { id: "alerts", label: "告警", icon: Bell },
  { id: "devices", label: "设备", icon: Cpu },
  { id: "rules", label: "规则", icon: ScrollText },
  { id: "evidence", label: "证据", icon: FileArchive },
  { id: "reports", label: "报表", icon: BarChart3 },
  { id: "ops", label: "运维", icon: Boxes },
];

interface ShellProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  wsStatus: string;
  loading: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}

export function Shell({ activePage, onPageChange, wsStatus, loading, onRefresh, children }: ShellProps) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeButton = navRef.current?.querySelector("button.is-active");
    activeButton?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activePage]);

  return (
    <div className="app-shell lightcore-prism-shell">
      <header className="brand-command" aria-label="外卖防盗监控主导航">
        <div className="brand-lockup">
          <span className="brand-mark" aria-label="Takeout Guard 棱镜标识">
            <span className="brand-prism" aria-hidden="true" />
            <span className="brand-code">TG</span>
          </span>
          <div>
            <strong>外卖防盗监控</strong>
            <small>Lightcore Prism · 值守中枢</small>
          </div>
        </div>
        <span className="guard-online">
          <span className={`connection-dot ${wsStatus}`} />
          值守链路在线
        </span>
        <nav ref={navRef}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={activePage === item.id ? "is-active" : ""}
                onClick={() => onPageChange(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="brand-actions">
          <button type="button" className="secondary doc-button" onClick={() => onPageChange("reports")}>
            <Brackets size={16} />
            文档
          </button>
          <button type="button" className="primary-guard" onClick={() => onPageChange("orders")}>
            启动防护
          </button>
        </div>
      </header>

      <div className="workspace-frame">
        <header className="top-status">
          <div className="system-state">
            <Activity size={18} />
            <span>系统在线</span>
            <span className={`connection-dot ${wsStatus}`} />
            <small>WebSocket: {wsStatus}</small>
          </div>
          <div className="top-actions">
            <span className="task-badge">
              <AlertTriangle size={15} />
              后台任务：worker 拓扑
            </span>
            <button type="button" className="icon-button" onClick={onRefresh} disabled={loading} aria-label="刷新数据">
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main">
          {children}
        </main>
      </div>
    </div>
  );
}
