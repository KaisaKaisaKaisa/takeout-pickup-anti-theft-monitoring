const API_BASE_URL = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:18000/api/v1";
const API_ROOT = API_BASE_URL.replace(/\/api\/v1$/, "");
const DEMO_ACCOUNT = { phone: "demo-user", password: "demo-pass", name: "Demo" };
const appApiClient = window.apiClient || {};
const appAuthClient = window.authClient || {};
const appReportClient = window.reportClient || {};

const state = {
  token: null,
  user: null,
  deviceId: null,
  deviceCode: null,
  reportInterval: "day",
  ruleMatches: { page: 1, limit: 8, hasMore: false },
};

let ruleMatchIndex = new Map();
let ruleMatchSignature = "";
let trendCache = null;
let appEventsBound = false;
const appApiParams = window.apiParams || {};
const appAlertActionsApi = window.alertActions || {};
const appRuleSetSelectApi = window.ruleSetSelect || {};
const appRealtimeClient = window.realtimeClient || {};
const appWorkspaceCards = window.workspaceCards || {};
const appReportMapping = window.reportMapping || {
  normalizeSummary(data = {}) {
    const orders = data.orders || {};
    const alerts = data.alerts || {};
    const devices = data.devices || {};
    const sessions = data.sessions || {};
    return {
      orders: {
        total: orders.total ?? 0,
        created: orders.created ?? 0,
        delivered: orders.delivered ?? 0,
        picked_up: orders.picked_up ?? 0,
      },
      alerts: {
        total: alerts.total ?? 0,
        open: alerts.open ?? 0,
        acknowledged: alerts.acknowledged ?? 0,
        resolved: alerts.resolved ?? 0,
        false_positive: alerts.false_positive ?? 0,
      },
      devices: {
        total: devices.total ?? 0,
        online: devices.online ?? 0,
        offline: devices.offline ?? 0,
      },
      sessions: {
        total: sessions.total ?? 0,
        armed: sessions.armed ?? 0,
        alerted: sessions.alerted ?? 0,
        confirmed: sessions.confirmed ?? 0,
      },
      events_last_24h: data.events_last_24h ?? 0,
      rule_matches: {
        total: (data.rule_matches || {}).total ?? 0,
        suppressed: (data.rule_matches || {}).suppressed ?? 0,
      },
    };
  },
  normalizeTrends(data = {}) {
    return {
      interval: data.interval || "day",
      orders: data.orders || [],
      alerts: data.alerts || [],
      devices: data.devices || [],
      sessions: data.sessions || [],
      events: data.events || [],
      rule_matches: data.rule_matches || [],
    };
  },
};

const inflight = {};
const WORKSPACE_ANCHOR_OWNER = {
  alerts: "orders",
  "alert-detail": "orders",
  devices: "orders",
  "rule-matches": "rules",
};

const $ = (id) => document.getElementById(id);

function getReportRangeFilters() {
  return {
    scope: "user",
    start: $("report-start")?.value || "",
    end: $("report-end")?.value || "",
  };
}

function getTrendFilters() {
  return {
    ...getReportRangeFilters(),
    interval: state.reportInterval || "day",
    days: 7,
    weeks: 6,
  };
}

function getRuleMatchFilters(page = 1, exportLimit = null) {
  const limit = exportLimit || state.ruleMatches.limit;
  return {
    scope: "user",
    limit,
    offset: (page - 1) * limit,
    eventType: $("rule-match-filter")?.value || "",
    ruleSetId: $("rule-match-rule-set")?.value || "",
    range: $("rule-match-range")?.value || "24h",
    includeSuppressed: Boolean($("include-suppressed")?.checked),
    search: $("rule-match-search")?.value?.trim() || "",
    start: $("rule-match-start")?.value || "",
    end: $("rule-match-end")?.value || "",
  };
}

let heroMetaDefault = "";
let heroMetaTimer = null;

function initHeroMeta() {
  const node = document.querySelector(".hero-meta");
  if (node) {
    heroMetaDefault = node.textContent || "";
  }
}

function flashMeta(message, duration = 3200) {
  const node = document.querySelector(".hero-meta");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.dataset.state = /失败|错误|不可用/.test(message) ? "error" : "ok";
  if (heroMetaTimer) {
    clearTimeout(heroMetaTimer);
  }
  heroMetaTimer = setTimeout(() => {
    node.textContent = heroMetaDefault;
    delete node.dataset.state;
  }, duration);
}

function getErrorMessage(error, fallback) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
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
  if (l === r) {
    return l;
  }
  return `${l} 路 ${r}`;
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

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function resolveMediaUrl(media) {
  const raw = media?.download_url || media?.url || media?.path || "";
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `${API_ROOT}${raw}`;
}

async function resolveDownloadUrl(path) {
  if (!path) {
    return "";
  }
  let requestUrl = "";
  if (/^https?:\/\//i.test(path)) {
    const parsedUrl = new URL(path);
    if (parsedUrl.origin !== API_ROOT || !parsedUrl.pathname.startsWith("/api/v1/")) {
      return path;
    }
    requestUrl = parsedUrl.toString();
  } else if (path.startsWith("/api/v1/")) {
    requestUrl = `${API_ROOT}${path}`;
  } else {
    requestUrl = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  }
  const headers = {};
  const token = await ensureAuth();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(requestUrl, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText || "媒体下载失败");
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
  const result = await res.json();
  if (typeof result === "string") {
    return /^https?:\/\//i.test(result) ? result : `${API_ROOT}${result}`;
  }
  if (result?.download_url) {
    return result.download_url;
  }
  return `${API_ROOT}${path}`;
}

function normalizeDeviceList(payload) {
  if (Array.isArray(payload?.devices)) {
    return payload.devices;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function setFieldError(inputId, message = "") {
  const input = $(inputId);
  const error = $(`${inputId}-error`);
  const row = input?.closest(".form-row");
  if (error) {
    error.textContent = message;
  }
  if (row) {
    row.classList.toggle("has-error", Boolean(message));
  }
  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function setFormStatus(message, stateName = "") {
  const node = $("import-form-status");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.toggle("is-ok", stateName === "ok");
  node.classList.toggle("is-error", stateName === "error");
}

function validateImportForm() {
  const merchant = $("merchant")?.value?.trim() || "";
  const summary = $("summary")?.value?.trim() || "";
  const pickupWindow = toNumber($("pickup-window")?.value, 30);
  let ok = true;
  setFieldError("merchant", "");
  setFieldError("summary", "");
  setFieldError("pickup-window", "");
  if (!merchant && !summary) {
    setFieldError("merchant", "至少填写商家或商品摘要");
    setFieldError("summary", "至少填写商家或商品摘要");
    ok = false;
  }
  if (pickupWindow < 5 || pickupWindow > 180) {
    setFieldError("pickup-window", "取餐窗口需在 5 到 180 分钟之间");
    ok = false;
  }
  setFormStatus(ok ? "订单信息可提交" : "请修正高亮字段", ok ? "ok" : "error");
  return ok;
}

async function ensureAuth() {
  if (typeof appAuthClient.ensureAuth === "function") {
    return appAuthClient.ensureAuth({
      store: state,
      apiBase: API_BASE_URL,
      demoAccount: DEMO_ACCOUNT,
      apiClient: appApiClient,
    });
  }
  if (state.token) {
    return state.token;
  }
  const cached = localStorage.getItem("tg_token");
  if (cached) {
    state.token = cached;
    return cached;
  }
  const loginPayload = { phone: DEMO_ACCOUNT.phone, password: DEMO_ACCOUNT.password };
  let res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginPayload),
  });
  if (!res.ok) {
    res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEMO_ACCOUNT),
    });
  }
  if (!res.ok) {
    throw new Error("登录失败");
  }
  const data = await res.json();
  state.token = data.access_token;
  localStorage.setItem("tg_token", state.token);
  return state.token;
}

async function withInFlight(key, handler) {
  if (inflight[key]) {
    return inflight[key];
  }
  const task = handler().finally(() => {
    inflight[key] = null;
  });
  inflight[key] = task;
  return task;
}

async function fetchJson(path, options = {}, useAuth = true, retry = true) {
  if (typeof appAuthClient.fetchJson === "function") {
    return appAuthClient.fetchJson(path, options, {
      store: state,
      apiBase: API_BASE_URL,
      apiClient: appApiClient,
      demoAccount: DEMO_ACCOUNT,
      useAuth,
      retry,
    });
  }
  const headers = options.headers ? { ...options.headers } : {};
  if (useAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && useAuth && retry) {
    localStorage.removeItem("tg_token");
    state.token = null;
    await ensureAuth();
    return fetchJson(path, options, useAuth, false);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) {
    return null;
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

async function fetchBlob(path, options = {}, useAuth = true) {
  if (typeof appAuthClient.fetchBlob === "function") {
    return appAuthClient.fetchBlob(path, options, {
      store: state,
      apiBase: API_BASE_URL,
      apiClient: appApiClient,
      demoAccount: DEMO_ACCOUNT,
      useAuth,
    });
  }
  const headers = options.headers ? { ...options.headers } : {};
  if (useAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.blob();
}

async function downloadWithAuth(path, filename) {
  if (typeof appAuthClient.downloadWithAuth === "function") {
    return appAuthClient.downloadWithAuth(path, filename, {
      store: state,
      apiBase: API_BASE_URL,
      apiClient: appApiClient,
      demoAccount: DEMO_ACCOUNT,
    });
  }
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderEmpty(listEl, message) {
  const item = document.createElement("li");
  item.className = "card empty-state";
  item.innerHTML = `
    <strong>暂无可处理记录</strong>
    <span class="meta">${escapeHtml(message)}</span>
  `;
  listEl.appendChild(item);
}

function renderLoading(listEl, message = "正在加载数据") {
  if (!listEl) {
    return;
  }
  listEl.classList.add("is-loading");
  listEl.innerHTML = `
    <li class="card skeleton-card">
      <strong>${escapeHtml(message)}</strong>
      <span class="meta">正在同步订单、告警、设备与规则状态。</span>
    </li>
  `;
}

function clearLoading(listEl) {
  if (listEl) {
    listEl.classList.remove("is-loading");
  }
}

function renderList(listEl, items, builder, emptyText) {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  if (!items || items.length === 0) {
    renderEmpty(listEl, emptyText || "暂无数据");
    return;
  }
  items.forEach((item) => listEl.appendChild(builder(item)));
}

async function loadMe() {
  state.user = await fetchJson("/me");
  return state.user;
}

async function loadOrders() {
  return withInFlight("orders", async () => {
    renderLoading($("orders-list"), "正在加载订单队列");
    const data = await fetchJson("/orders");
    clearLoading($("orders-list"));
    renderOrders(data.orders || []);
  });
}

function renderOrders(orders) {
  const listEl = $("orders-list");
  renderList(listEl, orders, buildOrderCard, "暂无订单");
}

async function deliverOrder(order) {
  try {
    await fetchJson(`/integrations/mock/delivered/${order.id}`, { method: "POST" });
    flashMeta("模拟送达完成");
    await loadOrders();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta("模拟送达失败");
  }
}

async function armOrder(order) {
  try {
    const res = await fetchJson(`/orders/${order.id}/arm`, { method: "POST" });
    flashMeta(`监控会话已启动：${res.session_id}`);
    await loadOrders();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta("启动监控失败");
  }
}

async function confirmOrder(order) {
  try {
    await fetchJson(`/orders/${order.id}/confirm-pickup`, { method: "POST" });
    flashMeta("已确认取餐");
    await loadOrders();
    await loadAlerts();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta("确认取餐失败");
  }
}

async function loadOrderTimeline(order) {
  try {
    const timeline = await fetchJson(`/orders/${order.id}/timeline`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(timeline, null, 2);
    }
    flashMeta("已加载订单时间线");
  } catch (err) {
    console.error(err);
    flashMeta("加载时间线失败");
  }
}

async function loadAlerts() {
  return withInFlight("alerts", async () => {
    const data = await fetchJson("/alerts");
    renderAlerts(data.alerts || []);
  });
}

async function runAlertAction(alertId, action) {
  const getMeta =
    appAlertActionsApi.getAlertActionMeta ||
    ((name) => {
      if (name === "ack") {
        return {
          pathSuffix: "ack",
          successMessage: "告警已确认",
          errorMessage: "告警确认失败",
        };
      }
      if (name === "resolve") {
        return {
          pathSuffix: "resolve",
          successMessage: "告警已结案",
          errorMessage: "告警结案失败",
        };
      }
      if (name === "false_positive") {
        return {
          pathSuffix: "false-positive",
          successMessage: "已标记为误报",
          errorMessage: "误报标记失败",
        };
      }
      throw new Error(`Unknown alert action: ${name}`);
    });
  const meta = getMeta(action);
  try {
    await fetchJson(`/alerts/${alertId}/${meta.pathSuffix}`, { method: "POST" });
    flashMeta(meta.successMessage);
    await loadAlerts();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, meta.errorMessage));
  }
}

function setSelectedAlertCard(alertId) {
  const normalizedAlertId = alertId == null ? "" : String(alertId);
  document.querySelectorAll(".alert-event-card.is-selected").forEach((card) => {
    card.classList.remove("is-selected");
  });
  const detailPanel = document.querySelector("#alert-detail .evidence-bay-panel");
  if (detailPanel) {
    if (normalizedAlertId) {
      detailPanel.dataset.alertId = normalizedAlertId;
    } else {
      delete detailPanel.dataset.alertId;
    }
  }
  if (!normalizedAlertId) {
    return;
  }
  const targetCard = document.querySelector(`#alerts-list .alert-event-card[data-id="${normalizedAlertId}"]`);
  if (targetCard) {
    targetCard.classList.add("is-selected");
  }
}

function setEvidenceBayState({ loaded = false, evidence = false } = {}) {
  const detailPanel = document.querySelector("#alert-detail .evidence-bay-panel");
  if (!detailPanel) {
    return;
  }
  detailPanel.classList.toggle("is-loaded", loaded);
  detailPanel.classList.toggle("is-evidence", evidence);
}

function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  renderList(listEl, alerts, buildAlertCard, "暂无告警");
}

async function renderAlertMedia(mediaList, mediaItems = []) {
  mediaList.innerHTML = "";
  if (!mediaItems || mediaItems.length === 0) {
    mediaList.innerHTML = `<div class="meta">暂无证据媒体</div>`;
    return;
  }
  for (const media of mediaItems) {
    const img = document.createElement("img");
    const fallback = resolveMediaUrl(media);
    try {
      const src = media?.download_url ? await resolveDownloadUrl(media.download_url) : fallback;
      img.src = src;
    } catch (err) {
      console.error(err);
      img.src = fallback;
      img.dataset.state = "unresolved";
    }
    img.alt = media.type || media.media_type || "media";
    mediaList.appendChild(img);
  }
}

async function loadAlertDetail(alertId) {
  setSelectedAlertCard(alertId);
  setEvidenceBayState({ loaded: false, evidence: false });
  try {
    const detail = await fetchJson(`/alerts/${alertId}`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(detail, null, 2);
    }
    const mediaList = $("alert-media");
    if (mediaList) {
      await renderAlertMedia(mediaList, detail.media || []);
    }
    setEvidenceBayState({ loaded: true, evidence: false });
    flashMeta("告警详情已加载");
  } catch (err) {
    console.error(err);
    setEvidenceBayState({ loaded: false, evidence: false });
    flashMeta(getErrorMessage(err, "加载告警详情失败"));
  }
}

async function generateEvidence(alertId) {
  setSelectedAlertCard(alertId);
  setEvidenceBayState({ loaded: true, evidence: false });
  try {
    const res = await fetchJson(`/evidence/${alertId}/generate`, { method: "POST" });
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    setEvidenceBayState({ loaded: true, evidence: true });
    flashMeta("取证包生成完成");
  } catch (err) {
    console.error(err);
    setEvidenceBayState({ loaded: true, evidence: false });
    flashMeta(getErrorMessage(err, "生成取证包失败"));
  }
}

async function loadDevices() {
  return withInFlight("devices", async () => {
    const payload = await fetchJson("/devices");
    const devices = normalizeDeviceList(payload);
    renderDevices(devices || []);
    if (!state.deviceId && devices && devices.length > 0) {
      await selectDevice(devices[0]);
    }
  });
}

function renderDevices(devices) {
  const listEl = $("devices-list");
  renderList(listEl, devices, buildDeviceCard, "暂无设备");
}

const workspaceCardBuilders = typeof appWorkspaceCards.createWorkspaceCards === "function"
  ? appWorkspaceCards.createWorkspaceCards({
      document,
      getActiveAlertId: () => document.querySelector("#alert-detail .evidence-bay-panel")?.dataset.alertId || "",
      onOrderDeliver: deliverOrder,
      onOrderArm: armOrder,
      onOrderConfirm: confirmOrder,
      onOrderTimeline: loadOrderTimeline,
      onAlertDetail: async (alert) => {
        setSelectedAlertCard(alert.id);
        await loadAlertDetail(alert.id);
      },
      onAlertAction: async (alert, action) => {
        await runAlertAction(alert.id, action);
      },
      onAlertEvidence: async (alert) => {
        setSelectedAlertCard(alert.id);
        await generateEvidence(alert.id);
      },
      onDeviceSelect: selectDevice,
    })
  : null;

function buildOrderCard(order) {
  return workspaceCardBuilders.buildOrderCard(order);
}

function buildAlertCard(alert) {
  return workspaceCardBuilders.buildAlertCard(alert);
}

function buildDeviceCard(device) {
  return workspaceCardBuilders.buildDeviceCard(device);
}

async function selectDevice(device) {
  state.deviceId = device.id;
  state.deviceCode = device.device_code || state.deviceCode;
  const selected = $("selected-device");
  if (selected) {
    selected.textContent = `当前选择：${device.name || device.id}`;
  }
  await loadDeviceConfig(device.id);
}

async function loadDeviceConfig(deviceId) {
  try {
    const detail = await fetchJson(`/devices/${deviceId}`);
    const sensitivity = (detail.config || {}).sensitivity || {};
    const minMotion = $("min-motion");
    const maxDrop = $("max-drop");
    if (minMotion) {
      minMotion.value = sensitivity.min_motion_score ?? "";
    }
    if (maxDrop) {
      maxDrop.value = sensitivity.max_weight_drop ?? "";
    }
  } catch (err) {
    console.error(err);
    flashMeta("加载设备配置失败");
  }
}

async function loadHealth() {
  if (!state.deviceId) {
    flashMeta("请先选择设备");
    return;
  }
  try {
    const health = await fetchJson(`/devices/${state.deviceId}/health`);
    const output = $("health-output");
    if (output) {
      output.textContent = JSON.stringify(health, null, 2);
    }
    flashMeta("设备健康信息已加载");
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "加载健康信息失败"));
  }
}

async function renderSystemHealth() {
  const output = $("health-output") || $("alert-detail-output");
  if (output) {
    output.textContent = "正在检查系统状态...";
  }
  try {
    const res = await fetch(`${API_ROOT}/readyz`);
    const health = await res.json();
    if (!res.ok) {
      throw new Error(health.detail || `HTTP ${res.status}`);
    }
    if (output) {
      output.textContent = JSON.stringify(health, null, 2);
    }
    flashMeta(health.ok === false ? "系统状态异常" : "系统状态已就绪");
  } catch (err) {
    console.error(err);
    if (output) {
      output.textContent = JSON.stringify({ ok: false, error: err.message }, null, 2);
    }
    flashMeta("系统状态不可用");
  }
}

async function saveDeviceConfig() {
  if (!state.deviceId) {
    flashMeta("请先选择设备");
    return;
  }
  const minMotion = toNumber($("min-motion")?.value, 0);
  const maxDrop = toNumber($("max-drop")?.value, 0);
  try {
    const result = await fetchJson(`/devices/${state.deviceId}/config`, {
      method: "PATCH",
      body: JSON.stringify({
        sensitivity: {
          min_motion_score: minMotion,
          max_weight_drop: maxDrop,
        },
      }),
    });
    const sensitivity = (result?.config || {}).sensitivity || {};
    const minMotionInput = $("min-motion");
    const maxDropInput = $("max-drop");
    if (minMotionInput) {
      minMotionInput.value = sensitivity.min_motion_score ?? minMotion;
    }
    if (maxDropInput) {
      maxDropInput.value = sensitivity.max_weight_drop ?? maxDrop;
    }
    flashMeta("配置已保存");
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "保存配置失败"));
  }
}

async function loadAudit() {
  return withInFlight("audit", async () => {
    try {
      const rows = await fetchJson("/audit");
      const listEl = $("audit-list");
      renderList(
        listEl,
        rows || [],
        (row) => {
          const li = document.createElement("li");
          li.className = "card";
          li.innerHTML = `
            <strong>${escapeHtml(row.action)}</strong>
            <div class="meta">${escapeHtml(row.resource_type)} 路 ${escapeHtml(row.resource_id || "-")}</div>
            <div class="meta">${escapeHtml(formatDate(row.created_at))}</div>
          `;
          return li;
        },
        "暂无审计日志"
      );
    } catch (err) {
      console.error(err);
      flashMeta("加载审计日志失败");
    }
  });
}

async function verifyPickupCode() {
  const code = $("pickup-code")?.value?.trim();
  if (!code) {
    flashMeta("请输入取餐码");
    return;
  }
  try {
    const res = await fetchJson("/whitelist/verify-code", {
      method: "POST",
      body: JSON.stringify({ code }),
    }, false);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    flashMeta("取餐码验证完成");
    await loadOrders();
    await loadAlerts();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta("取餐码验证失败");
  }
}

async function importOrder(evt) {
  evt.preventDefault();
  const merchant = $("merchant")?.value?.trim();
  const summary = $("summary")?.value?.trim();
  const pickupWindow = toNumber($("pickup-window")?.value, 30);
  if (!validateImportForm()) {
    flashMeta("订单导入信息不完整");
    return;
  }
  try {
    setFormStatus("正在导入订单");
    await fetchJson("/orders/manual-import", {
      method: "POST",
      body: JSON.stringify({
        provider: "manual",
        merchant_name: merchant,
        item_summary: summary,
        expected_pickup_minutes: pickupWindow,
      }),
    });
    flashMeta("订单导入完成");
    setFormStatus("订单导入完成", "ok");
    await loadOrders();
    await loadReports();
  } catch (err) {
    console.error(err);
    const message = getErrorMessage(err, "订单导入失败");
    setFormStatus(message, "error");
    flashMeta(message);
  }
}

async function loadReports() {
  return withInFlight("reports", async () => {
    try {
      const summaryQuery = appApiParams.buildSummaryQuery
        ? appApiParams.buildSummaryQuery(getReportRangeFilters())
        : "scope=user";
      const summary = await fetchJson(`/reports/summary?${summaryQuery}`);
      renderSummary(summary || {});
      await loadTrends();
    } catch (err) {
      console.error(err);
      flashMeta("加载报表失败");
    }
  });
}

function renderSummary(summary) {
  const normalized = appReportMapping.normalizeSummary
    ? appReportMapping.normalizeSummary(summary)
    : summary || {};
  const orders = normalized.orders || {};
  const alerts = normalized.alerts || {};
  const devices = normalized.devices || {};
  const sessions = normalized.sessions || {};

  setText("summary-orders", orders.total ?? 0);
  setText("summary-orders-meta", `created ${orders.created ?? 0} 路 delivered ${orders.delivered ?? 0} 路 picked ${orders.picked_up ?? 0}`);
  setText("summary-alerts", alerts.total ?? 0);
  setText("summary-alerts-meta", `open ${alerts.open ?? 0} 路 resolved ${alerts.resolved ?? 0} 路 false ${alerts.false_positive ?? 0}`);
  setText("summary-devices", devices.total ?? 0);
  setText("summary-devices-meta", `online ${devices.online ?? 0} 路 offline ${devices.offline ?? 0}`);
  setText("summary-sessions", sessions.total ?? 0);
  setText("summary-sessions-meta", `armed ${sessions.armed ?? 0} 路 alerted ${sessions.alerted ?? 0} 路 confirmed ${sessions.confirmed ?? 0}`);
  setText("summary-events", normalized.events_last_24h ?? 0);
  setText("summary-rules", normalized.rule_matches?.total ?? 0);
  setText("summary-rules-meta", `suppressed ${normalized.rule_matches?.suppressed ?? 0}`);

  setText("hero-sessions", sessions.armed ?? sessions.total ?? 0);
  setText("hero-alerts", alerts.total ?? 0);
  setText("hero-devices", devices.online ?? 0);
}

function setText(id, value) {
  const node = $(id);
  if (node) {
    node.textContent = value;
  }
}

async function loadTrends() {
  return withInFlight("trends", async () => {
    const query = appApiParams.buildTrendsQuery
      ? appApiParams.buildTrendsQuery(getTrendFilters())
      : `scope=user&interval=${state.reportInterval || "day"}&days=7`;
    const trends = await fetchJson(`/reports/trends?${query}`);
    renderTrends(trends || {});
  });
}

function renderTrends(trends) {
  const normalized = appReportMapping.normalizeTrends
    ? appReportMapping.normalizeTrends(trends)
    : trends || {};
  renderTrendBars($("trend-orders"), normalized.orders || [], "");
  renderTrendBars($("trend-alerts"), normalized.alerts || [], "alerts");
  renderTrendBars($("trend-devices"), normalized.devices || [], "devices");
  renderTrendBars($("trend-sessions"), normalized.sessions || [], "sessions");
  renderTrendBars($("trend-events"), normalized.events || [], "events");
  renderTrendBars($("trend-rule-matches"), normalized.rule_matches || [], "rules");
  renderTrendMeta($("trend-orders-meta"), normalized.orders || []);
  renderTrendMeta($("trend-alerts-meta"), normalized.alerts || []);
  renderTrendMeta($("trend-devices-meta"), normalized.devices || []);
  renderTrendMeta($("trend-sessions-meta"), normalized.sessions || []);
  renderTrendMeta($("trend-events-meta"), normalized.events || []);
  renderTrendMeta($("trend-rules-meta"), normalized.rule_matches || []);
  trendCache = {
    interval: normalized.interval || state.reportInterval || "day",
    orders: normalized.orders || [],
    alerts: normalized.alerts || [],
    devices: normalized.devices || [],
    sessions: normalized.sessions || [],
    events: normalized.events || [],
    rule_matches: normalized.rule_matches || [],
  };
}

function renderTrendBars(container, rows, variant) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "暂无趋势数据";
    container.appendChild(empty);
    return;
  }
  const maxVal = Math.max(...rows.map((r) => toNumber(r.count, 0)), 1);
  rows.forEach((row) => {
    const label = row.day || row.week || "-";
    const count = toNumber(row.count, 0);
    const bar = document.createElement("div");
    bar.className = `trend-bar ${variant}`.trim();
    bar.innerHTML = `
      <span class="label"><i class="dot"></i>${escapeHtml(label)}</span>
      <div class="bar" style="width:${Math.max(6, Math.round((count / maxVal) * 100))}%;"></div>
      <strong>${escapeHtml(count)}</strong>
    `;
    container.appendChild(bar);
  });
}

function renderTrendMeta(container, rows) {
  if (!container) {
    return;
  }
  if (!rows.length) {
    container.textContent = "暂无统计";
    return;
  }
  const total = rows.reduce((sum, r) => sum + toNumber(r.count, 0), 0);
  const peak = Math.max(...rows.map((r) => toNumber(r.count, 0)), 0);
  container.innerHTML = `<span>总计 <strong>${escapeHtml(total)}</strong></span><span>峰值 <strong>${escapeHtml(peak)}</strong></span>`;
}

function buildRuleMatchCard(row) {
  const li = document.createElement("li");
  li.className = "card audit-card rule-match-card";
  li.dataset.id = row.id != null ? String(row.id) : "";
  li.innerHTML = `
    <div class="audit-card-head">
      <div class="audit-card-title">
        <strong>${escapeHtml(row.rule_name || row.summary || row.event_type || "规则")} 路 ${escapeHtml(row.event_type || "-")}</strong>
        <span class="hint">Audit Trace</span>
      </div>
      <span class="chip audit-status-chip ${row.suppressed ? "is-warn" : "is-live"}">${row.suppressed ? "Suppressed" : "Live"}</span>
    </div>
    <div class="audit-card-meta-grid">
      <div class="meta"><span>规则集</span><strong>${escapeHtml(row.rule_set_name || row.rule_set_id || "-")}</strong></div>
      <div class="meta"><span>订单</span><strong>${escapeHtml(row.order_id || "-")}</strong></div>
      <div class="meta"><span>会话</span><strong>${escapeHtml(row.session_id || "-")}</strong></div>
      <div class="meta"><span>命中时间</span><strong>${escapeHtml(formatDate(row.matched_at || row.updated_at))}</strong></div>
    </div>
    <pre class="code audit-card-code">${escapeHtml(JSON.stringify({ conditions: row.conditions, metrics: row.metrics || row.metrics_json, note: row.note }, null, 2))}</pre>
  `;
  return li;
}

async function loadRuleMatches(page = 1) {
  const filters = getRuleMatchFilters(page);
  const limit = filters.limit;
  const query = appApiParams.buildRuleMatchesQuery
    ? appApiParams.buildRuleMatchesQuery(filters)
    : `limit=${limit}&offset=${filters.offset}`;
  try {
    const rows = await fetchJson(`/rules/matches?${query}`);
    state.ruleMatches.page = page;
    state.ruleMatches.hasMore = rows.length === limit;
    if (window.ruleMatchIndex && window.ruleMatchIndex.buildFilterSignature) {
      ruleMatchSignature = window.ruleMatchIndex.buildFilterSignature(filters);
    }
    renderRuleMatches(rows || []);
    updateRuleMatchPager();
  } catch (err) {
    console.error(err);
    flashMeta("加载规则命中失败");
  }
}


function renderRuleMatches(rows) {
  const listEl = $("rule-matches-list");
  renderList(listEl, rows, buildRuleMatchCard, "暂无规则命中");
  if (window.ruleMatchIndex && window.ruleMatchIndex.rebuildIndex) {
    ruleMatchIndex = window.ruleMatchIndex.rebuildIndex(listEl);
  } else {
    ruleMatchIndex = new Map();
  }
}

function updateRuleMatchPager() {
  const pageLabel = $("rule-matches-page");
  if (pageLabel) {
    pageLabel.textContent = `第 ${state.ruleMatches.page} 页`;
  }
  const prevBtn = $("rule-matches-prev");
  const nextBtn = $("rule-matches-next");
  if (prevBtn) {
    prevBtn.disabled = state.ruleMatches.page <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = !state.ruleMatches.hasMore;
  }
}


function safeJsonParse(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function formatDslPreview(dsl) {
  return JSON.stringify(dsl, null, 2);
}

function setDslStatus(node, message, status = "") {
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("ok", "error", "warn");
  if (status) {
    node.classList.add(status);
  }
}

async function initRules() {
  const root = $("rules-root");
  if (!root || !window.rulesUI || !window.rulesApi) {
    return;
  }
  window.rulesUI(root);

  const ruleSetName = $("rule-set-name");
  const ruleSetDesc = $("rule-set-desc");
  const ruleSetGlobal = $("rule-set-global");
  const createRuleSetBtn = $("create-rule-set");
  const refreshRuleSetsBtn = $("refresh-rule-sets");
  const ruleSetsList = $("rule-sets");
  const ruleSetSelect = $("rule-set-select");
  const rulesList = $("rules-list");
  const ruleEditing = $("rule-editing");
  const ruleName = $("rule-name");
  const ruleEventType = $("rule-event-type");
  const dslRootOp = $("dsl-root-op");
  const dslBuilder = $("dsl-builder");
  const dslPreview = $("dsl-preview");
  const dslMetrics = $("dsl-metrics");
  const dslValidateBtn = $("dsl-validate");
  const dslEvaluateBtn = $("dsl-evaluate");
  const dslResult = $("dsl-result");
  const dslAddRuleBtn = $("dsl-add-rule");
  const dslAddGroupBtn = $("dsl-add-group");
  const ruleCooldown = $("rule-cooldown");
  const ruleAction = $("rule-action");
  const rulePriority = $("rule-priority");
  const ruleEnabled = $("rule-enabled");
  const saveRuleBtn = $("save-rule");
  const resetRuleBtn = $("reset-rule");

  let currentRuleSetId = null;
  let currentRuleId = null;
  let currentDsl = null;
  let dslFields = [];
  let dslMeta = {};

  function getDefaultField() {
    return dslFields[0]?.key || "motion_score";
  }

  function updateDslPreview() {
    if (dslPreview) {
      dslPreview.textContent = formatDslPreview(currentDsl);
    }
  }

  function normalizeValue(op, value) {
    if (op === "eq" || op === "neq") {
      return value;
    }
    if (value === "" || value === null || typeof value === "undefined") {
      return value;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }

  function buildRuleRow(rule, onRemove) {
    const row = document.createElement("div");
    row.className = "dsl-row";
    const fieldSelect = document.createElement("select");
    dslFields.forEach((field) => {
      const option = document.createElement("option");
      option.value = field.key;
      option.textContent = `${field.label || field.key}`;
      if (field.unit) {
        option.textContent += ` (${field.unit})`;
      }
      if (rule.field === field.key) {
        option.selected = true;
      }
      fieldSelect.appendChild(option);
    });
    if (!dslFields.length) {
      const option = document.createElement("option");
      option.value = rule.field || "motion_score";
      option.textContent = rule.field || "motion_score";
      option.selected = true;
      fieldSelect.appendChild(option);
    }
    fieldSelect.addEventListener("change", (evt) => {
      rule.field = evt.target.value;
      updateDslPreview();
    });

    const opSelect = document.createElement("select");
    const compareOps = (dslMeta.operators && dslMeta.operators.compare) || ["gt", "gte", "lt", "lte", "eq", "neq"];
    compareOps.forEach((op) => {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op;
      if (rule.op === op) {
        option.selected = true;
      }
      opSelect.appendChild(option);
    });
    opSelect.addEventListener("change", (evt) => {
      rule.op = evt.target.value;
      updateDslPreview();
    });

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.value = rule.value ?? "";
    valueInput.addEventListener("input", (evt) => {
      rule.value = normalizeValue(rule.op, evt.target.value);
      updateDslPreview();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost";
    removeBtn.type = "button";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      onRemove();
      updateDslPreview();
    });

    row.appendChild(fieldSelect);
    row.appendChild(opSelect);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    return row;
  }

  function buildGroup(group, parentRules) {
    const wrapper = document.createElement("div");
    wrapper.className = "dsl-group";
    const head = document.createElement("div");
    head.className = "dsl-group-head";
    const opSelect = document.createElement("select");
    ["and", "or"].forEach((op) => {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op.toUpperCase();
      if (group.op === op) {
        option.selected = true;
      }
      opSelect.appendChild(option);
    });
    opSelect.addEventListener("change", (evt) => {
      group.op = evt.target.value;
      updateDslPreview();
    });
    const actions = document.createElement("div");
    actions.className = "dsl-group-actions";
    const addRuleBtn = document.createElement("button");
    addRuleBtn.className = "ghost";
    addRuleBtn.type = "button";
    addRuleBtn.textContent = "添加规则";
    addRuleBtn.addEventListener("click", () => {
      group.rules.push({ field: getDefaultField(), op: "gte", value: "" });
      renderDslBuilder();
    });
    const addGroupBtn = document.createElement("button");
    addGroupBtn.className = "ghost";
    addGroupBtn.type = "button";
    addGroupBtn.textContent = "添加子组";
    addGroupBtn.addEventListener("click", () => {
      group.rules.push({ op: "and", rules: [{ field: getDefaultField(), op: "gte", value: "" }] });
      renderDslBuilder();
    });
    actions.appendChild(addRuleBtn);
    actions.appendChild(addGroupBtn);
    if (parentRules) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "ghost";
      removeBtn.type = "button";
      removeBtn.textContent = "删除组";
      removeBtn.addEventListener("click", () => {
        const idx = parentRules.indexOf(group);
        if (idx >= 0) {
          parentRules.splice(idx, 1);
          renderDslBuilder();
        }
      });
      actions.appendChild(removeBtn);
    }
    head.appendChild(opSelect);
    head.appendChild(actions);
    wrapper.appendChild(head);

    group.rules.forEach((rule) => {
      if (window.ruleDslEditor && window.ruleDslEditor.isGroup && window.ruleDslEditor.isGroup(rule)) {
        wrapper.appendChild(buildGroup(rule, group.rules));
      } else {
        const row = buildRuleRow(rule, () => {
          const idx = group.rules.indexOf(rule);
          if (idx >= 0) {
            group.rules.splice(idx, 1);
          }
          renderDslBuilder();
        });
        wrapper.appendChild(row);
      }
    });
    return wrapper;
  }

  function renderDslBuilder() {
    if (!dslBuilder) {
      return;
    }
    dslBuilder.innerHTML = "";
    if (!currentDsl) {
      currentDsl = window.ruleDslEditor
        ? window.ruleDslEditor.createEmptyDsl(getDefaultField())
        : { op: "and", rules: [{ field: getDefaultField(), op: "gte", value: "" }] };
    }
    if (dslRootOp) {
      dslRootOp.value = currentDsl.op || "and";
    }
    dslBuilder.appendChild(buildGroup(currentDsl, null));
    updateDslPreview();
  }

  function resetDslEditor() {
    currentDsl = window.ruleDslEditor
      ? window.ruleDslEditor.createEmptyDsl(getDefaultField())
      : { op: "and", rules: [{ field: getDefaultField(), op: "gte", value: "" }] };
    renderDslBuilder();
  }

  async function loadDslMeta() {
    try {
      dslMeta = await window.rulesApi.getDslMeta(state.token);
      const fieldsResp = await window.rulesApi.getDslFields(state.token);
      dslFields = fieldsResp.fields || [];
    } catch (err) {
      console.warn("dsl meta load failed", err);
      dslMeta = {};
      dslFields = [];
    }
  }

  async function validateDsl() {
    if (!currentDsl) {
      return;
    }
    try {
      const res = await window.rulesApi.validateDsl(state.token, { dsl_json: currentDsl });
      if (res && res.ok) {
        setDslStatus(dslResult, "校验通过", "ok");
      } else {
        setDslStatus(dslResult, res?.detail || "校验失败", "error");
      }
    } catch (err) {
      console.error(err);
      setDslStatus(dslResult, "校验失败", "error");
    }
  }

  async function evaluateDsl() {
    if (!currentDsl) {
      return;
    }
    const metricsPayload = dslMetrics ? safeJsonParse(dslMetrics.value) : null;
    if (!metricsPayload) {
      setDslStatus(dslResult, "请提供有效的 metrics JSON", "warn");
      return;
    }
    try {
      const res = await window.rulesApi.evaluateDsl(state.token, {
        dsl_json: currentDsl,
        metrics: metricsPayload,
      });
      if (res && res.ok) {
        setDslStatus(
          dslResult,
          `评估结果: ${res.matched ? "命中" : "未命中"}`,
          res.matched ? "ok" : "warn"
        );
      } else {
        setDslStatus(dslResult, res?.detail || "评估失败", "error");
      }
    } catch (err) {
      console.error(err);
      setDslStatus(dslResult, "评估失败", "error");
    }
  }

  if (ruleSetGlobal && state.user && !state.user.is_admin) {
    ruleSetGlobal.disabled = true;
    ruleSetGlobal.title = "仅管理员可以创建全局规则集";
  }

  async function refreshRuleSets() {
    const sets = await window.rulesApi.listSetsWithGlobal(state.token);
    renderRuleSets(sets || []);
    populateRuleSetSelect(sets || []);
    if (!currentRuleSetId && sets && sets.length > 0) {
      currentRuleSetId = sets[0].id;
    }
    if (ruleSetSelect && currentRuleSetId) {
      ruleSetSelect.value = currentRuleSetId;
    }
    if (currentRuleSetId) {
      await refreshRules(currentRuleSetId);
    }
  }

  function populateRuleSetSelect(sets) {
    const filterSelect = $("rule-match-rule-set");
    if (!ruleSetSelect && !filterSelect) {
      return;
    }
    if (ruleSetSelect) {
      ruleSetSelect.innerHTML = "";
    }
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">全部规则集</option>';
    }
    sets.forEach((set) => {
      const option = document.createElement("option");
      const scopeLabel = set.scope === "global" ? "全局" : "个人";
      option.value = set.id;
      option.textContent = `${set.name} 路 ${scopeLabel}`;
      ruleSetSelect.appendChild(option);
    });
    if (filterSelect) {
      filterSelect.innerHTML = "";
      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = "全部规则集";
      filterSelect.appendChild(allOption);
      sets.forEach((set) => {
        const filterOption = document.createElement("option");
        filterOption.value = set.id;
        filterOption.textContent = set.name;
        filterSelect.appendChild(filterOption);
      });
    }
  }

  populateRuleSetSelect = function populateRuleSetSelect(sets) {
    const filterSelect = $("rule-match-rule-set");
    if (!ruleSetSelect && !filterSelect) {
      return;
    }
    const buildOptions =
    appRuleSetSelectApi.buildRuleSetSelectOptions ||
      ((items = []) => {
        const editorOptions = items.map((set) => ({
          value: set.id,
          label: `${set.name} / ${set.scope === "global" ? "全局" : "个人"}`,
        }));
        return {
          editorOptions,
          filterOptions: [{ value: "", label: "全部规则集" }, ...editorOptions],
        };
      });
    const replaceOptions =
    appRuleSetSelectApi.replaceSelectOptions ||
      ((select, options) => {
        if (!select) {
          return;
        }
        select.innerHTML = "";
        options.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.value;
          option.textContent = item.label;
          select.appendChild(option);
        });
      });
    const { editorOptions, filterOptions } = buildOptions(sets || []);
    replaceOptions(ruleSetSelect, editorOptions);
    replaceOptions(filterSelect, filterOptions);
  };

  function renderRuleSets(sets) {
    renderList(
      ruleSetsList,
      sets,
      (set) => {
        const li = document.createElement("li");
        li.className = "card";
        li.innerHTML = `
          <strong>${escapeHtml(set.name)}</strong>
          <div class="meta">${escapeHtml(set.description || "暂无描述")}</div>
          <div class="meta">范围: ${escapeHtml(set.scope)} 路 状态: ${set.enabled ? "启用" : "停用"}</div>
          <div class="btn-row">
            <button class="ghost" data-action="select">选择</button>
            <button class="ghost" data-action="toggle">${set.enabled ? "停用" : "启用"}</button>
          </div>
        `;
        li.querySelector('[data-action="select"]').addEventListener("click", async () => {
          currentRuleSetId = set.id;
          if (ruleSetSelect) {
            ruleSetSelect.value = set.id;
          }
          await refreshRules(set.id);
        });
        li.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
          try {
            await window.rulesApi.updateSet(state.token, set.id, { enabled: !set.enabled });
            await refreshRuleSets();
          } catch (err) {
            console.error(err);
            flashMeta("更新规则集失败");
          }
        });
        return li;
      },
      "暂无规则集"
    );
  }

  async function refreshRules(setId) {
    const rules = await window.rulesApi.listRules(state.token, setId);
    renderRules(rules || []);
  }

  function renderRules(rules) {
    renderList(
      rulesList,
      rules,
      (rule) => {
        const li = document.createElement("li");
        li.className = "card";
        li.innerHTML = `
          <strong>${escapeHtml(rule.name)}</strong>
          <div class="meta">事件: ${escapeHtml(rule.event_type)} / 动作: ${escapeHtml(rule.action || "alert")} / 优先级: ${escapeHtml(rule.priority)}</div>
          <div class="meta">冷却: ${escapeHtml(rule.cooldown_sec)}s 路 状态: ${rule.enabled ? "启用" : "停用"}</div>
          <div class="btn-row">
            <button class="ghost" data-action="edit">编辑</button>
            <button class="ghost" data-action="delete">删除</button>
          </div>
        `;
        li.querySelector('[data-action="edit"]').addEventListener("click", () => {
          const fallbackField = getDefaultField();
          const dslFromRule = rule.dsl_json
            ? rule.dsl_json
            : window.ruleDslEditor && window.ruleDslEditor.conditionsToDsl
              ? window.ruleDslEditor.conditionsToDsl(rule.conditions || {}, fallbackField)
              : { op: "and", rules: [{ field: fallbackField, op: "gte", value: "" }] };
          currentRuleId = rule.id;
          if (ruleEditing) {
            ruleEditing.textContent = `正在编辑: ${rule.name}`;
          }
          if (ruleName) {
            ruleName.value = rule.name || "";
          }
          if (ruleEventType) {
            ruleEventType.value = rule.event_type || "motion";
          }
          currentDsl = window.ruleDslEditor
            ? window.ruleDslEditor.normalizeDsl(dslFromRule, fallbackField)
            : dslFromRule;
          renderDslBuilder();
          if (ruleCooldown) {
            ruleCooldown.value = rule.cooldown_sec ?? 0;
          }
          if (ruleAction) {
            ruleAction.value = rule.action || "alert";
          }
          if (rulePriority) {
            rulePriority.value = rule.priority ?? 100;
          }
          if (ruleEnabled) {
            ruleEnabled.checked = Boolean(rule.enabled);
          }
        });
        li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
          try {
            await window.rulesApi.deleteRule(state.token, rule.id);
            await refreshRules(currentRuleSetId);
          } catch (err) {
            console.error(err);
            flashMeta("删除规则失败");
          }
        });
        return li;
      },
      "暂无规则"
    );
  }

  function resetRuleEditor() {
    currentRuleId = null;
    if (ruleEditing) {
      ruleEditing.textContent = "创建新规则";
    }
    if (ruleName) {
      ruleName.value = "";
    }
    if (ruleCooldown) {
      ruleCooldown.value = 120;
    }
    if (ruleAction) {
      ruleAction.value = "alert";
    }
    if (rulePriority) {
      rulePriority.value = 100;
    }
    if (ruleEnabled) {
      ruleEnabled.checked = true;
    }
    resetDslEditor();
    setDslStatus(dslResult, "等待校验...", "");
  }

  if (refreshRuleSetsBtn) {
    refreshRuleSetsBtn.addEventListener("click", async () => {
      try {
        await refreshRuleSets();
      } catch (err) {
        console.error(err);
        flashMeta("刷新规则集失败");
      }
    });
  }

  if (createRuleSetBtn) {
    createRuleSetBtn.addEventListener("click", async () => {
      if (!ruleSetName || !ruleSetName.value.trim()) {
        flashMeta("请输入规则集名称");
        return;
      }
      const payload = {
        name: ruleSetName.value.trim(),
        description: ruleSetDesc?.value?.trim() || "",
        enabled: true,
        scope: ruleSetGlobal && ruleSetGlobal.checked ? "global" : "user",
      };
      try {
        await window.rulesApi.createSet(state.token, payload);
        flashMeta("规则集已创建");
        ruleSetName.value = "";
        if (ruleSetDesc) {
          ruleSetDesc.value = "";
        }
        if (ruleSetGlobal) {
          ruleSetGlobal.checked = false;
        }
        await refreshRuleSets();
      } catch (err) {
        console.error(err);
        flashMeta("创建规则集失败");
      }
    });
  }

  if (ruleSetSelect) {
    ruleSetSelect.addEventListener("change", async (evt) => {
      currentRuleSetId = evt.target.value;
      await refreshRules(currentRuleSetId);
    });
  }

  if (dslRootOp) {
    dslRootOp.addEventListener("change", (evt) => {
      if (!currentDsl) {
        return;
      }
      currentDsl.op = evt.target.value;
      updateDslPreview();
    });
  }

  if (dslAddRuleBtn) {
    dslAddRuleBtn.addEventListener("click", () => {
      if (!currentDsl) {
        resetDslEditor();
      }
      currentDsl.rules.push({ field: getDefaultField(), op: "gte", value: "" });
      renderDslBuilder();
    });
  }

  if (dslAddGroupBtn) {
    dslAddGroupBtn.addEventListener("click", () => {
      if (!currentDsl) {
        resetDslEditor();
      }
      currentDsl.rules.push({ op: "and", rules: [{ field: getDefaultField(), op: "gte", value: "" }] });
      renderDslBuilder();
    });
  }

  if (dslValidateBtn) {
    dslValidateBtn.addEventListener("click", validateDsl);
  }

  if (dslEvaluateBtn) {
    dslEvaluateBtn.addEventListener("click", evaluateDsl);
  }

  if (saveRuleBtn) {
    saveRuleBtn.addEventListener("click", async () => {
      if (!currentRuleSetId) {
        flashMeta("请先选择规则集");
        return;
      }
      if (!ruleName || !ruleName.value.trim()) {
        flashMeta("请输入规则名称");
        return;
      }
      const payload = {
        name: ruleName.value.trim(),
        enabled: ruleEnabled ? ruleEnabled.checked : true,
        priority: toNumber(rulePriority?.value, 100),
        event_type: ruleEventType?.value || "motion",
        dsl_json: currentDsl || null,
        action: ruleAction?.value || "alert",
        action_params: {},
        cooldown_sec: toNumber(ruleCooldown?.value, 120),
      };
      try {
        if (currentRuleId) {
          await window.rulesApi.updateRule(state.token, currentRuleId, payload);
          flashMeta("规则已更新");
        } else {
          await window.rulesApi.createRule(state.token, currentRuleSetId, payload);
          flashMeta("规则已创建");
        }
        resetRuleEditor();
        await refreshRules(currentRuleSetId);
      } catch (err) {
        console.error(err);
        flashMeta("保存规则失败");
      }
    });
  }

  if (resetRuleBtn) {
    resetRuleBtn.addEventListener("click", resetRuleEditor);
  }

  await loadDslMeta();
  resetDslEditor();
  await refreshRuleSets();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function bufferToBase64(buffer) {
  if (!buffer) {
    return null;
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

async function registerPush() {
  if (!("serviceWorker" in navigator)) {
    flashMeta("当前浏览器不支持推送");
    return;
  }
  try {
    const config = await fetchJson("/config", {}, false);
    if (!config.vapidPublicKey) {
      flashMeta("VAPID 公钥未配置");
      return;
    }
    const reg = await navigator.serviceWorker.register("./sw.js?v=20260417-console-copy-fix");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
    const payload = {
      platform: "web",
      endpoint: sub.endpoint,
      p256dh: bufferToBase64(sub.getKey("p256dh")),
      auth: bufferToBase64(sub.getKey("auth")),
      device_fingerprint: navigator.userAgent,
    };
    await fetchJson("/me/push-subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    flashMeta("推送订阅完成");
  } catch (err) {
    console.error(err);
    flashMeta("推送订阅失败");
  }
}

function connectWebSocket() {
  if (typeof appRealtimeClient.createRealtimeClient !== "function") {
    return null;
  }
  return appRealtimeClient.createRealtimeClient({
    apiRoot: API_ROOT,
    document,
    location,
    root: window,
    ruleMatchIndex,
    getRuleMatchFilters,
    getRuleMatchPage: () => state.ruleMatches.page || 1,
    getRuleMatchSignature: () => ruleMatchSignature,
    setRuleMatchSignature: (value) => {
      ruleMatchSignature = value;
    },
    setRuleMatchHasMore: (value) => {
      state.ruleMatches.hasMore = value;
    },
    getTrendCache: () => trendCache,
    loadOrders,
    loadAlerts,
    loadDevices,
    loadReports,
    loadTrends,
    loadRuleMatches,
    buildOrderCard,
    buildAlertCard,
    buildDeviceCard,
    buildRuleMatchCard,
    updateRuleMatchPager,
    renderTrendBars,
    renderTrendMeta,
  }).connect();
}

function bindEvents() {
  if (appEventsBound) {
    return;
  }
  appEventsBound = true;
  const importForm = $("import-form");
  if (importForm) {
    importForm.addEventListener("submit", importOrder);
  }
  const enablePush = $("enable-push");
  if (enablePush) {
    enablePush.addEventListener("click", registerPush);
  }
  const refreshDevices = $("refresh-devices");
  if (refreshDevices) {
    refreshDevices.addEventListener("click", loadDevices);
  }
  const saveConfig = $("save-config");
  if (saveConfig) {
    saveConfig.addEventListener("click", saveDeviceConfig);
  }
  const loadAuditBtn = $("load-audit");
  if (loadAuditBtn) {
    loadAuditBtn.addEventListener("click", loadAudit);
  }
  const loadHealthBtn = $("load-health");
  if (loadHealthBtn) {
    loadHealthBtn.addEventListener("click", loadHealth);
  }
  const verifyBtn = $("verify-code-btn");
  if (verifyBtn) {
    verifyBtn.addEventListener("click", verifyPickupCode);
  }
  const refreshReports = $("refresh-reports");
  if (refreshReports) {
    refreshReports.addEventListener("click", loadReports);
  }
  const trendInterval = $("trend-interval");
  if (trendInterval) {
    trendInterval.addEventListener("change", async (evt) => {
      state.reportInterval = evt.target.value;
      await loadTrends();
    });
  }
  const reportStart = $("report-start");
  const reportEnd = $("report-end");
  const clearReportRange = $("clear-report-range");
  if (reportStart) {
    reportStart.addEventListener("change", async () => {
      await loadReports();
    });
  }
  if (reportEnd) {
    reportEnd.addEventListener("change", async () => {
      await loadReports();
    });
  }
  if (clearReportRange) {
    clearReportRange.addEventListener("click", async () => {
      if (reportStart) reportStart.value = "";
      if (reportEnd) reportEnd.value = "";
      await loadReports();
    });
  }
  const exportSummary = $("export-summary");
  if (exportSummary) {
    exportSummary.addEventListener("click", async () => {
      try {
    const query = appApiParams.buildSummaryQuery
      ? appApiParams.buildSummaryQuery(getReportRangeFilters())
          : "scope=user";
        await downloadWithAuth(`/reports/summary/export?${query}`, "report-summary.csv");
      } catch (err) {
        console.error(err);
        flashMeta("导出摘要失败");
      }
    });
  }
  const exportTrends = $("export-trends");
  if (exportTrends) {
    exportTrends.addEventListener("click", async () => {
      try {
    const query = appApiParams.buildTrendsQuery
      ? appApiParams.buildTrendsQuery(getTrendFilters())
          : `scope=user&interval=${state.reportInterval || "day"}&days=7`;
        await downloadWithAuth(`/reports/trends/export?${query}`, "report-trends.csv");
      } catch (err) {
        console.error(err);
        flashMeta("导出趋势失败");
      }
    });
  }
  const exportRuleMatches = $("export-rule-matches");
  if (exportRuleMatches) {
    exportRuleMatches.addEventListener("click", async () => {
      try {
    const query = appApiParams.buildRuleMatchesExportQuery
      ? appApiParams.buildRuleMatchesExportQuery(getRuleMatchFilters(1, 200))
          : "scope=user&limit=200";
        await downloadWithAuth(`/reports/rule-matches/export?${query}`, "rule-matches.csv");
      } catch (err) {
        console.error(err);
        flashMeta("导出规则命中失败");
      }
    });
  }
  const loadRuleMatchesBtn = $("load-rule-matches");
  if (loadRuleMatchesBtn) {
    loadRuleMatchesBtn.addEventListener("click", async () => {
      await loadRuleMatches(1);
    });
  }
  const ruleMatchSearch = $("rule-match-search");
  if (ruleMatchSearch) {
    let timer = null;
    ruleMatchSearch.addEventListener("input", () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        loadRuleMatches(1);
      }, 320);
    });
  }
  const ruleMatchFilter = $("rule-match-filter");
  const ruleMatchRange = $("rule-match-range");
  const ruleMatchRuleSet = $("rule-match-rule-set");
  const ruleMatchStart = $("rule-match-start");
  const ruleMatchEnd = $("rule-match-end");
  const includeSuppressed = $("include-suppressed");
  [ruleMatchFilter, ruleMatchRange, ruleMatchRuleSet, ruleMatchStart, ruleMatchEnd].forEach((node) => {
    if (node) {
      node.addEventListener("change", async () => {
        await loadRuleMatches(1);
      });
    }
  });
  if (includeSuppressed) {
    includeSuppressed.addEventListener("change", async () => {
      await loadRuleMatches(1);
    });
  }
  const prevBtn = $("rule-matches-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      if (state.ruleMatches.page > 1) {
        await loadRuleMatches(state.ruleMatches.page - 1);
      }
    });
  }
  const nextBtn = $("rule-matches-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (state.ruleMatches.hasMore) {
        await loadRuleMatches(state.ruleMatches.page + 1);
      }
    });
  }
}

async function initApp() {
  try {
    await ensureAuth();
    await loadMe();
    await Promise.all([loadOrders(), loadAlerts(), loadDevices()]);
    await loadReports();
    await initRules();
    await loadRuleMatches(1);
    connectWebSocket();
    flashMeta("系统已就绪");
  } catch (err) {
    console.error(err);
    flashMeta("初始化失败，请稍后重试");
  }
}

function initStyleConsole() {
  const body = document.body;
  if (!body) {
    return;
  }
  const consolePanel = document.getElementById("console");
  const floatToggle = document.getElementById("console-float-toggle");
  const testToggle = document.getElementById("console-test-toggle");
  const demoToggle = document.getElementById("console-demo-toggle");
  const collapseToggle = document.getElementById("console-collapse-toggle");
  const dragHandle = document.getElementById("console-drag-handle");
  const storageKey = "tg_style_prefs";
  const floatKey = "tg_console_float";
  const positionKey = "tg_console_pos";
  const collapseKey = "tg_console_collapsed";
  const demoKey = "tg_demo_loop";
  const applyPrefs = (prefs) => {
    if (prefs.theme) {
      body.dataset.theme = prefs.theme;
    }
    if (prefs.motion) {
      body.dataset.motion = prefs.motion;
    }
    if (prefs.grid) {
      body.dataset.grid = prefs.grid;
    }
  };
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      applyPrefs(JSON.parse(cached));
    }
  } catch (err) {
    console.warn("style prefs load failed", err);
  }
  try {
    if (consolePanel) {
      const floating = localStorage.getItem(floatKey);
      if (floating === "true") {
        consolePanel.classList.add("is-floating");
      }
      const collapsed = localStorage.getItem(collapseKey);
      if (collapsed === "true") {
        consolePanel.classList.add("is-collapsed");
      }
      const demoState = localStorage.getItem(demoKey);
      if (demoState === "on") {
        consolePanel.classList.add("is-demo");
        if (demoToggle) {
          demoToggle.textContent = "停止演示";
        }
      }
      const pos = localStorage.getItem(positionKey);
      if (pos) {
        const parsed = JSON.parse(pos);
        if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") {
          consolePanel.style.transform = `translate(${parsed.x}px, ${parsed.y}px)`;
        }
      }
    }
  } catch (err) {
    console.warn("console prefs load failed", err);
  }

  const syncActive = () => {
    const theme = body.dataset.theme || "aqua";
    const motion = body.dataset.motion || "normal";
    const grid = body.dataset.grid || "normal";
    document.querySelectorAll(".swatch").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.theme === theme);
    });
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      const isMotion = btn.dataset.motion && btn.dataset.motion === motion;
      const isGrid = btn.dataset.grid && btn.dataset.grid === grid;
      btn.classList.toggle("is-active", isMotion || isGrid);
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify({ theme, motion, grid }));
    } catch (err) {
      console.warn("style prefs save failed", err);
    }
  };

  if (floatToggle && consolePanel) {
    floatToggle.addEventListener("click", () => {
      consolePanel.classList.toggle("is-floating");
      consolePanel.style.transform = "";
      try {
        localStorage.setItem(floatKey, String(consolePanel.classList.contains("is-floating")));
        localStorage.removeItem(positionKey);
      } catch (err) {
        console.warn("console float save failed", err);
      }
    });
  }

  if (testToggle) {
    testToggle.addEventListener("click", () => {
      const enabled = body.dataset.uiTest === "on";
      body.dataset.uiTest = enabled ? "off" : "on";
      if (consolePanel) {
        consolePanel.classList.toggle("is-test", !enabled);
      }
    });
  }

  if (collapseToggle && consolePanel) {
    collapseToggle.addEventListener("click", () => {
      consolePanel.classList.toggle("is-collapsed");
      const collapsed = consolePanel.classList.contains("is-collapsed");
      collapseToggle.textContent = collapsed ? "展开" : "折叠";
      try {
        localStorage.setItem(collapseKey, String(collapsed));
      } catch (err) {
        console.warn("console collapse save failed", err);
      }
    });
    collapseToggle.textContent = consolePanel.classList.contains("is-collapsed") ? "展开" : "折叠";
  }

  if (dragHandle && consolePanel) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (evt) => {
      if (!isDragging) {
        return;
      }
      const clientX = evt.clientX ?? (evt.touches && evt.touches[0]?.clientX);
      const clientY = evt.clientY ?? (evt.touches && evt.touches[0]?.clientY);
      if (clientX == null || clientY == null) {
        return;
      }
      const dx = clientX - startX;
      const dy = clientY - startY;
      const x = offsetX + dx;
      const y = offsetY + dy;
      consolePanel.style.transform = `translate(${x}px, ${y}px)`;
    };

    const stopDrag = () => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", stopDrag);
      const transform = consolePanel.style.transform;
      const rect = consolePanel.getBoundingClientRect();
      const margin = 16;
      const threshold = 32;
      let snapX = 0;
      let snapY = 0;
      const spaceRight = window.innerWidth - rect.right;
      const spaceBottom = window.innerHeight - rect.bottom;
      if (rect.left < threshold) {
        snapX = margin - rect.left;
      } else if (spaceRight < threshold) {
        snapX = (window.innerWidth - rect.width - margin) - rect.left;
      }
      if (rect.top < threshold) {
        snapY = margin - rect.top;
      } else if (spaceBottom < threshold) {
        snapY = (window.innerHeight - rect.height - margin) - rect.top;
      }
      if (transform || snapX || snapY) {
        const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform || "");
        const baseX = match ? Number(match[1]) : 0;
        const baseY = match ? Number(match[2]) : 0;
        const nextX = baseX + snapX;
        const nextY = baseY + snapY;
        consolePanel.style.transform = `translate(${nextX}px, ${nextY}px)`;
        try {
          localStorage.setItem(positionKey, JSON.stringify({ x: nextX, y: nextY }));
        } catch (err) {
          console.warn("console pos save failed", err);
        }
      }
    };

    const startDrag = (evt) => {
      if (!consolePanel.classList.contains("is-floating")) {
        return;
      }
      if (evt.cancelable) {
        evt.preventDefault();
      }
      const clientX = evt.clientX ?? (evt.touches && evt.touches[0]?.clientX);
      const clientY = evt.clientY ?? (evt.touches && evt.touches[0]?.clientY);
      if (clientX == null || clientY == null) {
        return;
      }
      const transform = consolePanel.style.transform;
      const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
      offsetX = match ? Number(match[1]) : 0;
      offsetY = match ? Number(match[2]) : 0;
      startX = clientX;
      startY = clientY;
      isDragging = true;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stopDrag);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", stopDrag);
    };

    dragHandle.addEventListener("mousedown", startDrag);
    dragHandle.addEventListener("touchstart", startDrag, { passive: false });
    dragHandle.addEventListener("dblclick", () => {
      consolePanel.style.transform = "";
      try {
        localStorage.removeItem(positionKey);
      } catch (err) {
        console.warn("console pos reset failed", err);
      }
    });
  }

  document.querySelectorAll(".swatch[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      body.dataset.theme = btn.dataset.theme;
      syncActive();
    });
  });
  document.querySelectorAll(".toggle-btn[data-motion]").forEach((btn) => {
    btn.addEventListener("click", () => {
      body.dataset.motion = btn.dataset.motion;
      syncActive();
    });
  });
  document.querySelectorAll(".toggle-btn[data-grid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      body.dataset.grid = btn.dataset.grid;
      syncActive();
    });
  });
  syncActive();
}

function initFilters() {
  const filterBars = document.querySelectorAll(".filter-bar");
  filterBars.forEach((bar) => {
    const targetSelector = bar.getAttribute("data-target");
    if (!targetSelector) {
      return;
    }
    const target = document.querySelector(targetSelector);
    if (!target) {
      return;
    }
    const buttons = Array.from(bar.querySelectorAll(".filter-btn"));
    if (buttons.length === 0) {
      return;
    }
    const applyFilter = (filters) => {
      const active = filters.filter((filter) => filter && filter !== "all");
      const items = Array.from(target.children);
      items.forEach((item) => {
        if (active.length === 0) {
          item.classList.remove("is-hidden");
          return;
        }
        const tags = (item.dataset.tags || "").split(/\s+/).filter(Boolean);
        const match = active.some((filter) => tags.includes(filter));
        item.classList.toggle("is-hidden", !match);
      });
    };
    const setActiveButtons = (activeFilters) => {
      buttons.forEach((btn) => {
        const filter = btn.dataset.filter || "";
        const isActive = filter === "all"
          ? activeFilters.length === 0
          : activeFilters.includes(filter);
        btn.classList.toggle("is-active", isActive);
        const countNode = btn.querySelector(".filter-count");
        if (countNode) {
          const count = countNode.getAttribute("data-count") || "0";
          countNode.textContent = count;
        }
      });
    };

    const updateCounts = () => {
      const items = Array.from(target.children);
      buttons.forEach((btn) => {
        const filter = btn.dataset.filter || "";
        let count = items.length;
        if (filter && filter !== "all") {
          count = items.filter((item) => {
            const tags = (item.dataset.tags || "").split(/\s+/).filter(Boolean);
            return tags.includes(filter);
          }).length;
        }
        let countNode = btn.querySelector(".filter-count");
        if (!countNode) {
          countNode = document.createElement("span");
          countNode.className = "filter-count";
          btn.appendChild(countNode);
        }
        countNode.setAttribute("data-count", String(count));
      });
    };

    updateCounts();

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter || "all";
        const active = buttons
          .filter((b) => b.classList.contains("is-active"))
          .map((b) => b.dataset.filter || "")
          .filter(Boolean);
        let next = [...active];

        if (filter === "all") {
          next = [];
        } else if (active.includes(filter)) {
          next = active.filter((item) => item !== filter);
        } else {
          next = [...active.filter((item) => item !== "all"), filter];
        }

        setActiveButtons(next);
        applyFilter(next);
      });
    });

    setActiveButtons([]);
    applyFilter([]);
  });
}

function activateWorkspacePage(id, options = {}) {
  const target = document.getElementById(id);
  if (!target) {
    return false;
  }
  const ownerId = WORKSPACE_ANCHOR_OWNER[id];
  const workspaceTarget =
    target.matches("[data-workspace-page], #overview")
      ? target
      : (ownerId ? document.getElementById(ownerId) : target.closest("[data-workspace-page]"));
  if (!workspaceTarget) {
    return false;
  }
  document.querySelectorAll("[data-workspace-page], #overview").forEach((section) => {
    section.classList.toggle("is-current-workspace", section === workspaceTarget);
  });
  document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("is-active", href === `#${id}` || href === `#${workspaceTarget.id}`);
  });
  document.body.dataset.workspace = workspaceTarget.id;
  if (options.updateHash !== false && window.history?.replaceState) {
    window.history.replaceState(null, "", `#${id}`);
  }
  if (options.scroll !== false) {
    target.scrollIntoView({ behavior: options.behavior || "smooth", block: "start" });
  }
  return true;
}

function initWorkspaceNavigation() {
  const links = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href")?.slice(1);
      if (!id || !document.getElementById(id)) {
        return;
      }
      event.preventDefault();
      activateWorkspacePage(id);
    });
  });
  const initialId = window.location.hash?.slice(1) || "overview";
  activateWorkspacePage(document.getElementById(initialId) ? initialId : "overview", {
    scroll: false,
    updateHash: Boolean(window.location.hash),
  });
  document.querySelectorAll("[data-workspace-back]").forEach((button) => {
    button.addEventListener("click", () => {
      activateWorkspacePage("overview");
      flashMeta("已返回概览");
    });
  });
}

function initLandingActions() {
  const scrollToId = (id) => activateWorkspacePage(id);

  const scrollToSection = (selector) => {
    const target = document.querySelector(selector);
    if (!target) {
      return false;
    }
    if (target.id) {
      return activateWorkspacePage(target.id);
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  };

  const bindClick = (id, handler) => {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    node.addEventListener("click", handler);
  };

  bindClick("top-docs-btn", () => {
    const ok = scrollToSection("#workflow");
    flashMeta(ok ? "已定位到流程说明区" : "未找到流程说明区");
  });

  bindClick("top-guard-btn", async () => {
    const ok = scrollToSection("#ops");
    flashMeta(ok ? "已切换到运营中枢，可直接导入订单并启动防护" : "未找到运营中枢");
    if (!ok) {
      return;
    }
    try {
      await loadDevices();
      await loadReports();
    } catch (err) {
      console.error(err);
    }
  });

  bindClick("hero-connect-btn", () => scrollToId("ops") && flashMeta("已进入订单导入区，完成导入后即可启动防护"));

  bindClick("hero-demo-btn", () => {
    scrollToId("alerts");
    flashMeta("已定位到最新告警矩阵");
  });

  bindClick("footer-health-link", async (event) => {
    event.preventDefault();
    scrollToId("ops");
    await renderSystemHealth();
  });

  bindClick("cases-view-all-btn", () => {
    const ok = scrollToSection("#gallery");
    flashMeta(ok ? "已切到场景模板区" : "未找到场景模板区");
  });

  bindClick("templates-view-all-btn", () => {
    const ok = scrollToSection("#gallery");
    flashMeta(ok ? "已切换到模板总览区" : "未找到模板总览区");
  });

  bindClick("motion-assets-btn", () => {
    const ok = scrollToSection("#motion");
    flashMeta(ok ? "已定位到动效实验区" : "未找到动效实验区");
  });

  const setTemplateSelected = (card) => {
    document.querySelectorAll(".template-card.is-selected").forEach((node) => {
      node.classList.remove("is-selected");
    });
    if (card) {
      card.classList.add("is-selected");
    }
  };

  document.querySelectorAll(".template-card").forEach((card, index) => {
    const title = card.querySelector("h3")?.textContent?.trim() || `模板 ${index + 1}`;
    const viewButton = card.querySelector("button.ghost");
    const enableButton = card.querySelector("button.primary");

    if (viewButton) {
      viewButton.addEventListener("click", () => {
        setTemplateSelected(card);
        scrollToSection("#gallery");
        flashMeta(`已查看模板：${title}`);
      });
    }

    if (enableButton) {
      enableButton.addEventListener("click", () => {
        setTemplateSelected(card);
        scrollToSection("#ops");
        flashMeta(`已选择模板：${title}，可继续在运营区接入`);
      });
    }
  });
}

function initDemoLoop() {
  const body = document.body;
  if (!body) {
    return null;
  }
  const storageKey = "tg_demo_loop";
  const label = document.getElementById("demo-bar-label");
  const beat = document.getElementById("demo-beat");
  let timer = null;
  let beatTimer = null;

  const pulseBeat = () => {
    if (!beat) {
      return;
    }
    beat.classList.remove("is-pulse");
    void beat.offsetWidth;
    beat.classList.add("is-pulse");
    if (beatTimer) {
      clearTimeout(beatTimer);
    }
    beatTimer = setTimeout(() => beat.classList.remove("is-pulse"), 600);
  };

  const enable = () => {
    body.dataset.demoLoop = "on";
    const consolePanel = document.getElementById("console");
    if (consolePanel) {
      consolePanel.classList.add("is-demo");
    }
    const groups = Array.from(document.querySelectorAll(".filter-bar")).map((bar) => {
      const buttons = Array.from(bar.querySelectorAll(".filter-btn"));
      return { bar, buttons };
    });
    let index = 0;
    if (label) {
      label.textContent = "演示未启动";
    }
    timer = setInterval(() => {
      if (body.dataset.demoPaused === "on") {
        return;
      }
      if (groups.length === 0) {
        return;
      }
      const group = groups[index % groups.length];
      const options = group.buttons.filter((btn) => btn.dataset.filter && btn.dataset.filter !== "all");
      if (options.length > 0) {
        const btn = options[Math.floor(Math.random() * options.length)];
        btn.click();
        const text = btn.textContent || "";
        const barLabel = group.bar.getAttribute("data-filter-bar") || "筛选";
        if (label) {
          label.textContent = `${barLabel} / ${text}`;
        }
        pulseBeat();
      }
      index += 1;
      const targetSelector = group.bar.getAttribute("data-target");
      if (targetSelector) {
        const target = document.querySelector(targetSelector);
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 3200);
  };

  const disable = () => {
    body.dataset.demoLoop = "off";
    body.dataset.demoPaused = "off";
    const consolePanel = document.getElementById("console");
    if (consolePanel) {
      consolePanel.classList.remove("is-demo");
      consolePanel.classList.remove("is-paused");
    }
    if (label) {
      label.textContent = "演示未启动";
    }
    if (beat) {
      beat.classList.remove("is-pulse");
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (beatTimer) {
      clearTimeout(beatTimer);
      beatTimer = null;
    }
  };

  const pause = () => {
    body.dataset.demoPaused = "on";
  };

  const resume = () => {
    body.dataset.demoPaused = "off";
  };

  try {
    const cached = localStorage.getItem(storageKey);
    if (cached === "on") {
      enable();
    }
  } catch (err) {
    console.warn("demo loop load failed", err);
  }

  return {
    toggle() {
      if (body.dataset.demoLoop === "on") {
        disable();
        try {
          localStorage.setItem(storageKey, "off");
        } catch (err) {
          console.warn("demo loop save failed", err);
        }
      } else {
        enable();
        try {
          localStorage.setItem(storageKey, "on");
        } catch (err) {
          console.warn("demo loop save failed", err);
        }
      }
    },
    pause,
    resume,
  };
}

function initReveal() {
  const items = Array.from(document.querySelectorAll("[data-reveal]"));
  if (items.length === 0) {
    return;
  }
  const markVisible = (el, delayMs) => {
    if (delayMs) {
      setTimeout(() => el.classList.add("is-visible"), delayMs);
    } else {
      el.classList.add("is-visible");
    }
  };
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            markVisible(entry.target);
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    items.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 0.08, 0.6)}s`;
      observer.observe(item);
    });
  } else {
    items.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 0.08, 0.6)}s`;
      markVisible(item, index * 80);
    });
  }
}

function initScrollState() {
  const topbar = document.querySelector(".topbar");
  const navLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
  const sections = navLinks
    .map((link) => {
      const target = document.querySelector(link.getAttribute("href"));
      return target ? { link, target } : null;
    })
    .filter(Boolean);

  const updateTopbar = () => {
    if (!topbar) {
      return;
    }
    topbar.classList.toggle("is-scrolled", window.scrollY > 18);
  };

  const updateActiveSection = () => {
    if (sections.length === 0) {
      return;
    }
    const probe = window.scrollY + window.innerHeight * 0.28;
    let activeLink = sections[0].link;
    sections.forEach(({ link, target }) => {
      if (target.offsetTop <= probe) {
        activeLink = link;
      }
    });
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link === activeLink);
    });
  };

  const sync = () => {
    updateTopbar();
    updateActiveSection();
  };

  sync();
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", updateActiveSection);
}

document.addEventListener("DOMContentLoaded", () => {
  initHeroMeta();
  initStyleConsole();
  initFilters();
  initLandingActions();
  initWorkspaceNavigation();
  const demo = initDemoLoop();
  initReveal();
  initScrollState();
  bindEvents();
  initApp();
  const demoToggle = document.getElementById("console-demo-toggle");
  const demoPause = document.getElementById("console-demo-pause");
  if (demoToggle && demo) {
    demoToggle.addEventListener("click", () => {
      demo.toggle();
      demoToggle.textContent = document.body.dataset.demoLoop === "on" ? "停止演示" : "启动演示";
    });
    demoToggle.textContent = document.body.dataset.demoLoop === "on" ? "停止演示" : "启动演示";
  }
  if (demoPause && demo) {
    demoPause.addEventListener("click", () => {
      const paused = document.body.dataset.demoPaused === "on";
      if (paused) {
        demo.resume();
        demoPause.textContent = "暂停";
        document.getElementById("console")?.classList.remove("is-paused");
      } else {
        demo.pause();
        demoPause.textContent = "继续";
        document.getElementById("console")?.classList.add("is-paused");
      }
    });
  }
  if (demoPause && document.body.dataset.demoLoop === "on") {
    const paused = document.body.dataset.demoPaused === "on";
    demoPause.textContent = paused ? "继续" : "暂停";
  }
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "k" && (evt.ctrlKey || evt.metaKey)) {
      const panel = document.getElementById("console");
      if (panel) {
        panel.classList.toggle("is-hidden");
      }
      evt.preventDefault();
    }
  });
});

