import { useMemo, useState } from "react";
import { KeyRound, PackageCheck, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { guardApi } from "../lib/api";
import type { Order, PickupCode } from "../types";

export function PickupPage({ orders }: { orders: Order[] }) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [pickupCode, setPickupCode] = useState<PickupCode | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const eligibleOrders = useMemo(
    () => orders.filter((order) => order.status !== "picked_up"),
    [orders],
  );
  const activeOrder = eligibleOrders.find((order) => order.id === selectedOrderId) || eligibleOrders[0] || null;

  async function issueCode() {
    const order = activeOrder;
    if (!order) {
      setMessage("暂无可取餐订单");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const payload = await guardApi.issuePickupCode(order.id);
      setPickupCode(payload);
      setSelectedOrderId(order.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成取餐码失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mobile-prism-shell pickup-mobile-page">
      <section className="mobile-hero glass-panel">
        <div className="prism-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <span className="mobile-eyebrow">STUDENT PICKUP PASS</span>
          <h1>我的围栏取餐码</h1>
          <p>到入口向工作人员出示此码，核验通过后进入取餐区。</p>
        </div>
      </section>

      <section className="pickup-pass glass-panel">
        <div className="pass-topline">
          <PackageCheck size={22} />
          <span>{activeOrder?.merchant_name || "选择一笔待取订单"}</span>
        </div>
        <select
          className="prism-input"
          value={activeOrder?.id || ""}
          onChange={(event) => {
            setSelectedOrderId(event.target.value);
            setPickupCode(null);
          }}
        >
          {eligibleOrders.length ? eligibleOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.merchant_name || "外卖订单"} {order.item_summary ? `- ${order.item_summary}` : ""}
            </option>
          )) : <option value="">暂无待取订单</option>}
        </select>

        <div className="code-display">
          <span>取餐码</span>
          <strong>{pickupCode?.code || "------"}</strong>
          <small>{pickupCode ? `有效至 ${new Date(pickupCode.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "点击生成一次性入场凭证"}</small>
        </div>

        <button className="prism-primary" disabled={loading || !activeOrder} onClick={issueCode}>
          {loading ? <RefreshCw size={18} /> : <KeyRound size={18} />}
          {pickupCode ? "刷新取餐码" : "生成取餐码"}
        </button>
        {message ? <div className="gate-message error">{message}</div> : null}
      </section>

      <section className="mobile-grid">
        <article className="mini-orb-card">
          <ShieldCheck size={26} />
          <strong>入口核验</strong>
          <span>仅作为进入围栏凭证</span>
        </article>
        <article className="mini-orb-card">
          <PackageCheck size={26} />
          <strong>取餐留痕</strong>
          <span>减少错拿与争议</span>
        </article>
      </section>
    </main>
  );
}
