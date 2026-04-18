const API_BASE_URL = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:18000/api/v1";
const API_ROOT = API_BASE_URL.replace(/\/api\/v1$/, "");
const DEMO_ACCOUNT = { phone: "demo-user", password: "demo-pass", name: "Demo" };

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
const apiParams = window.apiParams || {};
const alertActionsApi = window.alertActions || {};
const ruleSetSelectApi = window.ruleSetSelect || {};
const reportMapping = window.reportMapping || {
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
  if (heroMetaTimer) {
    clearTimeout(heroMetaTimer);
  }
  heroMetaTimer = setTimeout(() => {
    node.textContent = heroMetaDefault;
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

async function ensureAuth() {
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
    throw new Error("鐧诲綍澶辫触");
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
  item.className = "card";
  item.innerHTML = `<span class="meta">${escapeHtml(message)}</span>`;
  listEl.appendChild(item);
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
    const data = await fetchJson("/orders");
    renderOrders(data.orders || []);
  });
}

function renderOrders(orders) {
  const listEl = $("orders-list");
  renderList(
    listEl,
    orders,
    (order) => {
      const li = document.createElement("li");
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
      li.querySelector('[data-action="deliver"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/integrations/mock/delivered/${order.id}`, { method: "POST" });
          flashMeta("模拟送达完成");
          await loadOrders();
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta("模拟送达失败");
        }
      });
      li.querySelector('[data-action="arm"]').addEventListener("click", async () => {
        try {
          const res = await fetchJson(`/orders/${order.id}/arm`, { method: "POST" });
          flashMeta(`监控会话已启动：${res.session_id}`);
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta("启动监控失败");
        }
      });
      li.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/orders/${order.id}/confirm-pickup`, { method: "POST" });
          flashMeta("已确认取餐");
          await loadAlerts();
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta("确认取餐失败");
        }
      });
      li.querySelector('[data-action="timeline"]').addEventListener("click", async () => {
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
      });
      return li;
    },
    "暂无订单"
  );
}

async function loadAlerts() {
  return withInFlight("alerts", async () => {
    const data = await fetchJson("/alerts");
    renderAlerts(data.alerts || []);
  });
}

async function runAlertAction(alertId, action) {
  const getMeta =
    alertActionsApi.getAlertActionMeta ||
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

function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  renderList(
    listEl,
    alerts,
    (alert) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = alert.id;
      li.innerHTML = `
        <strong>${escapeHtml(getAlertSummary(alert) || alert.alert_type)} 路 ${escapeHtml(alert.level)}</strong>
        <div class="meta">状态: ${escapeHtml(alert.status)} 路 时间: ${escapeHtml(formatDate(getAlertTimestamp(alert)))}</div>
        <div class="meta">订单: ${escapeHtml(alert.order_id)}</div>
        <div class="btn-row">
          <button class="ghost" data-action="detail">详情</button>
          <button class="ghost" data-action="ack">确认</button>
          <button class="ghost" data-action="resolve">结案</button>
          <button class="ghost" data-action="false">误报</button>
          <button class="primary" data-action="evidence">取证</button>
        </div>
      `;
      li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
        await loadAlertDetail(alert.id);
      });
      li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/alerts/${alert.id}/ack`, { method: "POST" });
          flashMeta("告警已确认");
          await loadAlerts();
        } catch (err) {
          console.error(err);
          flashMeta("告警确认失败");
        }
      });
      li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/alerts/${alert.id}/resolve`, { method: "POST" });
          flashMeta("告警已结案");
          await loadAlerts();
        } catch (err) {
          console.error(err);
          flashMeta("告警结案失败");
        }
      });
      li.querySelector('[data-action="false"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/alerts/${alert.id}/false-positive`, { method: "POST" });
          flashMeta("已标记为误报");
          await loadAlerts();
        } catch (err) {
          console.error(err);
          flashMeta("误报标记失败");
        }
      });
      li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
        await generateEvidence(alert.id);
      });
      return li;
    },
    "暂无告警"
  );
}

renderAlerts = function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  renderList(
    listEl,
    alerts,
    (alert) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = alert.id;
      li.innerHTML = `
        <strong>${escapeHtml(getAlertSummary(alert) || alert.alert_type)} / ${escapeHtml(alert.level)}</strong>
        <div class="meta">状态: ${escapeHtml(alert.status)} / 时间: ${escapeHtml(formatDate(getAlertTimestamp(alert)))}</div>
        <div class="meta">订单: ${escapeHtml(alert.order_id)}</div>
        <div class="btn-row">
          <button class="ghost" data-action="detail">详情</button>
          <button class="ghost" data-action="ack">确认</button>
          <button class="ghost" data-action="resolve">结案</button>
          <button class="ghost" data-action="false">误报</button>
          <button class="primary" data-action="evidence">取证</button>
        </div>
      `;
      li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
        await loadAlertDetail(alert.id);
      });
      li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "ack");
      });
      li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "resolve");
      });
      li.querySelector('[data-action="false"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "false_positive");
      });
      li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
        await generateEvidence(alert.id);
      });
      return li;
    },
    "暂无告警"
  );
};

async function loadAlertDetail(alertId) {
  try {
    const detail = await fetchJson(`/alerts/${alertId}`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(detail, null, 2);
    }
    const mediaList = $("alert-media");
    if (mediaList) {
      mediaList.innerHTML = "";
      if (!detail.media || detail.media.length === 0) {
        mediaList.innerHTML = `<div class="meta">暂无证据媒体</div>`;
      } else {
        detail.media.forEach((media) => {
          const img = document.createElement("img");
          img.src = `${API_ROOT}${media.download_url}`;
          img.alt = media.type || "media";
          mediaList.appendChild(img);
        });
      }
    }
    flashMeta("告警详情已加载");
  } catch (err) {
    console.error(err);
    flashMeta("加载告警详情失败");
  }
}

async function generateEvidence(alertId) {
  try {
    const res = await fetchJson(`/evidence/${alertId}/generate`, { method: "POST" });
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    flashMeta("取证包生成完成");
  } catch (err) {
    console.error(err);
    flashMeta("生成取证包失败");
  }
}

async function loadDevices() {
  return withInFlight("devices", async () => {
    const devices = await fetchJson("/devices");
    renderDevices(devices || []);
    if (!state.deviceId && devices && devices.length > 0) {
      await selectDevice(devices[0]);
    }
  });
}

function renderDevices(devices) {
  const listEl = $("devices-list");
  renderList(
    listEl,
    devices,
    (device) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = device.id;
      li.innerHTML = `
        <strong>${escapeHtml(getDeviceSummary(device) || device.name)}</strong>
        <div class="meta">类型: ${escapeHtml(device.device_type)} 路 状态: ${escapeHtml(device.status)} 路 更新: ${escapeHtml(formatDate(getDeviceTimestamp(device)))}</div>
        <div class="btn-row">
          <button class="ghost" data-action="select">选择</button>
        </div>
      `;
      li.querySelector('[data-action="select"]').addEventListener("click", async () => {
        await selectDevice(device);
      });
      return li;
    },
    "暂无设备"
  );
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
    flashMeta("加载健康信息失败");
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
    await fetchJson(`/devices/${state.deviceId}/config`, {
      method: "PATCH",
      body: JSON.stringify({
        sensitivity: {
          min_motion_score: minMotion,
          max_weight_drop: maxDrop,
        },
      }),
    });
    flashMeta("配置已保存");
  } catch (err) {
    console.error(err);
    flashMeta("淇濆瓨閰嶇疆澶辫触");
  }
}


saveDeviceConfig = async function saveDeviceConfig() {
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
    flashMeta(getErrorMessage(err, "淇濆瓨閰嶇疆澶辫触"));
  }
};

loadAlertDetail = async function loadAlertDetail(alertId) {
  try {
    const detail = await fetchJson(`/alerts/${alertId}`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(detail, null, 2);
    }
    const mediaList = $("alert-media");
    if (mediaList) {
      mediaList.innerHTML = "";
      if (!detail.media || detail.media.length === 0) {
        mediaList.innerHTML = '<div class="meta">暂无证据媒体</div>';
      } else {
        detail.media.forEach((media) => {
          const img = document.createElement("img");
          img.src = `${API_ROOT}${media.download_url}`;
          img.alt = media.type || "media";
          mediaList.appendChild(img);
        });
      }
    }
    flashMeta("告警详情已加载");
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "加载告警详情失败"));
  }
};

generateEvidence = async function generateEvidence(alertId) {
  try {
    const res = await fetchJson(`/evidence/${alertId}/generate`, { method: "POST" });
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    flashMeta("取证包生成完成");
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "生成取证包失败"));
  }
};

renderDevices = function renderDevices(devices) {
  const listEl = $("devices-list");
  renderList(
    listEl,
    devices,
    (device) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = device.id;
      li.innerHTML = `
        <strong>${escapeHtml(getDeviceSummary(device) || device.name)}</strong>
        <div class="meta">类型: ${escapeHtml(device.device_type)} / 状态: ${escapeHtml(device.status)} / 更新时间: ${escapeHtml(formatDate(getDeviceTimestamp(device)))}</div>
        <div class="btn-row">
          <button class="ghost" data-action="select">选择</button>
        </div>
      `;
      li.querySelector('[data-action="select"]').addEventListener("click", async () => {
        await selectDevice(device);
      });
      return li;
    },
    "暂无设备"
  );
};

selectDevice = async function selectDevice(device) {
  state.deviceId = device.id;
  state.deviceCode = device.device_code || state.deviceCode;
  const selected = $("selected-device");
  if (selected) {
    selected.textContent = `当前选择：${device.name || device.id}`;
  }
  await loadDeviceConfig(device.id);
};

loadDeviceConfig = async function loadDeviceConfig(deviceId) {
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
    flashMeta(getErrorMessage(err, "加载设备配置失败"));
  }
};

loadHealth = async function loadHealth() {
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
};

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
  if (!merchant && !summary) {
    flashMeta("请输入商家或商品摘要");
    return;
  }
  try {
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
    await loadOrders();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta("订单导入失败");
  }
}

async function loadReports() {
  return withInFlight("reports", async () => {
    try {
      const summaryQuery = apiParams.buildSummaryQuery
        ? apiParams.buildSummaryQuery(getReportRangeFilters())
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
  const normalized = reportMapping.normalizeSummary
    ? reportMapping.normalizeSummary(summary)
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
    const query = apiParams.buildTrendsQuery
      ? apiParams.buildTrendsQuery(getTrendFilters())
      : `scope=user&interval=${state.reportInterval || "day"}&days=7`;
    const trends = await fetchJson(`/reports/trends?${query}`);
    renderTrends(trends || {});
  });
}

function renderTrends(trends) {
  const normalized = reportMapping.normalizeTrends
    ? reportMapping.normalizeTrends(trends)
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
      <div class="meta"><span>浼氳瘽</span><strong>${escapeHtml(row.session_id || "-")}</strong></div>
      <div class="meta"><span>命中时间</span><strong>${escapeHtml(formatDate(row.matched_at || row.updated_at))}</strong></div>
    </div>
    <pre class="code audit-card-code">${escapeHtml(JSON.stringify({ conditions: row.conditions, metrics: row.metrics || row.metrics_json, note: row.note }, null, 2))}</pre>
  `;
  return li;
}

async function loadRuleMatches(page = 1) {
  const filters = getRuleMatchFilters(page);
  const limit = filters.limit;
  const query = apiParams.buildRuleMatchesQuery
    ? apiParams.buildRuleMatchesQuery(filters)
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
    addGroupBtn.textContent = "娣诲姞瀛愮粍";
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
      ruleSetSelectApi.buildRuleSetSelectOptions ||
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
      ruleSetSelectApi.replaceSelectOptions ||
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
          <div class="meta">浜嬩欢: ${escapeHtml(rule.event_type)} 路 鍔ㄤ綔: ${escapeHtml(rule.action || "alert")} 路 浼樺厛绾? ${escapeHtml(rule.priority)}</div>
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
  let wsUrl = "";
  try {
    const apiRoot = new URL(API_ROOT);
    const wsProtocol = apiRoot.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProtocol}//${apiRoot.host}/ws/alerts`;
  } catch (err) {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    wsUrl = `${protocol}://${location.hostname}:18000/ws/alerts`;
  }
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    try {
      ws.send(JSON.stringify({ subscribe: ["order", "alert", "device", "rule"] }));
    } catch (err) {
      console.warn("ws subscribe failed", err);
    }
  };
  let pending = { orders: false, alerts: false, devices: false, reports: false };
  const throttleFactory = window.wsThrottle && window.wsThrottle.createThrottle
    ? window.wsThrottle.createThrottle
    : null;
  const throttleOrders = throttleFactory ? throttleFactory(200, async () => {
    if (document.hidden) {
      return;
    }
    if (pending.orders) {
      pending.orders = false;
      await loadOrders();
    }
  }) : null;
  const throttleAlerts = throttleFactory ? throttleFactory(200, async () => {
    if (document.hidden) {
      return;
    }
    if (pending.alerts) {
      pending.alerts = false;
      await loadAlerts();
    }
  }) : null;
  const throttleDevices = throttleFactory ? throttleFactory(500, async () => {
    if (document.hidden) {
      return;
    }
    if (pending.devices) {
      pending.devices = false;
      await loadDevices();
    }
  }) : null;
  const throttleReports = throttleFactory ? throttleFactory(800, async () => {
    if (document.hidden) {
      return;
    }
    if (pending.reports) {
      pending.reports = false;
      await loadReports();
    }
  }) : null;

  const mark = (type) => {
    if (type === "order") {
      pending.orders = true;
      pending.reports = true;
      if (throttleOrders) {
        throttleOrders();
      }
      if (throttleReports) {
        throttleReports();
      }
    } else if (type === "alert") {
      pending.alerts = true;
      pending.reports = true;
      if (throttleAlerts) {
        throttleAlerts();
      }
      if (throttleReports) {
        throttleReports();
      }
    } else if (type === "device") {
      pending.devices = true;
      pending.reports = true;
      if (throttleDevices) {
        throttleDevices();
      }
      if (throttleReports) {
        throttleReports();
      }
    } else if (type === "reports") {
      pending.reports = true;
      if (throttleReports) {
        throttleReports();
      }
    } else {
      pending.alerts = true;
      pending.reports = true;
      if (throttleAlerts) {
        throttleAlerts();
      }
      if (throttleReports) {
        throttleReports();
      }
    }
  };

  const trimList = (listId, max) => {
    if (!max || max <= 0) {
      return;
    }
    const list = $(listId);
    if (!list) {
      return;
    }
    const items = Array.from(list.children);
    const limiter = window.listLimit && window.listLimit.enforceListLimit
      ? window.listLimit.enforceListLimit
      : null;
    const keep = limiter ? limiter(items, max) : items.slice(0, max);
    keep.forEach((node) => {
      if (node && node.parentElement !== list) {
        list.appendChild(node);
      }
    });
    const removed = items.slice(keep.length);
    removed.forEach((node) => {
      node.remove();
    });
    if (listId === "rule-matches-list" && window.ruleMatchIndex && window.ruleMatchIndex.removeIndexForNodes) {
      window.ruleMatchIndex.removeIndexForNodes(ruleMatchIndex, removed);
    }
  };

  const mergeListItem = (listId, itemId, build) => {
    const list = $(listId);
    if (!list) {
      return;
    }
    if (!itemId) {
      if (listId === "orders-list") {
        mark("order");
      } else if (listId === "alerts-list") {
        mark("alert");
      } else if (listId === "devices-list") {
        mark("device");
      } else if (listId === "rule-matches-list") {
        mark("reports");
      }
      return;
    }
    const selector = `[data-id="${itemId}"]`;
    const existing = list.querySelector(selector);
    const node = build();
    if (existing) {
      existing.replaceWith(node);
    } else {
      list.prepend(node);
    }
    if (listId === "rule-matches-list") {
      const id = node && node.dataset ? node.dataset.id : null;
      if (id) {
        ruleMatchIndex.set(String(id), node);
      }
    }
    if (listId === "orders-list") {
      trimList("orders-list", 100);
    } else if (listId === "alerts-list") {
      trimList("alerts-list", 100);
    } else if (listId === "rule-matches-list") {
      trimList("rule-matches-list", 200);
    }
  };

  const buildDeviceCard = (device) => {
    const li = document.createElement("li");
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
    li.querySelector('[data-action="select"]').addEventListener("click", async () => {
      await selectDevice(device);
    });
    return li;
  };

  const buildRuleMatchCard = (row) => {
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
        <div class="meta"><span>浼氳瘽</span><strong>${escapeHtml(row.session_id || "-")}</strong></div>
        <div class="meta"><span>命中时间</span><strong>${escapeHtml(formatDate(row.matched_at || row.updated_at))}</strong></div>
      </div>
      <pre class="code audit-card-code">${escapeHtml(JSON.stringify({ conditions: row.conditions, metrics: row.metrics || row.metrics_json, note: row.note }, null, 2))}</pre>
    `;
    return li;
  };

  const buildOrderCard = (order) => {
    const li = document.createElement("li");
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
    li.querySelector('[data-action="deliver"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/integrations/mock/delivered/${order.id}`, { method: "POST" });
        flashMeta("模拟送达完成");
        await loadOrders();
        await loadReports();
      } catch (err) {
        console.error(err);
        flashMeta("模拟送达失败");
      }
    });
    li.querySelector('[data-action="arm"]').addEventListener("click", async () => {
      try {
        const res = await fetchJson(`/orders/${order.id}/arm`, { method: "POST" });
        flashMeta(`监控会话已启动：${res.session_id}`);
        await loadOrders();
        await loadReports();
      } catch (err) {
        console.error(err);
        flashMeta("启动监控失败");
      }
    });
    li.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
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
    });
    li.querySelector('[data-action="timeline"]').addEventListener("click", async () => {
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
    });
    return li;
  };

  let buildAlertCard = (alert) => {
    const li = document.createElement("li");
    li.className = "card audit-card alert-event-card";
    li.dataset.id = alert.id;
    li.innerHTML = `
      <div class="audit-card-head">
        <div class="audit-card-title">
          <strong>${escapeHtml(getAlertSummary(alert) || alert.alert_type)} 路 ${escapeHtml(alert.level || "-")}</strong>
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
    li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
      await loadAlertDetail(alert.id);
    });
    li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/alerts/${alert.id}/ack`, { method: "POST" });
        flashMeta("告警已确认");
        await loadAlerts();
      } catch (err) {
        console.error(err);
        flashMeta("告警确认失败");
      }
    });
    li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/alerts/${alert.id}/resolve`, { method: "POST" });
        flashMeta("告警已结案");
        await loadAlerts();
      } catch (err) {
        console.error(err);
        flashMeta("告警结案失败");
      }
    });
    li.querySelector('[data-action="false"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/alerts/${alert.id}/false-positive`, { method: "POST" });
        flashMeta("已标记为误报");
        await loadAlerts();
      } catch (err) {
        console.error(err);
        flashMeta("误报标记失败");
      }
    });
    li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
      await generateEvidence(alert.id);
    });
    return li;
  };

  buildAlertCard = (alert) => {
    const li = document.createElement("li");
    li.className = "card audit-card alert-event-card";
    li.dataset.id = alert.id;
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
    li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
      await loadAlertDetail(alert.id);
    });
    li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "ack");
    });
    li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "resolve");
    });
    li.querySelector('[data-action="false"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "false_positive");
    });
    li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
      await generateEvidence(alert.id);
    });
    return li;
  };

  ws.onmessage = async (evt) => {
    const message = (evt.data || "").toString();
    let payload = null;
    try {
      payload = JSON.parse(message);
    } catch (err) {
      payload = null;
    }
    const eventType = payload && typeof payload.type === "string" ? payload.type : message;
    if (payload && payload.payload) {
      const payloadData = payload.payload;
      const entityType = payloadData.entity_type || payloadData.entityType || "";
      const entity = payloadData.entity || null;
      if ((entityType === "order" || eventType.includes("order")) && (entity || payloadData.order)) {
        const order = entity || payloadData.order;
        mergeListItem("orders-list", order.id, () => buildOrderCard(order));
        mark("order");
        return;
      }
      if ((entityType === "alert" || eventType.includes("alert")) && (entity || payloadData.alert)) {
        const alert = entity || payloadData.alert;
        mergeListItem("alerts-list", alert.id, () => buildAlertCard(alert));
        mark("alert");
        return;
      }
      if ((entityType === "device" || eventType.includes("device")) && (entity || payloadData.device)) {
        const device = entity || payloadData.device;
        mergeListItem("devices-list", device.id, () => buildDeviceCard(device));
        mark("device");
        return;
      }
      if ((entityType === "rule_match" || eventType.includes("rule")) && (entity || payloadData.match)) {
        const match = entity || payloadData.match;
        const filters = getRuleMatchFilters(state.ruleMatches.page || 1);
        const signature = window.ruleMatchIndex && window.ruleMatchIndex.buildFilterSignature
          ? window.ruleMatchIndex.buildFilterSignature(filters)
          : "";
        const acceptSignature = window.ruleMatchIndex && window.ruleMatchIndex.shouldAcceptIncremental
          ? window.ruleMatchIndex.shouldAcceptIncremental(ruleMatchSignature, signature)
          : true;
        if (!acceptSignature) {
          ruleMatchSignature = signature;
          await loadRuleMatches(1);
          return;
        }
        ruleMatchSignature = signature;
        if (!match.id) {
          await loadRuleMatches(1);
          return;
        }
        const canInsert = window.wsLogic && window.wsLogic.shouldInsertRuleMatch
          ? window.wsLogic.shouldInsertRuleMatch(match, filters, new Date())
          : true;
        if (canInsert) {
          mergeListItem("rule-matches-list", match.id, () => buildRuleMatchCard(match));
          state.ruleMatches.hasMore = true;
          updateRuleMatchPager();
        }
        if (!match.matched_at) {
          await loadTrends();
          return;
        }
        if (!trendCache || !window.trendCache || !window.trendCache.applyRuleMatchIncrement) {
          await loadTrends();
          return;
        }
        const applied = window.trendCache.applyRuleMatchIncrement(trendCache, match.matched_at);
        if (applied) {
          renderTrendBars($("trend-rule-matches"), trendCache.rule_matches || [], "rules");
          renderTrendMeta($("trend-rules-meta"), trendCache.rule_matches || []);
        } else {
          await loadTrends();
        }
        return;
      }
    }
    if (eventType && eventType.includes("rule")) {
      await loadRuleMatches(state.ruleMatches.page || 1);
      return;
    }
    if (eventType.includes("alert")) {
      mark("alert");
    } else if (eventType.includes("order")) {
      mark("order");
    } else if (eventType.includes("device")) {
      mark("device");
    } else {
      mark("unknown");
    }
  };
  ws.onclose = () => {
    setTimeout(connectWebSocket, 5000);
  };

  const flushPending = async () => {
    if (document.hidden) {
      return;
    }
    const snapshot = { ...pending };
    pending = { orders: false, alerts: false, devices: false, reports: false };
    if (snapshot.orders) {
      await loadOrders();
    }
    if (snapshot.alerts) {
      await loadAlerts();
    }
    if (snapshot.devices) {
      await loadDevices();
    }
    if (snapshot.reports) {
      await loadReports();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      flushPending();
    }
  });
}

function bindEvents() {
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
        const query = apiParams.buildSummaryQuery
          ? apiParams.buildSummaryQuery(getReportRangeFilters())
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
        const query = apiParams.buildTrendsQuery
          ? apiParams.buildTrendsQuery(getTrendFilters())
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
        const query = apiParams.buildRuleMatchesExportQuery
          ? apiParams.buildRuleMatchesExportQuery(getRuleMatchFilters(1, 200))
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

function initLandingActions() {
  const scrollToSection = (selector) => {
    const target = document.querySelector(selector);
    if (!target) {
      return false;
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

  bindClick("hero-connect-btn", () => {
    const ok = scrollToSection("#ops");
    flashMeta(ok ? "已进入接入区，先导入订单再启用推送" : "未找到接入区");
  });

  bindClick("hero-demo-btn", () => {
    const toggle = document.getElementById("console-demo-toggle");
    if (toggle) {
      toggle.click();
      flashMeta(document.body.dataset.demoLoop === "on" ? "演示模式已启动" : "演示模式已关闭");
      return;
    }
    flashMeta("未找到演示模式控制");
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

const setSelectedAlertCard = (alertId) => {
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
};

const setEvidenceBayState = ({ loaded = false, evidence = false } = {}) => {
  const detailPanel = document.querySelector("#alert-detail .evidence-bay-panel");
  if (!detailPanel) {
    return;
  }
  detailPanel.classList.toggle("is-loaded", loaded);
  detailPanel.classList.toggle("is-evidence", evidence);
};

renderAlerts = function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  const activeAlertId = document.querySelector("#alert-detail .evidence-bay-panel")?.dataset.alertId || "";
  renderList(
    listEl,
    alerts,
    (alert) => {
      const li = document.createElement("li");
      li.className = "card audit-card alert-event-card";
      li.dataset.id = alert.id;
      if (String(alert.id || "") === activeAlertId) {
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
      li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
        setSelectedAlertCard(alert.id);
        await loadAlertDetail(alert.id);
      });
      li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "ack");
      });
      li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "resolve");
      });
      li.querySelector('[data-action="false"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "false_positive");
      });
      li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
        setSelectedAlertCard(alert.id);
        await generateEvidence(alert.id);
      });
      return li;
    },
    "暂无告警"
  );
};

loadAlertDetail = async function loadAlertDetail(alertId) {
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
      mediaList.innerHTML = "";
      if (!detail.media || detail.media.length === 0) {
        mediaList.innerHTML = '<div class="meta">暂无证据媒体</div>';
      } else {
        detail.media.forEach((media) => {
          const img = document.createElement("img");
          img.src = `${API_ROOT}${media.download_url}`;
          img.alt = media.type || "media";
          mediaList.appendChild(img);
        });
      }
    }
    setEvidenceBayState({ loaded: true, evidence: false });
    flashMeta("告警详情已加载");
  } catch (err) {
    console.error(err);
    setEvidenceBayState({ loaded: false, evidence: false });
    flashMeta(getErrorMessage(err, "加载告警详情失败"));
  }
};

generateEvidence = async function generateEvidence(alertId) {
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
};

/*

renderTrendBars = function renderTrendBars(container, rows, variant) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!rows || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "鏆傛棤瓒嬪娍鏁版嵁";
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
};

renderTrendMeta = function renderTrendMeta(container, rows) {
  if (!container) {
    return;
  }
  if (!rows || rows.length === 0) {
    container.textContent = "鏆傛棤缁熻";
    return;
  }
  const total = rows.reduce((sum, r) => sum + toNumber(r.count, 0), 0);
  const peak = Math.max(...rows.map((r) => toNumber(r.count, 0)), 0);
  container.innerHTML = `<span>鎬昏 <strong>${escapeHtml(total)}</strong></span><span>宄板€?<strong>${escapeHtml(peak)}</strong></span>`;
};

loadRuleMatches = async function loadRuleMatches(page = 1) {
  const filters = getRuleMatchFilters(page);
  const limit = filters.limit;
  const query = apiParams.buildRuleMatchesQuery
    ? apiParams.buildRuleMatchesQuery(filters)
    : `limit=${limit}&offset=${filters.offset}`;
  try {
    const rows = await fetchJson(`/rules/matches?${query}`);
    state.ruleMatches.page = page;
    state.ruleMatches.hasMore = Array.isArray(rows) && rows.length === limit;
    if (window.ruleMatchIndex && window.ruleMatchIndex.buildFilterSignature) {
      ruleMatchSignature = window.ruleMatchIndex.buildFilterSignature(filters);
    }
    renderRuleMatches(rows || []);
    updateRuleMatchPager();
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鍔犺浇瑙勫垯鍛戒腑澶辫触"));
  }
};

renderRuleMatches = function renderRuleMatches(rows) {
  const listEl = $("rule-matches-list");
  renderList(listEl, rows, buildRuleMatchCard, "鏆傛棤瑙勫垯鍛戒腑");
  if (window.ruleMatchIndex && window.ruleMatchIndex.rebuildIndex) {
    ruleMatchIndex = window.ruleMatchIndex.rebuildIndex(listEl);
  } else {
    ruleMatchIndex = new Map();
  }
};

updateRuleMatchPager = function updateRuleMatchPager() {
  const pageLabel = $("rule-matches-page");
  if (pageLabel) {
    pageLabel.textContent = `绗?${state.ruleMatches.page} 椤礰;
  }
  const prevBtn = $("rule-matches-prev");
  const nextBtn = $("rule-matches-next");
  if (prevBtn) {
    prevBtn.disabled = state.ruleMatches.page <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = !state.ruleMatches.hasMore;
  }
};

renderOrders = function renderOrders(orders) {
  const listEl = $("orders-list");
  renderList(
    listEl,
    orders,
    (order) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = order.id;
      li.innerHTML = `
        <strong>${escapeHtml(order.provider)} / ${escapeHtml(order.status)}</strong>
        <div class="meta">璁㈠崟 ID锛?{escapeHtml(order.id)}</div>
        <div class="meta">${escapeHtml(formatPair(order.merchant_name || "-", getOrderSummary(order) || "-"))}</div>
        <div class="meta">閫佽揪鏃堕棿锛?{escapeHtml(formatDate(getOrderTimestamp(order)))} / 棰勮鍙栭锛?{escapeHtml(formatDate(order.expected_pickup_by))}</div>
        <div class="meta">鍏宠仈浼氳瘽锛?{escapeHtml(order.latest_session_id || "-")}</div>
        <div class="btn-row">
          <button class="ghost" data-action="deliver">妯℃嫙閫佽揪</button>
          <button class="primary" data-action="arm">鍚姩鐩戞帶</button>
          <button class="ghost" data-action="confirm">纭鍙栭</button>
          <button class="ghost" data-action="timeline">鏌ョ湅鏃堕棿绾?/button>
        </div>
      `;
      li.querySelector('[data-action="deliver"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/integrations/mock/delivered/${order.id}`, { method: "POST" });
          flashMeta("妯℃嫙閫佽揪瀹屾垚");
          await loadOrders();
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta(getErrorMessage(err, "妯℃嫙閫佽揪澶辫触"));
        }
      });
      li.querySelector('[data-action="arm"]').addEventListener("click", async () => {
        try {
          const res = await fetchJson(`/orders/${order.id}/arm`, { method: "POST" });
          flashMeta(`鐩戞帶浼氳瘽宸插惎鍔細${res.session_id || "-"}`);
          await loadOrders();
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta(getErrorMessage(err, "鍚姩鐩戞帶澶辫触"));
        }
      });
      li.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
        try {
          await fetchJson(`/orders/${order.id}/confirm-pickup`, { method: "POST" });
          flashMeta("宸茬‘璁ゅ彇椁?);
          await loadOrders();
          await loadAlerts();
          await loadReports();
        } catch (err) {
          console.error(err);
          flashMeta(getErrorMessage(err, "纭鍙栭澶辫触"));
        }
      });
      li.querySelector('[data-action="timeline"]').addEventListener("click", async () => {
        try {
          const timeline = await fetchJson(`/orders/${order.id}/timeline`);
          const output = $("alert-detail-output");
          if (output) {
            output.textContent = JSON.stringify(timeline, null, 2);
          }
          flashMeta("璁㈠崟鏃堕棿绾垮凡鍔犺浇");
        } catch (err) {
          console.error(err);
          flashMeta(getErrorMessage(err, "鍔犺浇鏃堕棿绾垮け璐?));
        }
      });
      return li;
    },
    "鏆傛棤璁㈠崟",
  );
};

runAlertAction = async function runAlertAction(alertId, action) {
  const getMeta =
    alertActionsApi.getAlertActionMeta ||
    ((name) => {
      if (name === "ack") {
        return { pathSuffix: "ack", successMessage: "鍛婅宸茬‘璁?, errorMessage: "鍛婅纭澶辫触" };
      }
      if (name === "resolve") {
        return { pathSuffix: "resolve", successMessage: "鍛婅宸茬粨妗?, errorMessage: "鍛婅缁撴澶辫触" };
      }
      if (name === "false_positive") {
        return { pathSuffix: "false-positive", successMessage: "宸叉爣璁颁负璇姤", errorMessage: "璇姤鏍囪澶辫触" };
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
};

const setSelectedAlertCard = (alertId) => {
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
};

const setEvidenceBayState = ({ loaded = false, evidence = false } = {}) => {
  const detailPanel = document.querySelector("#alert-detail .evidence-bay-panel");
  if (!detailPanel) {
    return;
  }
  detailPanel.classList.toggle("is-loaded", loaded);
  detailPanel.classList.toggle("is-evidence", evidence);
};

renderAlerts = function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  renderList(
    listEl,
    alerts,
    (alert) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = alert.id;
      li.innerHTML = `
        <strong>${escapeHtml(getAlertSummary(alert) || alert.alert_type)} / ${escapeHtml(alert.level)}</strong>
        <div class="meta">鐘舵€侊細${escapeHtml(alert.status)} / 鏃堕棿锛?{escapeHtml(formatDate(getAlertTimestamp(alert)))}</div>
        <div class="meta">璁㈠崟锛?{escapeHtml(alert.order_id)}</div>
        <div class="btn-row">
          <button class="ghost" data-action="detail">璇︽儏</button>
          <button class="ghost" data-action="ack">纭</button>
          <button class="ghost" data-action="resolve">缁撴</button>
          <button class="ghost" data-action="false">璇姤</button>
          <button class="primary" data-action="evidence">鍙栬瘉</button>
        </div>
      `;
      li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
        await loadAlertDetail(alert.id);
      });
      li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "ack");
      });
      li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "resolve");
      });
      li.querySelector('[data-action="false"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "false_positive");
      });
      li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
        await generateEvidence(alert.id);
      });
      return li;
    },
    "鏆傛棤鍛婅",
  );
};

loadAlertDetail = async function loadAlertDetail(alertId) {
  try {
    const detail = await fetchJson(`/alerts/${alertId}`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(detail, null, 2);
    }
    const mediaList = $("alert-media");
    if (mediaList) {
      mediaList.innerHTML = "";
      if (!detail.media || detail.media.length === 0) {
        mediaList.innerHTML = '<div class="meta">鏆傛棤璇佹嵁濯掍綋</div>';
      } else {
        detail.media.forEach((media) => {
          const img = document.createElement("img");
          img.src = `${API_ROOT}${media.download_url}`;
          img.alt = media.type || "media";
          mediaList.appendChild(img);
        });
      }
    }
    flashMeta("鍛婅璇︽儏宸插姞杞?);
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鍔犺浇鍛婅璇︽儏澶辫触"));
  }
};

generateEvidence = async function generateEvidence(alertId) {
  try {
    const res = await fetchJson(`/evidence/${alertId}/generate`, { method: "POST" });
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    flashMeta("鍙栬瘉鍖呯敓鎴愬畬鎴?);
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鐢熸垚鍙栬瘉鍖呭け璐?));
  }
};

renderDevices = function renderDevices(devices) {
  const listEl = $("devices-list");
  renderList(
    listEl,
    devices,
    (device) => {
      const li = document.createElement("li");
      li.className = "card";
      li.dataset.id = device.id;
      li.innerHTML = `
        <strong>${escapeHtml(getDeviceSummary(device) || device.name)}</strong>
        <div class="meta">绫诲瀷锛?{escapeHtml(device.device_type)} / 鐘舵€侊細${escapeHtml(device.status)} / 鏇存柊鏃堕棿锛?{escapeHtml(formatDate(getDeviceTimestamp(device)))}</div>
        <div class="meta">璁惧鐮侊細${escapeHtml(device.device_code || "-")}</div>
        <div class="btn-row">
          <button class="ghost" data-action="select">閫夋嫨璁惧</button>
        </div>
      `;
      li.querySelector('[data-action="select"]').addEventListener("click", async () => {
        await selectDevice(device);
      });
      return li;
    },
    "鏆傛棤璁惧",
  );
};

selectDevice = async function selectDevice(device) {
  state.deviceId = device.id;
  state.deviceCode = device.device_code || state.deviceCode;
  const selected = $("selected-device");
  if (selected) {
    selected.textContent = `褰撳墠閫夋嫨锛?{device.name || device.id}`;
  }
  await loadDeviceConfig(device.id);
};

loadDeviceConfig = async function loadDeviceConfig(deviceId) {
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
    flashMeta(getErrorMessage(err, "鍔犺浇璁惧閰嶇疆澶辫触"));
  }
};

loadHealth = async function loadHealth() {
  if (!state.deviceId) {
    flashMeta("璇峰厛閫夋嫨璁惧");
    return;
  }
  try {
    const health = await fetchJson(`/devices/${state.deviceId}/health`);
    const output = $("health-output");
    if (output) {
      output.textContent = JSON.stringify(health, null, 2);
    }
    flashMeta("璁惧鍋ュ悍淇℃伅宸插姞杞?);
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鍔犺浇鍋ュ悍淇℃伅澶辫触"));
  }
};

saveDeviceConfig = async function saveDeviceConfig() {
  if (!state.deviceId) {
    flashMeta("璇峰厛閫夋嫨璁惧");
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
    flashMeta("璁惧閰嶇疆宸蹭繚瀛?);
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "淇濆瓨璁惧閰嶇疆澶辫触"));
  }
};

if (typeof populateRuleSetSelect === "function") {
  populateRuleSetSelect = function populateRuleSetSelect(sets) {
    const editorSelect = $("rule-set-select");
    const filterSelect = $("rule-match-rule-set");
    const buildOptions =
      ruleSetSelectApi.buildRuleSetSelectOptions ||
      ((items = []) => ({
        editorOptions: items.map((set) => ({
          value: set.id,
          label: `${set.name} / ${set.scope === "global" ? "鍏ㄥ眬" : "涓汉"}`,
        })),
        filterOptions: [{ value: "", label: "鍏ㄩ儴瑙勫垯闆? }],
      }));
    const replaceOptions =
      ruleSetSelectApi.replaceSelectOptions ||
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
    replaceOptions(editorSelect, editorOptions);
    replaceOptions(filterSelect, filterOptions);
  };
}

if (typeof initRules === "function") {
  const originalInitRules = initRules;
  initRules = async function initRules() {
    await originalInitRules();
    const ruleEditing = $("rule-editing");
    const dslResult = $("dsl-result");
    const globalToggle = $("rule-set-global");
    if (ruleEditing && (!ruleEditing.textContent || ruleEditing.textContent.includes("缂傛牞绶?) || ruleEditing.textContent.includes("閸掓稑缂?))) {
      ruleEditing.textContent = "鍒涘缓鏂拌鍒欙紝鎴栦粠宸︿晶閫夋嫨宸叉湁瑙勫垯缁х画缂栬緫銆?;
    }
    if (dslResult && (!dslResult.textContent || dslResult.textContent.includes("缁涘绶?))) {
      dslResult.textContent = "绛夊緟鏍￠獙...";
    }
    if (globalToggle && state.user && !state.user.is_admin) {
      globalToggle.title = "浠呯鐞嗗憳鍙互鍒涘缓鍏ㄥ眬瑙勫垯闆?;
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const demoToggle = document.getElementById("console-demo-toggle");
  const demoPause = document.getElementById("console-demo-pause");
  if (demoToggle) {
    demoToggle.textContent = document.body.dataset.demoLoop === "on" ? "停止演示" : "启动演示";
  }
  if (demoPause) {
    const paused = document.body.dataset.demoPaused === "on";
    demoPause.textContent = paused ? "继续" : "暂停";
  }
});

loadAudit = async function loadAudit() {
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
            <div class="meta">${escapeHtml(row.resource_type)} / ${escapeHtml(row.resource_id || "-")}</div>
            <div class="meta">${escapeHtml(formatDate(row.created_at))}</div>
          `;
          return li;
        },
        "鏆傛棤瀹¤鏃ュ織",
      );
    } catch (err) {
      console.error(err);
      flashMeta(getErrorMessage(err, "鍔犺浇瀹¤鏃ュ織澶辫触"));
    }
  });
};

verifyPickupCode = async function verifyPickupCode() {
  const code = $("pickup-code")?.value?.trim();
  if (!code) {
    flashMeta("璇疯緭鍏ュ彇椁愮爜");
    return;
  }
  try {
    const res = await fetchJson(
      "/whitelist/verify-code",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      false,
    );
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    flashMeta("鍙栭鐮侀獙璇佸畬鎴?);
    await loadOrders();
    await loadAlerts();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鍙栭鐮侀獙璇佸け璐?));
  }
};

importOrder = async function importOrder(evt) {
  evt.preventDefault();
  const merchant = $("merchant")?.value?.trim();
  const summary = $("summary")?.value?.trim();
  const pickupWindow = toNumber($("pickup-window")?.value, 30);
  if (!merchant && !summary) {
    flashMeta("璇疯緭鍏ュ晢瀹舵垨鍟嗗搧鎽樿");
    return;
  }
  try {
    await fetchJson("/orders/manual-import", {
      method: "POST",
      body: JSON.stringify({
        provider: "manual",
        merchant_name: merchant,
        item_summary: summary,
        expected_pickup_minutes: pickupWindow,
      }),
    });
    flashMeta("璁㈠崟瀵煎叆瀹屾垚");
    await loadOrders();
    await loadReports();
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "璁㈠崟瀵煎叆澶辫触"));
  }
};

registerPush = async function registerPush() {
  if (!("serviceWorker" in navigator)) {
    flashMeta("褰撳墠娴忚鍣ㄤ笉鏀寔鎺ㄩ€?);
    return;
  }
  try {
    const config = await fetchJson("/config", {}, false);
    if (!config.vapidPublicKey) {
      flashMeta("VAPID 鍏挜鏈厤缃?);
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
    flashMeta("鎺ㄩ€佽闃呭凡鍚敤");
  } catch (err) {
    console.error(err);
    flashMeta(getErrorMessage(err, "鎺ㄩ€佽闃呭け璐?));
  }
};

if (typeof initRules === "function") {
  const previousInitRules = initRules;
  initRules = async function initRules() {
    await previousInitRules();

    const ruleEditing = $("rule-editing");
    const dslResult = $("dsl-result");
    const ruleSetsList = $("rule-sets");
    const rulesList = $("rules-list");
    const ruleSetSelect = $("rule-set-select");
    const globalToggle = $("rule-set-global");

    if (ruleEditing) {
      ruleEditing.textContent = "鍒涘缓鏂拌鍒欙紝鎴栦粠宸︿晶閫夋嫨宸叉湁瑙勫垯缁х画缂栬緫銆?;
    }
    if (dslResult && (!dslResult.textContent || dslResult.textContent.includes("缁涘绶?) || dslResult.textContent.includes("绛夊緟"))) {
      dslResult.textContent = "绛夊緟鏍￠獙...";
      dslResult.classList.remove("ok", "error", "warn");
    }
    if (globalToggle && state.user && !state.user.is_admin) {
      globalToggle.title = "浠呯鐞嗗憳鍙互鍒涘缓鍏ㄥ眬瑙勫垯闆?;
    }

    if (window.rulesApi) {
      const originalListSetsWithGlobal = window.rulesApi.listSetsWithGlobal;
      const originalListRules = window.rulesApi.listRules;
      const originalCreateSet = window.rulesApi.createSet;
      const originalUpdateSet = window.rulesApi.updateSet;
      const originalCreateRule = window.rulesApi.createRule;
      const originalUpdateRule = window.rulesApi.updateRule;
      const originalDeleteRule = window.rulesApi.deleteRule;
      const originalValidateDsl = window.rulesApi.validateDsl;
      const originalEvaluateDsl = window.rulesApi.evaluateDsl;

      const currentDslValue = () => {
        const preview = $("dsl-preview");
        if (!preview || !preview.textContent.trim()) {
          return null;
        }
        return safeJsonParse(preview.textContent);
      };

      const renderRuleSetCards = (sets) => {
        renderList(
          ruleSetsList,
          sets,
          (set) => {
            const li = document.createElement("li");
            li.className = "card";
            li.innerHTML = `
              <strong>${escapeHtml(set.name)}</strong>
              <div class="meta">${escapeHtml(set.description || "鏆傛棤璇存槑")}</div>
              <div class="meta">鑼冨洿锛?{escapeHtml(set.scope === "global" ? "鍏ㄥ眬" : "涓汉")} / 鐘舵€侊細${set.enabled ? "鍚敤" : "鍋滅敤"}</div>
              <div class="btn-row">
                <button class="ghost" data-action="select">閫夋嫨</button>
                <button class="ghost" data-action="toggle">${set.enabled ? "鍋滅敤" : "鍚敤"}</button>
              </div>
            `;
            li.querySelector('[data-action="select"]').addEventListener("click", async () => {
              if (ruleSetSelect) {
                ruleSetSelect.value = set.id;
                ruleSetSelect.dispatchEvent(new Event("change"));
              }
            });
            li.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
              try {
                await originalUpdateSet(state.token, set.id, { enabled: !set.enabled });
                const refreshed = await originalListSetsWithGlobal(state.token);
                renderRuleSetCards(refreshed || []);
                if (typeof populateRuleSetSelect === "function") {
                  populateRuleSetSelect(refreshed || []);
                }
              } catch (err) {
                console.error(err);
                flashMeta(getErrorMessage(err, "鏇存柊瑙勫垯闆嗗け璐?));
              }
            });
            return li;
          },
          "鏆傛棤瑙勫垯闆?,
        );
      };

      const renderRuleCards = (rules) => {
        renderList(
          rulesList,
          rules,
          (rule) => {
            const li = document.createElement("li");
            li.className = "card";
            li.innerHTML = `
              <strong>${escapeHtml(rule.name)}</strong>
              <div class="meta">浜嬩欢锛?{escapeHtml(rule.event_type)} / 鍔ㄤ綔锛?{escapeHtml(rule.action || "alert")} / 浼樺厛绾э細${escapeHtml(rule.priority)}</div>
              <div class="meta">鍐峰嵈锛?{escapeHtml(rule.cooldown_sec)} 绉?/ 鐘舵€侊細${rule.enabled ? "鍚敤" : "鍋滅敤"}</div>
              <div class="btn-row">
                <button class="ghost" data-action="edit">缂栬緫</button>
                <button class="ghost" data-action="delete">鍒犻櫎</button>
              </div>
            `;
            li.querySelector('[data-action="edit"]').addEventListener("click", () => {
              const nameInput = $("rule-name");
              const eventTypeSelect = $("rule-event-type");
              const ruleActionSelect = $("rule-action");
              const rulePriorityInput = $("rule-priority");
              const ruleCooldownInput = $("rule-cooldown");
              const ruleEnabledInput = $("rule-enabled");
              const dslPreview = $("dsl-preview");
              if (nameInput) {
                nameInput.value = rule.name || "";
              }
              if (eventTypeSelect) {
                eventTypeSelect.value = rule.event_type || "motion";
              }
              if (ruleActionSelect) {
                ruleActionSelect.value = rule.action || "alert";
              }
              if (rulePriorityInput) {
                rulePriorityInput.value = rule.priority ?? 100;
              }
              if (ruleCooldownInput) {
                ruleCooldownInput.value = rule.cooldown_sec ?? 120;
              }
              if (ruleEnabledInput) {
                ruleEnabledInput.checked = Boolean(rule.enabled);
              }
              if (dslPreview) {
                dslPreview.textContent = JSON.stringify(rule.dsl_json || rule.conditions || {}, null, 2);
              }
              if (ruleEditing) {
                ruleEditing.dataset.ruleId = rule.id;
                ruleEditing.textContent = `姝ｅ湪缂栬緫锛?{rule.name}`;
              }
            });
            li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
              try {
                await originalDeleteRule(state.token, rule.id);
                const setId = ruleSetSelect?.value;
                if (setId) {
                  const refreshed = await originalListRules(state.token, setId);
                  renderRuleCards(refreshed || []);
                }
                flashMeta("瑙勫垯宸插垹闄?);
              } catch (err) {
                console.error(err);
                flashMeta(getErrorMessage(err, "鍒犻櫎瑙勫垯澶辫触"));
              }
            });
            return li;
          },
          "鏆傛棤瑙勫垯",
        );
      };

      const initialSets = await originalListSetsWithGlobal(state.token);
      renderRuleSetCards(initialSets || []);
      if (typeof populateRuleSetSelect === "function") {
        populateRuleSetSelect(initialSets || []);
      }
      if (ruleSetSelect && ruleSetSelect.value) {
        const currentRules = await originalListRules(state.token, ruleSetSelect.value);
        renderRuleCards(currentRules || []);
      }

      const createRuleSetBtn = $("create-rule-set");
      if (createRuleSetBtn && !createRuleSetBtn.dataset.boundLocalized) {
        createRuleSetBtn.dataset.boundLocalized = "1";
        createRuleSetBtn.addEventListener("click", async () => {
          const name = $("rule-set-name")?.value?.trim();
          const desc = $("rule-set-desc")?.value?.trim() || "";
          const scope = $("rule-set-global")?.checked ? "global" : "user";
          if (!name) {
            flashMeta("璇疯緭鍏ヨ鍒欓泦鍚嶇О");
            return;
          }
          try {
            await originalCreateSet(state.token, {
              name,
              description: desc,
              enabled: true,
              scope,
            });
            const refreshed = await originalListSetsWithGlobal(state.token);
            renderRuleSetCards(refreshed || []);
            if (typeof populateRuleSetSelect === "function") {
              populateRuleSetSelect(refreshed || []);
            }
            flashMeta("瑙勫垯闆嗗凡鍒涘缓");
          } catch (err) {
            console.error(err);
            flashMeta(getErrorMessage(err, "鍒涘缓瑙勫垯闆嗗け璐?));
          }
        });
      }

      if (ruleSetSelect && !ruleSetSelect.dataset.boundLocalized) {
        ruleSetSelect.dataset.boundLocalized = "1";
        ruleSetSelect.addEventListener("change", async () => {
          if (!ruleSetSelect.value) {
            renderRuleCards([]);
            return;
          }
          try {
            const rules = await originalListRules(state.token, ruleSetSelect.value);
            renderRuleCards(rules || []);
          } catch (err) {
            console.error(err);
            flashMeta(getErrorMessage(err, "鍔犺浇瑙勫垯澶辫触"));
          }
        });
      }

      const saveRuleBtn = $("save-rule");
      if (saveRuleBtn && !saveRuleBtn.dataset.boundLocalized) {
        saveRuleBtn.dataset.boundLocalized = "1";
        saveRuleBtn.addEventListener("click", async () => {
          const setId = ruleSetSelect?.value;
          const name = $("rule-name")?.value?.trim();
          if (!setId) {
            flashMeta("璇峰厛閫夋嫨瑙勫垯闆?);
            return;
          }
          if (!name) {
            flashMeta("璇疯緭鍏ヨ鍒欏悕绉?);
            return;
          }
          const payload = {
            name,
            enabled: Boolean($("rule-enabled")?.checked),
            priority: toNumber($("rule-priority")?.value, 100),
            event_type: $("rule-event-type")?.value || "motion",
            dsl_json: currentDslValue(),
            action: $("rule-action")?.value || "alert",
            action_params: {},
            cooldown_sec: toNumber($("rule-cooldown")?.value, 120),
          };
          try {
            const editingRuleId = ruleEditing?.dataset.ruleId || "";
            if (editingRuleId) {
              await originalUpdateRule(state.token, editingRuleId, payload);
              flashMeta("瑙勫垯宸叉洿鏂?);
            } else {
              await originalCreateRule(state.token, setId, payload);
              flashMeta("瑙勫垯宸插垱寤?);
            }
            const rules = await originalListRules(state.token, setId);
            renderRuleCards(rules || []);
            if (ruleEditing) {
              delete ruleEditing.dataset.ruleId;
              ruleEditing.textContent = "鍒涘缓鏂拌鍒欙紝鎴栦粠宸︿晶閫夋嫨宸叉湁瑙勫垯缁х画缂栬緫銆?;
            }
          } catch (err) {
            console.error(err);
            flashMeta(getErrorMessage(err, "淇濆瓨瑙勫垯澶辫触"));
          }
        });
      }

      const dslValidateBtn = $("dsl-validate");
      if (dslValidateBtn && !dslValidateBtn.dataset.boundLocalized) {
        dslValidateBtn.dataset.boundLocalized = "1";
        dslValidateBtn.addEventListener("click", async () => {
          try {
            const res = await originalValidateDsl(state.token, { dsl_json: currentDslValue() });
            setDslStatus($("dsl-result"), res?.ok ? "鏍￠獙閫氳繃" : "鏍￠獙澶辫触", res?.ok ? "ok" : "error");
          } catch (err) {
            console.error(err);
            setDslStatus($("dsl-result"), getErrorMessage(err, "鏍￠獙澶辫触"), "error");
          }
        });
      }

      const dslEvaluateBtn = $("dsl-evaluate");
      if (dslEvaluateBtn && !dslEvaluateBtn.dataset.boundLocalized) {
        dslEvaluateBtn.dataset.boundLocalized = "1";
        dslEvaluateBtn.addEventListener("click", async () => {
          const metrics = safeJsonParse($("dsl-metrics")?.value || "");
          if (!metrics) {
            setDslStatus($("dsl-result"), "璇锋彁渚涙湁鏁堢殑 metrics JSON", "warn");
            return;
          }
          try {
            const res = await originalEvaluateDsl(state.token, {
              dsl_json: currentDslValue(),
              metrics,
            });
            setDslStatus($("dsl-result"), res?.matched ? "璇勪及鍛戒腑" : "璇勪及鏈懡涓?, res?.matched ? "ok" : "warn");
          } catch (err) {
            console.error(err);
            setDslStatus($("dsl-result"), getErrorMessage(err, "璇勪及澶辫触"), "error");
          }
        });
      }
    }
  };
}

connectWebSocket = function connectWebSocket() {
  let wsUrl = "";
  try {
    const apiRoot = new URL(API_ROOT);
    const wsProtocol = apiRoot.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProtocol}//${apiRoot.host}/ws/alerts`;
  } catch (_err) {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    wsUrl = `${protocol}://${location.hostname}:18000/ws/alerts`;
  }

  const ws = new WebSocket(wsUrl);
  const throttleFactory = window.wsThrottle?.createThrottle || ((_, handler) => handler);
  let pending = { orders: false, alerts: false, devices: false, reports: false };

  const buildDeviceCardLocalized = (device) => {
    const li = document.createElement("li");
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
        <div class="meta"><span>绫诲瀷</span><strong>${escapeHtml(device.device_type || "-")}</strong></div>
        <div class="meta"><span>鏇存柊</span><strong>${escapeHtml(formatDate(getDeviceTimestamp(device)))}</strong></div>
        <div class="meta"><span>璁惧鐮?/span><strong>${escapeHtml(device.device_code || "-")}</strong></div>
      </div>
      <div class="btn-row audit-card-actions">
        <button class="ghost" data-action="select">閫夋嫨璁惧</button>
      </div>
    `;
    li.querySelector('[data-action="select"]').addEventListener("click", async () => {
      await selectDevice(device);
    });
    return li;
  };

  const buildRuleMatchCardLocalized = (row) => {
    const li = document.createElement("li");
    li.className = "card audit-card rule-match-card";
    li.dataset.id = row.id != null ? String(row.id) : "";
    li.innerHTML = `
      <div class="audit-card-head">
        <div class="audit-card-title">
          <strong>${escapeHtml(row.rule_name || row.summary || row.event_type || "瑙勫垯")} / ${escapeHtml(row.event_type || "-")}</strong>
          <span class="hint">Audit Trace</span>
        </div>
        <span class="chip audit-status-chip ${row.suppressed ? "is-warn" : "is-live"}">${row.suppressed ? "Suppressed" : "Live"}</span>
      </div>
      <div class="audit-card-meta-grid">
        <div class="meta"><span>瑙勫垯闆?/span><strong>${escapeHtml(row.rule_set_name || row.rule_set_id || "-")}</strong></div>
        <div class="meta"><span>璁㈠崟</span><strong>${escapeHtml(row.order_id || "-")}</strong></div>
        <div class="meta"><span>浼氳瘽</span><strong>${escapeHtml(row.session_id || "-")}</strong></div>
        <div class="meta"><span>鍛戒腑鏃堕棿</span><strong>${escapeHtml(formatDate(row.matched_at || row.updated_at))}</strong></div>
      </div>
      <pre class="code audit-card-code">${escapeHtml(JSON.stringify({ conditions: row.conditions, metrics: row.metrics || row.metrics_json, note: row.note }, null, 2))}</pre>
    `;
    return li;
  };

  const buildOrderCardLocalized = (order) => {
    const li = document.createElement("li");
    li.className = "card";
    li.dataset.id = order.id;
    li.innerHTML = `
      <strong>${escapeHtml(order.provider)} / ${escapeHtml(order.status)}</strong>
      <div class="meta">璁㈠崟 ID锛?{escapeHtml(order.id)}</div>
      <div class="meta">${escapeHtml(formatPair(order.merchant_name || "-", getOrderSummary(order) || "-"))}</div>
      <div class="meta">閫佽揪鏃堕棿锛?{escapeHtml(formatDate(getOrderTimestamp(order)))} / 棰勮鍙栭锛?{escapeHtml(formatDate(order.expected_pickup_by))}</div>
      <div class="meta">鍏宠仈浼氳瘽锛?{escapeHtml(order.latest_session_id || "-")}</div>
      <div class="btn-row">
        <button class="ghost" data-action="deliver">妯℃嫙閫佽揪</button>
        <button class="primary" data-action="arm">鍚姩鐩戞帶</button>
        <button class="ghost" data-action="confirm">纭鍙栭</button>
        <button class="ghost" data-action="timeline">鏌ョ湅鏃堕棿绾?/button>
      </div>
    `;
    li.querySelector('[data-action="deliver"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/integrations/mock/delivered/${order.id}`, { method: "POST" });
        flashMeta("妯℃嫙閫佽揪瀹屾垚");
        await loadOrders();
        await loadReports();
      } catch (err) {
        console.error(err);
        flashMeta(getErrorMessage(err, "妯℃嫙閫佽揪澶辫触"));
      }
    });
    li.querySelector('[data-action="arm"]').addEventListener("click", async () => {
      try {
        const res = await fetchJson(`/orders/${order.id}/arm`, { method: "POST" });
        flashMeta(`鐩戞帶浼氳瘽宸插惎鍔細${res.session_id || "-"}`);
        await loadOrders();
        await loadReports();
      } catch (err) {
        console.error(err);
        flashMeta(getErrorMessage(err, "鍚姩鐩戞帶澶辫触"));
      }
    });
    li.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
      try {
        await fetchJson(`/orders/${order.id}/confirm-pickup`, { method: "POST" });
        flashMeta("宸茬‘璁ゅ彇椁?);
        await loadOrders();
        await loadAlerts();
        await loadReports();
      } catch (err) {
        console.error(err);
        flashMeta(getErrorMessage(err, "纭鍙栭澶辫触"));
      }
    });
    li.querySelector('[data-action="timeline"]').addEventListener("click", async () => {
      try {
        const timeline = await fetchJson(`/orders/${order.id}/timeline`);
        const output = $("alert-detail-output");
        if (output) {
          output.textContent = JSON.stringify(timeline, null, 2);
        }
        flashMeta("璁㈠崟鏃堕棿绾垮凡鍔犺浇");
      } catch (err) {
        console.error(err);
        flashMeta(getErrorMessage(err, "鍔犺浇鏃堕棿绾垮け璐?));
      }
    });
    return li;
  };

  const buildAlertCardLocalized = (alert) => {
    const li = document.createElement("li");
    li.className = "card audit-card alert-event-card";
    li.dataset.id = alert.id;
    const activeAlertId = document.querySelector("#alert-detail .evidence-bay-panel")?.dataset.alertId || "";
    if (String(alert.id || "") === activeAlertId) {
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
        <div class="meta"><span>绛夌骇</span><strong>${escapeHtml(alert.level || "-")}</strong></div>
        <div class="meta"><span>鏃堕棿</span><strong>${escapeHtml(formatDate(getAlertTimestamp(alert)))}</strong></div>
        <div class="meta"><span>璁㈠崟</span><strong>${escapeHtml(alert.order_id || "-")}</strong></div>
      </div>
      <div class="btn-row audit-card-actions">
        <button class="ghost" data-action="detail">璇︽儏</button>
        <button class="ghost" data-action="ack">纭</button>
        <button class="ghost" data-action="resolve">缁撴</button>
        <button class="ghost" data-action="false">璇姤</button>
        <button class="primary" data-action="evidence">鍙栬瘉</button>
      </div>
    `;
    li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
      setSelectedAlertCard(alert.id);
      await loadAlertDetail(alert.id);
    });
    li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "ack");
    });
    li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "resolve");
    });
    li.querySelector('[data-action="false"]').addEventListener("click", async () => {
      await runAlertAction(alert.id, "false_positive");
    });
    li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
      setSelectedAlertCard(alert.id);
      await generateEvidence(alert.id);
    });
    return li;
  };

  const trimList = (listId, max) => {
    if (!max || max <= 0) {
      return;
    }
    const list = $(listId);
    if (!list) {
      return;
    }
    const items = Array.from(list.children);
    const limiter = window.listLimit?.enforceListLimit || null;
    const keep = limiter ? limiter(items, max) : items.slice(0, max);
    keep.forEach((node) => {
      if (node && node.parentElement !== list) {
        list.appendChild(node);
      }
    });
    const removed = items.slice(keep.length);
    removed.forEach((node) => node.remove());
    if (listId === "rule-matches-list" && window.ruleMatchIndex?.removeIndexForNodes) {
      window.ruleMatchIndex.removeIndexForNodes(ruleMatchIndex, removed);
    }
  };

  const mergeListItem = (listId, itemId, build) => {
    const list = $(listId);
    if (!list) {
      return;
    }
    if (!itemId) {
      pending.reports = true;
      return;
    }
    const selector = `[data-id="${itemId}"]`;
    const existing = list.querySelector(selector);
    const node = build();
    if (existing) {
      existing.replaceWith(node);
    } else {
      list.prepend(node);
    }
    if (listId === "rule-matches-list") {
      const id = node?.dataset?.id || null;
      if (id) {
        ruleMatchIndex.set(String(id), node);
      }
    }
    if (listId === "orders-list") {
      trimList("orders-list", 100);
    } else if (listId === "alerts-list") {
      trimList("alerts-list", 100);
    } else if (listId === "rule-matches-list") {
      trimList("rule-matches-list", 200);
    }
  };

  const flushReports = throttleFactory(800, async () => {
    if (document.hidden || !pending.reports) {
      return;
    }
    pending.reports = false;
    await loadReports();
  });
  const flushOrders = throttleFactory(200, async () => {
    if (document.hidden || !pending.orders) {
      return;
    }
    pending.orders = false;
    await loadOrders();
  });
  const flushAlerts = throttleFactory(200, async () => {
    if (document.hidden || !pending.alerts) {
      return;
    }
    pending.alerts = false;
    await loadAlerts();
  });
  const flushDevices = throttleFactory(500, async () => {
    if (document.hidden || !pending.devices) {
      return;
    }
    pending.devices = false;
    await loadDevices();
  });

  ws.onopen = () => {
    try {
      ws.send(JSON.stringify({ subscribe: ["order", "alert", "device", "rule"] }));
    } catch (err) {
      console.warn("ws subscribe failed", err);
    }
  };

  ws.onmessage = async (evt) => {
    const raw = (evt.data || "").toString();
    let envelope = null;
    try {
      envelope = JSON.parse(raw);
    } catch (_err) {
      envelope = null;
    }
    const eventType = envelope && typeof envelope.type === "string" ? envelope.type : raw;
    const payloadData = envelope?.payload || null;
    const entityType = payloadData?.entity_type || payloadData?.entityType || "";
    const entity = payloadData?.entity || null;

    if ((entityType === "order" || eventType.includes("order")) && (entity || payloadData?.order)) {
      const order = entity || payloadData.order;
      mergeListItem("orders-list", order.id, () => buildOrderCardLocalized(order));
      pending.orders = true;
      pending.reports = true;
      flushOrders();
      flushReports();
      return;
    }

    if ((entityType === "alert" || eventType.includes("alert")) && (entity || payloadData?.alert)) {
      const alert = entity || payloadData.alert;
      mergeListItem("alerts-list", alert.id, () => buildAlertCardLocalized(alert));
      pending.alerts = true;
      pending.reports = true;
      flushAlerts();
      flushReports();
      return;
    }

    if ((entityType === "device" || eventType.includes("device")) && (entity || payloadData?.device)) {
      const device = entity || payloadData.device;
      mergeListItem("devices-list", device.id, () => buildDeviceCardLocalized(device));
      pending.devices = true;
      pending.reports = true;
      flushDevices();
      flushReports();
      return;
    }

    if ((entityType === "rule_match" || eventType.includes("rule")) && (entity || payloadData?.match)) {
      const match = entity || payloadData.match;
      const filters = getRuleMatchFilters(state.ruleMatches.page || 1);
      const signature = window.ruleMatchIndex?.buildFilterSignature
        ? window.ruleMatchIndex.buildFilterSignature(filters)
        : "";
      const acceptSignature = window.ruleMatchIndex?.shouldAcceptIncremental
        ? window.ruleMatchIndex.shouldAcceptIncremental(ruleMatchSignature, signature)
        : true;

      if (!acceptSignature || !match.id) {
        ruleMatchSignature = signature;
        await loadRuleMatches(1);
        return;
      }

      ruleMatchSignature = signature;
      const canInsert = window.wsLogic?.shouldInsertRuleMatch
        ? window.wsLogic.shouldInsertRuleMatch(match, filters, new Date())
        : true;

      if (canInsert) {
        mergeListItem("rule-matches-list", match.id, () => buildRuleMatchCardLocalized(match));
        state.ruleMatches.hasMore = true;
        updateRuleMatchPager();
      }

      if (match.matched_at && trendCache && window.trendCache?.applyRuleMatchIncrement) {
        const applied = window.trendCache.applyRuleMatchIncrement(trendCache, match.matched_at);
        if (applied) {
          renderTrendBars($("trend-rule-matches"), trendCache.rule_matches || [], "rules");
          renderTrendMeta($("trend-rules-meta"), trendCache.rule_matches || []);
        } else {
          await loadTrends();
        }
      } else {
        await loadTrends();
      }
      return;
    }

    if (eventType.includes("device")) {
      pending.devices = true;
      pending.reports = true;
      flushDevices();
      flushReports();
    } else if (eventType.includes("order")) {
      pending.orders = true;
      pending.reports = true;
      flushOrders();
      flushReports();
    } else {
      pending.alerts = true;
      pending.reports = true;
      flushAlerts();
      flushReports();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 5000);
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      flushOrders();
      flushAlerts();
      flushDevices();
      flushReports();
    }
  });
};

renderAlerts = function renderAlerts(alerts) {
  const listEl = $("alerts-list");
  const activeAlertId = document.querySelector("#alert-detail .evidence-bay-panel")?.dataset.alertId || "";
  renderList(
    listEl,
    alerts,
    (alert) => {
      const li = document.createElement("li");
      li.className = "card audit-card alert-event-card";
      li.dataset.id = alert.id;
      if (String(alert.id || "") === activeAlertId) {
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
          <div class="meta"><span>缁涘楠?/span><strong>${escapeHtml(alert.level || "-")}</strong></div>
          <div class="meta"><span>閺冨爼妫?/span><strong>${escapeHtml(formatDate(getAlertTimestamp(alert)))}</strong></div>
          <div class="meta"><span>鐠併垹宕?/span><strong>${escapeHtml(alert.order_id || "-")}</strong></div>
        </div>
        <div class="btn-row audit-card-actions">
          <button class="ghost" data-action="detail">鐠囷附鍎?/button>
          <button class="ghost" data-action="ack">绾喛顓?/button>
          <button class="ghost" data-action="resolve">缂佹挻顢?/button>
          <button class="ghost" data-action="false">鐠囶垱濮?/button>
          <button class="primary" data-action="evidence">閸欐牞鐦?/button>
        </div>
      `;
      li.querySelector('[data-action="detail"]').addEventListener("click", async () => {
        setSelectedAlertCard(alert.id);
        await loadAlertDetail(alert.id);
      });
      li.querySelector('[data-action="ack"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "ack");
      });
      li.querySelector('[data-action="resolve"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "resolve");
      });
      li.querySelector('[data-action="false"]').addEventListener("click", async () => {
        await runAlertAction(alert.id, "false_positive");
      });
      li.querySelector('[data-action="evidence"]').addEventListener("click", async () => {
        setSelectedAlertCard(alert.id);
        await generateEvidence(alert.id);
      });
      return li;
    },
    "閺嗗倹妫ら崨濠咁劅",
  );
};

loadAlertDetail = async function loadAlertDetail(alertId) {
  setEvidenceBayState({ loaded: false, evidence: false });
  try {
    const detail = await fetchJson(`/alerts/${alertId}`);
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(detail, null, 2);
    }
    const mediaList = $("alert-media");
    if (mediaList) {
      mediaList.innerHTML = "";
      if (!detail.media || detail.media.length === 0) {
        mediaList.innerHTML = '<div class="meta">閺嗗倹妫ょ拠浣瑰祦婵帊缍?/div>';
      } else {
        detail.media.forEach((media) => {
          const img = document.createElement("img");
          img.src = `${API_ROOT}${media.download_url}`;
          img.alt = media.type || "media";
          mediaList.appendChild(img);
        });
      }
    }
    setEvidenceBayState({ loaded: true, evidence: false });
    flashMeta("???????");
  } catch (err) {
    console.error(err);
    setEvidenceBayState({ loaded: false, evidence: false });
    flashMeta(getErrorMessage(err, "????????"));
  }
};

generateEvidence = async function generateEvidence(alertId) {
  setEvidenceBayState({ loaded: true, evidence: false });
  try {
    const res = await fetchJson(`/evidence/${alertId}/generate`, { method: "POST" });
    const output = $("alert-detail-output");
    if (output) {
      output.textContent = JSON.stringify(res, null, 2);
    }
    setEvidenceBayState({ loaded: true, evidence: true });
    flashMeta("???????");
  } catch (err) {
    console.error(err);
    setEvidenceBayState({ loaded: true, evidence: false });
    flashMeta(getErrorMessage(err, "???????"));
  }
};
*/
