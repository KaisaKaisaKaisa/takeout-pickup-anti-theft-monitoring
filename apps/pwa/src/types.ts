export type PageId =
  | "overview"
  | "console"
  | "cases"
  | "templates"
  | "playback"
  | "orders"
  | "sessions"
  | "alerts"
  | "devices"
  | "rules"
  | "evidence"
  | "reports"
  | "ops";

export type Severity = "info" | "warning" | "critical";

export interface Order {
  id: string;
  provider: string;
  status: string;
  merchant_name?: string | null;
  item_summary?: string | null;
  delivered_at?: string | null;
  expected_pickup_by?: string | null;
  latest_session_id?: string | null;
}

export interface Session {
  id: string;
  order_id: string;
  device_id: string;
  state: string;
  armed_at: string;
  pickup_deadline_at: string;
  presence_status: string;
  sensitivity_config: Record<string, unknown>;
  false_alarm_count: number;
}

export interface Alert {
  id: string;
  order_id: string;
  alert_type: string;
  level: string;
  status: string;
  summary?: string | null;
  triggered_at: string;
}

export interface Device {
  id: string;
  name: string;
  device_type: string;
  status: string;
  device_code?: string | null;
  last_seen_at?: string | null;
  config?: Record<string, unknown>;
  raw_config?: Record<string, unknown>;
}

export interface RuleMatch {
  id: number;
  rule_id: string;
  rule_set_id: string;
  rule_name?: string | null;
  rule_set_name?: string | null;
  order_id: string;
  session_id: string;
  event_type: string;
  action: string;
  suppressed: boolean;
  matched_at: string;
  metrics: Record<string, unknown>;
}

export interface SummaryReport {
  orders?: Record<string, number>;
  alerts?: Record<string, number>;
  devices?: Record<string, number>;
  sessions?: Record<string, number>;
  events_last_24h?: number;
  rule_matches?: Record<string, number>;
}

export interface TrendReport {
  interval?: string;
  orders?: Array<Record<string, unknown>>;
  alerts?: Array<Record<string, unknown>>;
  devices?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  rule_matches?: Array<Record<string, unknown>>;
}

export interface EvidenceBundle {
  id: string;
  status: string;
  zip_media_id?: string | null;
  generated_at?: string | null;
}

export interface PickupCode {
  code: string;
  expires_at: string;
}

export interface GateVerification {
  order_id: string;
  merchant_name?: string | null;
  item_summary?: string | null;
  confirm_method: string;
  gate_name?: string | null;
  confirmed_at: string;
}

export interface GateVerifyResult {
  ok: boolean;
  order_id: string;
  order_status: string;
  merchant_name?: string | null;
  item_summary?: string | null;
  confirmation_id: string;
  gate_name?: string | null;
  verified_at: string;
}

export interface GuardSnapshot {
  orders: Order[];
  sessions: Session[];
  alerts: Alert[];
  devices: Device[];
  ruleMatches: RuleMatch[];
  summary: SummaryReport;
  trends: TrendReport;
  evidence: EvidenceBundle[];
}

export interface LiveEvent {
  type?: string;
  topic?: string;
  order?: Partial<Order>;
  alert?: Partial<Alert>;
  device?: Partial<Device>;
  payload?: Record<string, unknown>;
}
