import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { formatDateTime } from "../utils/format";

export function RulesPage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace rules-page" id="rules">
      <div className="page-title">
        <span className="eyebrow">rule dsl / priority / cooldown</span>
        <h1>规则引擎</h1>
        <p>规则集、优先级、事件类型、条件 DSL、action 和 cooldown 拆开呈现；保留 validate、preview、保存、禁用、复制的操作位。</p>
      </div>
      <div className="rules-board">
        <article className="panel dsl-editor rule-lacquer-board" data-evidence-target>
          <h2>DSL 条件编辑器</h2>
          <div className="condition-builder">
            <span>当</span>
            <select><option>weight_delta</option><option>motion_score</option><option>object_missing</option></select>
            <select><option>lt</option><option>gte</option><option>eq</option></select>
            <input defaultValue="-300" />
            <span>执行</span>
            <select><option>alert</option><option>evidence</option><option>ignore</option></select>
          </div>
          <div className="record-actions">
            <button type="button">validate</button>
            <button type="button" className="secondary">preview</button>
            <button type="button" className="secondary">保存</button>
            <button type="button" className="secondary">复制规则</button>
          </div>
        </article>
        <article className="panel live-list rule-hit-board">
          <h2>规则命中</h2>
          {snapshot.ruleMatches.map((match) => (
            <div className="data-row" key={match.id}>
              <div>
                <strong>{match.rule_name}</strong>
                <small>{match.event_type} · {formatDateTime(match.matched_at)}</small>
              </div>
              <StatusPill status={match.suppressed ? "warning" : "ready"}>{match.suppressed ? "suppressed" : match.action}</StatusPill>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
