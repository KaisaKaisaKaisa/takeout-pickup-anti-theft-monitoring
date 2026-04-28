import { StatusPill } from "../components/StatusPill";
import type { GuardSnapshot } from "../types";
import { compactId, formatDateTime } from "../utils/format";

export function EvidencePage({ snapshot }: { snapshot: GuardSnapshot }) {
  return (
    <section className="page-grid eastern-workspace evidence-page" id="evidence">
      <div className="page-title">
        <span className="eyebrow">evidence package / manifest / hash</span>
        <h1>证据包</h1>
        <p>证据卡片强调可信性：时间戳、hash、事件链路、来源设备和 manifest 完整性状态。</p>
      </div>
      <div className="evidence-grid">
        {snapshot.evidence.map((bundle) => (
          <article className="evidence-card custody-card" key={bundle.id} data-evidence-target>
            <div className="panel-head">
              <div>
                <span className="mono">{compactId(bundle.id)}</span>
                <h3>证据包 manifest</h3>
              </div>
              <StatusPill status={bundle.status}>{bundle.status}</StatusPill>
            </div>
            <dl className="kv-grid">
              <div><dt>生成时间</dt><dd>{formatDateTime(bundle.generated_at)}</dd></div>
              <div><dt>媒体包</dt><dd>{bundle.zip_media_id || "等待生成"}</dd></div>
              <div><dt>hash</dt><dd className="mono">sha256:9b7c...a42f</dd></div>
              <div><dt>来源</dt><dd>edge camera + weight sensor</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
