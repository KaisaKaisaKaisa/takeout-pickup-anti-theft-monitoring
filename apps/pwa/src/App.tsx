import { lazy, Suspense, type ReactNode, useEffect, useState } from "react";
import gsap from "gsap";
import { EvidenceCursor } from "./components/EvidenceCursor";
import { Shell } from "./components/Shell";
import { useGuardStore } from "./state/guard-store";
import type { PageId } from "./types";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then(({ OverviewPage }) => ({ default: OverviewPage })));
const ConsolePage = lazy(() => import("./pages/ConsolePage").then(({ ConsolePage }) => ({ default: ConsolePage })));
const CasesPage = lazy(() => import("./pages/CasesPage").then(({ CasesPage }) => ({ default: CasesPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then(({ TemplatesPage }) => ({ default: TemplatesPage })));
const PlaybackPage = lazy(() => import("./pages/PlaybackPage").then(({ PlaybackPage }) => ({ default: PlaybackPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then(({ OrdersPage }) => ({ default: OrdersPage })));
const SessionsPage = lazy(() => import("./pages/SessionsPage").then(({ SessionsPage }) => ({ default: SessionsPage })));
const AlertsPage = lazy(() => import("./pages/AlertsPage").then(({ AlertsPage }) => ({ default: AlertsPage })));
const DevicesPage = lazy(() => import("./pages/DevicesPage").then(({ DevicesPage }) => ({ default: DevicesPage })));
const RulesPage = lazy(() => import("./pages/RulesPage").then(({ RulesPage }) => ({ default: RulesPage })));
const EvidencePage = lazy(() => import("./pages/EvidencePage").then(({ EvidencePage }) => ({ default: EvidencePage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then(({ ReportsPage }) => ({ default: ReportsPage })));
const OpsPage = lazy(() => import("./pages/OpsPage").then(({ OpsPage }) => ({ default: OpsPage })));
const GatePage = lazy(() => import("./pages/GatePage").then(({ GatePage }) => ({ default: GatePage })));
const PickupPage = lazy(() => import("./pages/PickupPage").then(({ PickupPage }) => ({ default: PickupPage })));

function App() {
  const [activePage, setActivePage] = useState<PageId>("overview");
  const { snapshot, metrics, loading, error, wsStatus, refresh } = useGuardStore();
  const standalonePath = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      return;
    }
    const targets = gsap.utils.toArray(".page-title, .panel, .record-card, .metric-card, .hero-panel");
    if (!targets.length) {
      return;
    }
    gsap.fromTo(
      targets,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.42, stagger: 0.035, ease: "power2.out" },
    );
  }, [activePage, loading]);

  const navigate = (page: string) => setActivePage(page as PageId);

  const pageMap: Record<PageId, ReactNode> = {
    overview: <OverviewPage snapshot={snapshot} metrics={metrics} onNavigate={navigate} />,
    console: <ConsolePage snapshot={snapshot} metrics={metrics} onNavigate={navigate} />,
    cases: <CasesPage snapshot={snapshot} onNavigate={navigate} />,
    templates: <TemplatesPage snapshot={snapshot} onNavigate={navigate} />,
    playback: <PlaybackPage snapshot={snapshot} onNavigate={navigate} />,
    orders: <OrdersPage snapshot={snapshot} refresh={refresh} />,
    sessions: <SessionsPage snapshot={snapshot} />,
    alerts: <AlertsPage snapshot={snapshot} refresh={refresh} />,
    devices: <DevicesPage snapshot={snapshot} />,
    rules: <RulesPage snapshot={snapshot} />,
    evidence: <EvidencePage snapshot={snapshot} />,
    reports: <ReportsPage snapshot={snapshot} />,
    ops: <OpsPage snapshot={snapshot} />,
  };

  if (standalonePath === "/gate" || standalonePath === "/pickup") {
    return (
      <Suspense fallback={<div className="mobile-prism-shell"><div className="loading-banner">正在加载取餐核验页</div></div>}>
        {standalonePath === "/gate" ? <GatePage /> : <PickupPage orders={snapshot.orders} />}
      </Suspense>
    );
  }

  return (
    <>
      <EvidenceCursor />
      <Shell activePage={activePage} onPageChange={setActivePage} wsStatus={wsStatus} loading={loading} onRefresh={refresh}>
        {error ? <div className="error-banner">{error}</div> : null}
        {loading ? (
          <div className="loading-banner">正在同步订单、设备、告警与规则命中</div>
        ) : (
          <Suspense fallback={<div className="loading-banner">正在加载工作台视图</div>}>{pageMap[activePage]}</Suspense>
        )}
      </Shell>
    </>
  );
}

export default App;
