(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.workspaceCards = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function escapeHtml(value) {
    const str = value == null ? "" : String(value);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pick(value, fallback = "") {
    return value == null ? fallback : value;
  }

  function formatPair(left, right) {
    const l = pick(left, "").toString().trim();
    const r = pick(right, "").toString().trim();
    if (!l && !r) {
      return "-";
    }
    if (!l) {
      return r;
    }
    if (!r) {
      return l;
    }
    return `${l} / ${r}`;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      return String(value);
    }
    return dt.toLocaleString();
  }

  function getOrderSummary(order) {
    return pick(order?.item_summary || order?.summary || order?.merchant_name, "");
  }

  function getOrderTimestamp(order) {
    return pick(order?.delivered_at || order?.updated_at || order?.expected_pickup_by, null);
  }

  function getAlertSummary(alert) {
    return pick(alert?.summary || alert?.alert_type, "");
  }

  function getAlertTimestamp(alert) {
    return pick(alert?.triggered_at || alert?.updated_at, null);
  }

  function getDeviceSummary(device) {
    return pick(device?.name || device?.summary, "");
  }

  function getDeviceTimestamp(device) {
    return pick(device?.last_seen_at || device?.updated_at, null);
  }

  function bindAction(card, action, handler) {
    const node = card.querySelector(`[data-action="${action}"]`);
    if (node) {
      node.addEventListener("click", handler);
    }
  }

  function createWorkspaceCards(config = {}) {
    const doc = config.document || root.document;

    function buildOrderCard(order) {
      const li = doc.createElement("li");
      li.className = "card";
      li.dataset.id = order.id;
      li.innerHTML = `
        <strong>${escapeHtml(order.provider)} 路 ${escapeHtml(order.status)}</strong>
        <div class="meta">订单ID: ${escapeHtml(order.id)}</div>
        <div class="meta">${escapeHtml(formatPair(order.merchant_name || "-", getOrderSummary(order) || "-"))}</div>
        <div class="meta">送达: ${escapeHtml(formatDate(getOrderTimestamp(order)))} 路 预计取餐: ${escapeHtml(formatDate(order.expected_pickup_by))}</div>
        <div class="meta">会话: ${escapeHtml(order.latest_session_id || "-")}</div>
        <div class="btn-row">
          <button class="ghost" data-action="deliver">模拟送达</button>
          <button class="primary" data-action="arm">启动监控</button>
          <button class="ghost" data-action="confirm">确认取餐</button>
          <button class="ghost" data-action="timeline">查看时间线</button>
        </div>
      `;
      bindAction(li, "deliver", async () => config.onOrderDeliver?.(order));
      bindAction(li, "arm", async () => config.onOrderArm?.(order));
      bindAction(li, "confirm", async () => config.onOrderConfirm?.(order));
      bindAction(li, "timeline", async () => config.onOrderTimeline?.(order));
      return li;
    }

    function buildAlertCard(alert) {
      const li = doc.createElement("li");
      li.className = "card audit-card alert-event-card";
      li.dataset.id = alert.id;
      const activeAlertId = typeof config.getActiveAlertId === "function" ? config.getActiveAlertId() : "";
      if (String(alert.id || "") === String(activeAlertId || "")) {
        li.classList.add("is-selected");
      }
      li.innerHTML = `
        <div class="audit-card-head">
          <div class="audit-card-title">
            <strong>${escapeHtml(getAlertSummary(alert) || alert.alert_type)} / ${escapeHtml(alert.level || "-")}</strong>
            <span class="hint">Alert Unit</span>
          </div>
          <span class="chip audit-status-chip is-hot">${escapeHtml(alert.status || "-")}</span>
        </div>
        <div class="audit-card-meta-grid">
          <div class="meta"><span>等级</span><strong>${escapeHtml(alert.level || "-")}</strong></div>
          <div class="meta"><span>时间</span><strong>${escapeHtml(formatDate(getAlertTimestamp(alert)))}</strong></div>
          <div class="meta"><span>订单</span><strong>${escapeHtml(alert.order_id || "-")}</strong></div>
        </div>
        <div class="btn-row audit-card-actions">
          <button class="ghost" data-action="detail">详情</button>
          <button class="ghost" data-action="ack">确认</button>
          <button class="ghost" data-action="resolve">结案</button>
          <button class="ghost" data-action="false">误报</button>
          <button class="primary" data-action="evidence">取证</button>
        </div>
      `;
      bindAction(li, "detail", async () => config.onAlertDetail?.(alert));
      bindAction(li, "ack", async () => config.onAlertAction?.(alert, "ack"));
      bindAction(li, "resolve", async () => config.onAlertAction?.(alert, "resolve"));
      bindAction(li, "false", async () => config.onAlertAction?.(alert, "false_positive"));
      bindAction(li, "evidence", async () => config.onAlertEvidence?.(alert));
      return li;
    }

    function buildDeviceCard(device) {
      const li = doc.createElement("li");
      li.className = "card audit-card support-node-card";
      li.dataset.id = device.id;
      li.innerHTML = `
        <div class="audit-card-head">
          <div class="audit-card-title">
            <strong>${escapeHtml(getDeviceSummary(device) || device.name)}</strong>
            <span class="hint">Support Node</span>
          </div>
          <span class="chip audit-status-chip">${escapeHtml(device.status || "unknown")}</span>
        </div>
        <div class="audit-card-meta-grid">
          <div class="meta"><span>类型</span><strong>${escapeHtml(device.device_type || "-")}</strong></div>
          <div class="meta"><span>更新</span><strong>${escapeHtml(formatDate(getDeviceTimestamp(device)))}</strong></div>
          <div class="meta"><span>设备码</span><strong>${escapeHtml(device.device_code || "-")}</strong></div>
        </div>
        <div class="btn-row audit-card-actions">
          <button class="ghost" data-action="select">选择</button>
        </div>
      `;
      bindAction(li, "select", async () => config.onDeviceSelect?.(device));
      return li;
    }

    return {
      buildOrderCard,
      buildAlertCard,
      buildDeviceCard,
    };
  }

  return {
    createWorkspaceCards,
  };
});
