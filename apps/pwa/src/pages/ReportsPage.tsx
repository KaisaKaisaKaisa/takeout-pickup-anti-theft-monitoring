import type { GuardSnapshot } from "../types";
import { guardApi } from "../lib/api";

function TrendBars({ data }: { data?: Array<Record<string, unknown>> }) {
  const values = (data || []).map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  return (
    <div className="trend-bars">
      {(data || []).map((item, index) => (
        <span key={`${item.label}-${index}`} style={{ height: `${(Number(item.value || 0) / max) * 100}%` }}>
          <small>{String(item.label || index + 1)}</small>
        </span>
      ))}
    </div>
  );
}

export function ReportsPage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace reports-page" id="reports">
      <div className="page-title">
        <span className="eyebrow">summary / trends / csv</span>
        <h1>报表与趋势</h1>
        <p>订单、告警、设备、会话、事件和规则命中使用克制图表呈现，导出接口对齐后端 text/csv 契约。</p>
      </div>
      <div className="metric-strip report-export-strip">
        <button type="button" className="download-card" onClick={guardApi.exportSummary}>导出摘要 CSV</button>
        <button type="button" className="download-card" onClick={guardApi.exportTrends}>导出趋势 CSV</button>
        <button type="button" className="download-card" onClick={guardApi.exportRuleMatches}>导出规则命中 CSV</button>
      </div>
      <div className="report-grid">
        <article className="panel trend-panel"><h2>订单趋势</h2><TrendBars data={snapshot.trends.orders} /></article>
        <article className="panel trend-panel"><h2>告警趋势</h2><TrendBars data={snapshot.trends.alerts} /></article>
        <article className="panel trend-panel"><h2>事件趋势</h2><TrendBars data={snapshot.trends.events} /></article>
        <article className="panel trend-panel"><h2>规则命中</h2><TrendBars data={snapshot.trends.rule_matches} /></article>
      </div>
    </section>
  );
}
