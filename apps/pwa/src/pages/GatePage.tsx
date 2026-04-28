import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LockKeyhole, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { guardApi } from "../lib/api";
import type { GateVerification, GateVerifyResult } from "../types";

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase();
}

export function GatePage() {
  const [code, setCode] = useState("");
  const [gateName, setGateName] = useState("桂航围栏取餐入口");
  const [result, setResult] = useState<GateVerifyResult | null>(null);
  const [recent, setRecent] = useState<GateVerification[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => normalizeCode(code).length >= 4 && !loading, [code, loading]);

  async function loadRecent() {
    try {
      const payload = await guardApi.recentGateVerifications();
      setRecent(payload.verifications || []);
    } catch {
      setRecent([]);
    }
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function verifyCode() {
    const normalized = normalizeCode(code);
    if (!normalized) {
      return;
    }
    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const payload = await guardApi.verifyGateCode({ code: normalized, gate_name: gateName });
      setResult(payload);
      setCode("");
      await loadRecent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "核验失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mobile-prism-shell gate-mobile-page">
      <section className="mobile-hero glass-panel">
        <div className="prism-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <span className="mobile-eyebrow">FENCED PICKUP ACCESS</span>
          <h1>入口取餐码核验</h1>
          <p>工作人员扫码或输入学生取餐码，通过后放行进入围栏取餐区。</p>
        </div>
      </section>

      <section className="gate-console glass-panel">
        <label className="field-label" htmlFor="gate-name">入口点位</label>
        <input
          id="gate-name"
          className="prism-input"
          value={gateName}
          onChange={(event) => setGateName(event.target.value)}
          placeholder="例如：北校区东门取餐点"
        />
        <label className="field-label" htmlFor="pickup-code">取餐码</label>
        <div className="code-entry">
          <input
            id="pickup-code"
            className="code-input"
            inputMode="text"
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) {
                verifyCode();
              }
            }}
            placeholder="输入或扫码"
          />
          <ScanLine size={28} />
        </div>
        <button className="prism-primary gate-submit" disabled={!canSubmit} onClick={verifyCode}>
          {loading ? "核验中" : "核验并放行"}
        </button>
        {message ? <div className="gate-message error">{message}</div> : null}
        {result ? (
          <div className="gate-result">
            <CheckCircle2 size={30} />
            <div>
              <strong>允许进入</strong>
              <span>{result.merchant_name || "外卖订单"} · {result.item_summary || "待取餐"}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mobile-grid">
        <article className="mini-orb-card">
          <ShieldCheck size={26} />
          <strong>一次性</strong>
          <span>核验后自动失效</span>
        </article>
        <article className="mini-orb-card">
          <LockKeyhole size={26} />
          <strong>留痕</strong>
          <span>记录入口与时间</span>
        </article>
      </section>

      <section className="recent-panel glass-panel">
        <h2>最近放行</h2>
        <div className="recent-list">
          {recent.length ? recent.map((item) => (
            <div className="recent-row" key={`${item.order_id}-${item.confirmed_at}`}>
              <span>{item.merchant_name || "外卖订单"}</span>
              <strong>{new Date(item.confirmed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
            </div>
          )) : <p className="empty-note">暂无核验记录</p>}
        </div>
      </section>
    </main>
  );
}
