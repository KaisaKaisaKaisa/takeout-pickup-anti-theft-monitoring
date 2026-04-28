import type {
  Alert,
  Device,
  EvidenceBundle,
  GateVerification,
  GateVerifyResult,
  GuardSnapshot,
  Order,
  PickupCode,
  RuleMatch,
  Session,
  SummaryReport,
  TrendReport,
} from "../types";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:18000/api/v1";
const TOKEN_STORAGE_KEY = "tg_token";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE || "").toLowerCase() === "true";
const DEFAULT_DEMO_ACCOUNT = {
  phone: import.meta.env.VITE_DEMO_PHONE || "demo-user",
  password: import.meta.env.VITE_DEMO_PASSWORD || "demo-pass",
  name: import.meta.env.VITE_DEMO_NAME || "Demo",
};

const demoOrders: Order[] = [
  {
    id: "ord-campus-4817",
    provider: "manual",
    status: "delivered",
    merchant_name: "北门咖啡",
    item_summary: "拿铁 + 可颂",
    delivered_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    expected_pickup_by: new Date(Date.now() + 12 * 60_000).toISOString(),
    latest_session_id: "ses-a3-17",
  },
  {
    id: "ord-dorm-2031",
    provider: "manual",
    status: "armed",
    merchant_name: "深夜粥铺",
    item_summary: "皮蛋瘦肉粥",
    delivered_at: new Date(Date.now() - 42 * 60_000).toISOString(),
    expected_pickup_by: new Date(Date.now() + 8 * 60_000).toISOString(),
    latest_session_id: "ses-b1-09",
  },
  {
    id: "ord-tower-9520",
    provider: "manual",
    status: "created",
    merchant_name: "东区简餐",
    item_summary: "牛肉饭",
    expected_pickup_by: new Date(Date.now() + 37 * 60_000).toISOString(),
  },
];

const demoSessions: Session[] = [
  {
    id: "ses-a3-17",
    order_id: "ord-campus-4817",
    device_id: "dev-shelf-a3",
    state: "armed",
    armed_at: new Date(Date.now() - 16 * 60_000).toISOString(),
    pickup_deadline_at: new Date(Date.now() + 12 * 60_000).toISOString(),
    presence_status: "clear",
    sensitivity_config: { min_motion_score: 5000, max_weight_drop: -300 },
    false_alarm_count: 0,
  },
  {
    id: "ses-b1-09",
    order_id: "ord-dorm-2031",
    device_id: "dev-weight-b1",
    state: "alerted",
    armed_at: new Date(Date.now() - 39 * 60_000).toISOString(),
    pickup_deadline_at: new Date(Date.now() + 8 * 60_000).toISOString(),
    presence_status: "motion",
    sensitivity_config: { min_motion_score: 6200, max_weight_drop: -260 },
    false_alarm_count: 1,
  },
];

const demoAlerts: Alert[] = [
  {
    id: "inc-7362",
    order_id: "ord-dorm-2031",
    alert_type: "weight_drop",
    level: "critical",
    status: "open",
    summary: "重量骤降 -318g，摄像头 ROI 出现短暂停留",
    triggered_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    id: "inc-7298",
    order_id: "ord-campus-4817",
    alert_type: "object_missing",
    level: "warning",
    status: "acknowledged",
    summary: "取餐架 A3 物品遮挡异常",
    triggered_at: new Date(Date.now() - 23 * 60_000).toISOString(),
  },
];

const demoDevices: Device[] = [
  {
    id: "dev-shelf-a3",
    name: "A3 取餐架摄像头",
    device_type: "camera",
    status: "online",
    device_code: "edge-a3",
    last_seen_at: new Date(Date.now() - 12_000).toISOString(),
    config: { roi: "rack-a3", version: "cfg-42" },
  },
  {
    id: "dev-weight-b1",
    name: "B1 重量传感底座",
    device_type: "scale",
    status: "online",
    device_code: "edge-b1",
    last_seen_at: new Date(Date.now() - 19_000).toISOString(),
    config: { min_motion_score: 6200, max_weight_drop: -260 },
  },
  {
    id: "dev-door-c2",
    name: "C2 通道侧摄",
    device_type: "camera",
    status: "offline",
    device_code: "edge-c2",
    last_seen_at: new Date(Date.now() - 11 * 60_000).toISOString(),
  },
];

const demoRuleMatches: RuleMatch[] = [
  {
    id: 871,
    rule_id: "rule-weight-drop",
    rule_set_id: "rules-campus-default",
    rule_name: "重量骤降 + ROI 动作",
    rule_set_name: "校园取餐默认策略",
    order_id: "ord-dorm-2031",
    session_id: "ses-b1-09",
    event_type: "weight_drop",
    action: "alert",
    suppressed: false,
    matched_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    metrics: { weight_delta: -318, motion_score: 0.74 },
  },
  {
    id: 865,
    rule_id: "rule-object-missing",
    rule_set_id: "rules-campus-default",
    rule_name: "物品消失复核",
    rule_set_name: "校园取餐默认策略",
    order_id: "ord-campus-4817",
    session_id: "ses-a3-17",
    event_type: "object_missing",
    action: "alert",
    suppressed: true,
    matched_at: new Date(Date.now() - 23 * 60_000).toISOString(),
    metrics: { missing_seconds: 6, confidence: 0.68 },
  },
];

const demoSummary: SummaryReport = {
  orders: { total: 47, delivered: 19, picked_up: 22, created: 6 },
  alerts: { total: 9, open: 2, acknowledged: 3, resolved: 4, false_positive: 1 },
  devices: { total: 3, online: 2, offline: 1 },
  sessions: { total: 14, armed: 8, alerted: 2, confirmed: 4 },
  events_last_24h: 386,
  rule_matches: { total: 31, suppressed: 7 },
};

const demoTrends: TrendReport = {
  interval: "day",
  orders: [{ label: "Mon", value: 13 }, { label: "Tue", value: 17 }, { label: "Wed", value: 11 }],
  alerts: [{ label: "Mon", value: 2 }, { label: "Tue", value: 4 }, { label: "Wed", value: 3 }],
  events: [{ label: "Mon", value: 108 }, { label: "Tue", value: 141 }, { label: "Wed", value: 137 }],
  rule_matches: [{ label: "Mon", value: 8 }, { label: "Tue", value: 14 }, { label: "Wed", value: 9 }],
};

const demoEvidence: EvidenceBundle[] = [
  {
    id: "bundle-inc-7362",
    status: "ready",
    zip_media_id: "media-bundle-7362",
    generated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: "bundle-inc-7298",
    status: "generating",
    generated_at: new Date(Date.now() - 21 * 60_000).toISOString(),
  },
];

interface RequestOptions {
  auth?: boolean;
  retry?: boolean;
  timeoutMs?: number;
}

interface AuthToken {
  access_token?: string;
  token_type?: string;
}

interface DownloadLink {
  href: string;
  download: string;
}

interface DownloadHost {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createLink(): DownloadLink;
  appendLink(link: DownloadLink): void;
  clickLink(link: DownloadLink): void;
  removeLink(link: DownloadLink): void;
}

let downloadHost: DownloadHost | null = null;

function getDownloadHost(): DownloadHost {
  if (downloadHost) {
    return downloadHost;
  }
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createLink: () => document.createElement("a"),
    appendLink: (link) => document.body.appendChild(link as HTMLAnchorElement),
    clickLink: (link) => (link as HTMLAnchorElement).click(),
    removeLink: (link) => (link as HTMLAnchorElement).remove(),
  };
}

function setDownloadHost(host: DownloadHost | null) {
  downloadHost = host;
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Some WebViews disable storage; the next request will simply re-authenticate.
  }
}

function isFormBody(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function buildHeaders(init?: RequestInit, token?: string | null): Record<string, string> {
  const headers = normalizeHeaders(init?.headers);
  if (init?.body && !isFormBody(init.body)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function refreshAuth(): Promise<string> {
  const loginPayload = {
    phone: DEFAULT_DEMO_ACCOUNT.phone,
    password: DEFAULT_DEMO_ACCOUNT.password,
  };
  let token: AuthToken | null = null;
  try {
    token = await request<AuthToken>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(loginPayload) },
      { auth: false, retry: false },
    );
  } catch {
    token = await request<AuthToken>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(DEFAULT_DEMO_ACCOUNT) },
      { auth: false, retry: false },
    );
  }
  if (!token?.access_token) {
    throw new Error("登录失败");
  }
  setStoredToken(token.access_token);
  return token.access_token;
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const shouldAuth = options.auth !== false;
  const token = shouldAuth ? getStoredToken() : null;
  const response = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      ...init,
      headers: buildHeaders(init, token),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );
  if (response.status === 401 && shouldAuth && options.retry !== false) {
    const nextToken = await refreshAuth();
    return request<T>(
      path,
      { ...init, headers: buildHeaders(init, nextToken) },
      { ...options, retry: false },
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload
        ? (payload.detail || payload.error || payload.message)
        : payload;
    throw new Error(String(detail || response.statusText || "API request failed"));
  }
  return payload as T;
}

async function requestBlob(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<Blob> {
  const shouldAuth = options.auth !== false;
  const token = shouldAuth ? getStoredToken() : null;
  const response = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      ...init,
      headers: buildHeaders(init, token),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );
  if (response.status === 401 && shouldAuth && options.retry !== false) {
    const nextToken = await refreshAuth();
    return requestBlob(
      path,
      { ...init, headers: buildHeaders(init, nextToken) },
      { ...options, retry: false },
    );
  }
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    const detail =
      typeof payload === "object" && payload
        ? (payload.detail || payload.error || payload.message)
        : payload;
    throw new Error(String(detail || response.statusText || "API request failed"));
  }
  return response.blob();
}

async function downloadCsv(path: string, filename: string): Promise<void> {
  const blob = await requestBlob(path);
  const host = getDownloadHost();
  const url = host.createObjectURL(blob);
  const link = host.createLink();
  link.href = url;
  link.download = filename;
  host.appendLink(link);
  host.clickLink(link);
  host.removeLink(link);
  host.revokeObjectURL(url);
}

function fallbackSnapshot(): GuardSnapshot {
  return {
    orders: demoOrders,
    sessions: demoSessions,
    alerts: demoAlerts,
    devices: demoDevices,
    ruleMatches: demoRuleMatches,
    summary: demoSummary,
    trends: demoTrends,
    evidence: demoEvidence,
  };
}

export async function fetchGuardSnapshot(): Promise<GuardSnapshot> {
  if (DEMO_MODE) {
    return fallbackSnapshot();
  }
  const [orders, sessions, alerts, devices, ruleMatches, summary, trends] = await Promise.all([
    request<{ orders: Order[] }>("/orders"),
    request<{ sessions: Session[] }>("/sessions"),
    request<{ alerts: Alert[] }>("/alerts"),
    request<{ devices: Device[] }>("/devices"),
    request<RuleMatch[]>("/rules/matches?limit=8"),
    request<SummaryReport>("/reports/summary?scope=user"),
    request<TrendReport>("/reports/trends?scope=user&interval=day&days=7"),
  ]);
  return {
    orders: orders.orders || [],
    sessions: sessions.sessions || [],
    alerts: alerts.alerts || [],
    devices: devices.devices || [],
    ruleMatches: ruleMatches || [],
    summary: summary || {},
    trends: trends || {},
    evidence: demoEvidence,
  };
}

export const guardApi = {
  request,
  requestBlob,
  downloadCsv,
  setDownloadHost,
  fetchGuardSnapshot,
  importOrder: (payload: Partial<Order> & { expected_pickup_minutes?: number }) =>
    request<Order>("/orders/manual-import", { method: "POST", body: JSON.stringify(payload) }),
  armOrder: (orderId: string) => request<{ session_id: string; deduped: boolean }>(`/orders/${orderId}/arm`, { method: "POST" }),
  confirmPickup: (orderId: string) => request<{ ok: boolean }>(`/orders/${orderId}/confirm-pickup`, { method: "POST" }),
  issuePickupCode: (orderId: string, ttlMinutes = 30) =>
    request<PickupCode>(`/gate/orders/${orderId}/pickup-code?ttl_minutes=${ttlMinutes}`, { method: "POST" }),
  verifyGateCode: (payload: { code: string; gate_name?: string }) =>
    request<GateVerifyResult>("/gate/verify-code", { method: "POST", body: JSON.stringify(payload) }),
  recentGateVerifications: () =>
    request<{ verifications: GateVerification[] }>("/gate/recent-verifications?limit=12"),
  acknowledgeAlert: (alertId: string) => request<{ ok: boolean }>(`/alerts/${alertId}/ack`, { method: "POST" }),
  resolveAlert: (alertId: string) => request<{ ok: boolean }>(`/alerts/${alertId}/resolve`, { method: "POST" }),
  falsePositiveAlert: (alertId: string) => request<{ ok: boolean }>(`/alerts/${alertId}/false-positive`, { method: "POST" }),
  getEvidence: (incidentId: string) => request<EvidenceBundle>(`/evidence/${incidentId}`),
  generateEvidence: (incidentId: string) =>
    request<{ status: string; bundle_id: string }>(`/evidence/${incidentId}/generate`, { method: "POST" }),
  updateDeviceConfig: (deviceId: string, config: Record<string, unknown>) =>
    request<{ ok: boolean; config: Record<string, unknown> }>(`/devices/${deviceId}/config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    }),
  exportSummaryUrl: `${API_BASE}/reports/summary/export?scope=user`,
  exportTrendsUrl: `${API_BASE}/reports/trends/export?scope=user&interval=day&days=7`,
  exportRuleMatchesUrl: `${API_BASE}/reports/rule-matches/export?scope=user&limit=200`,
  exportSummary: () => downloadCsv("/reports/summary/export?scope=user", "summary.csv"),
  exportTrends: () => downloadCsv("/reports/trends/export?scope=user&interval=day&days=7", "trends.csv"),
  exportRuleMatches: () => downloadCsv("/reports/rule-matches/export?scope=user&limit=200", "rule-matches.csv"),
};
