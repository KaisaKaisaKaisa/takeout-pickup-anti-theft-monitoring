import { guardApi } from "../lib/api";
import type { GuardSnapshot, Order } from "../types";
import { compactId, formatDateTime } from "../utils/format";
import { StatusPill } from "../components/StatusPill";

interface OrdersPageProps {
  snapshot: GuardSnapshot;
  refresh: () => void;
}

async function runOrderAction(action: () => Promise<unknown>, refresh: () => void) {
  await action();
  refresh();
}

export function OrdersPage({ snapshot, refresh }: OrdersPageProps) {
  const renderOrder = (order: Order) => (
    <article className="record-card" key={order.id} data-evidence-target>
      <div className="record-main">
        <span className="mono">{compactId(order.id)}</span>
        <h3>{order.merchant_name || "未命名订单"}</h3>
        <p>{order.item_summary || "等待录入商品摘要"}</p>
      </div>
      <div className="record-meta">
        <StatusPill status={order.status}>{order.status}</StatusPill>
        <span>截止 {formatDateTime(order.expected_pickup_by)}</span>
        <span>会话 {order.latest_session_id ? compactId(order.latest_session_id) : "未布防"}</span>
      </div>
      <div className="record-actions">
        <button type="button" onClick={() => runOrderAction(() => guardApi.armOrder(order.id), refresh)}>手动布防</button>
        <button type="button" className="secondary" onClick={() => runOrderAction(() => guardApi.confirmPickup(order.id), refresh)}>确认取餐</button>
      </div>
    </article>
  );

  return (
    <section className="page-grid eastern-workspace orders-page" id="orders">
      <div className="page-title">
        <span className="eyebrow">orders / arm / pickup</span>
        <h1>订单布防队列</h1>
        <p>列表、筛选、导入订单、手动布防和确认取餐放在同一工作流，避免值班员在页面间来回跳转。</p>
      </div>
      <form className="panel import-inline" onSubmit={(event) => event.preventDefault()}>
        <label>
          商户
          <input placeholder="北门咖啡" />
        </label>
        <label>
          商品摘要
          <input placeholder="拿铁 + 可颂" />
        </label>
        <label>
          取餐窗口
          <input type="number" defaultValue={30} />
        </label>
        <button type="button">导入订单</button>
      </form>
      <div className="record-list">{snapshot.orders.map(renderOrder)}</div>
      <article className="panel timeline-panel">
        <h2>状态时间线</h2>
        {["created", "delivered", "armed", "alerted", "picked_up"].map((step, index) => (
          <div className="timeline-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
            <small>{index < 3 ? "已覆盖在当前契约" : "等待事件推进"}</small>
          </div>
        ))}
      </article>
    </section>
  );
}
