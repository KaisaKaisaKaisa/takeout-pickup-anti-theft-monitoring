-- PostgreSQL schema for Takeout Guard
-- Requires: CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) UNIQUE NOT NULL,
  name varchar(64),
  password_hash text NOT NULL,
  default_pickup_window_min int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE edge_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  device_code varchar(32) UNIQUE NOT NULL,
  name varchar(64) NOT NULL,
  device_type varchar(24) NOT NULL,
  location_label varchar(128),
  status varchar(16) NOT NULL DEFAULT 'offline',
  stream_mode varchar(16) NOT NULL DEFAULT 'snapshot',
  last_seen_at timestamptz,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_edge_devices_owner_status ON edge_devices(owner_user_id, status);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider varchar(16) NOT NULL,
  provider_order_id varchar(64),
  merchant_name varchar(128),
  item_summary text,
  delivery_address text,
  status varchar(24) NOT NULL DEFAULT 'created',
  delivered_at timestamptz,
  expected_pickup_by timestamptz,
  monitoring_enabled boolean NOT NULL DEFAULT true,
  latest_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);

CREATE INDEX idx_orders_user_status_created ON orders(user_id, status, created_at DESC);

CREATE TABLE order_status_events (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  source varchar(24) NOT NULL,
  from_status varchar(24),
  to_status varchar(24) NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_events_order_time ON order_status_events(order_id, event_time DESC);

CREATE TABLE monitoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  edge_device_id uuid NOT NULL REFERENCES edge_devices(id),
  state varchar(24) NOT NULL DEFAULT 'armed',
  armed_at timestamptz NOT NULL DEFAULT now(),
  disarmed_at timestamptz,
  pickup_deadline_at timestamptz NOT NULL,
  presence_status varchar(16) NOT NULL DEFAULT 'unknown',
  roi_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitivity_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  false_alarm_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_order_created ON monitoring_sessions(order_id, created_at DESC);
CREATE INDEX idx_sessions_device_state ON monitoring_sessions(edge_device_id, state);

CREATE TABLE sensor_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES monitoring_sessions(id),
  device_id uuid NOT NULL REFERENCES edge_devices(id),
  event_type varchar(24) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info',
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_media_id uuid,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sensor_events_session_time ON sensor_events(session_id, event_time DESC);
CREATE INDEX idx_sensor_events_device_time ON sensor_events(device_id, event_time DESC);

CREATE TABLE whitelist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name varchar(64) NOT NULL,
  relation varchar(32),
  method_type varchar(24) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pickup_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  session_id uuid NOT NULL REFERENCES monitoring_sessions(id),
  confirmed_by_user_id uuid REFERENCES users(id),
  whitelist_profile_id uuid REFERENCES whitelist_profiles(id),
  confirm_method varchar(24) NOT NULL,
  note text,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pickup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  whitelist_profile_id uuid NOT NULL REFERENCES whitelist_profiles(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  code varchar(12) UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  session_id uuid NOT NULL REFERENCES monitoring_sessions(id),
  rule_id uuid REFERENCES rules(id),
  rule_set_id uuid REFERENCES rule_sets(id),
  alert_type varchar(24) NOT NULL,
  level varchar(16) NOT NULL DEFAULT 'warning',
  status varchar(24) NOT NULL DEFAULT 'open',
  trigger_sensor_event_id bigint,
  summary text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_order_time ON alert_incidents(order_id, triggered_at DESC);
CREATE INDEX idx_alerts_status_level_time ON alert_incidents(status, level, triggered_at DESC);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  session_id uuid REFERENCES monitoring_sessions(id),
  incident_id uuid REFERENCES alert_incidents(id),
  media_type varchar(16) NOT NULL,
  storage_provider varchar(16) NOT NULL,
  bucket_name varchar(64),
  object_key text NOT NULL,
  content_type varchar(64),
  duration_sec int,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 char(64),
  retention_class varchar(16) NOT NULL DEFAULT '24h',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_order_created ON media_assets(order_id, created_at DESC);
CREATE INDEX idx_media_incident_type ON media_assets(incident_id, media_type);

CREATE TABLE evidence_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES alert_incidents(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  status varchar(16) NOT NULL DEFAULT 'generating',
  zip_media_id uuid REFERENCES media_assets(id),
  manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  platform varchar(16) NOT NULL,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  device_fingerprint varchar(128),
  enabled boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_user_platform ON push_subscriptions(user_id, platform);

CREATE TABLE notification_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  incident_id uuid REFERENCES alert_incidents(id),
  channel varchar(16) NOT NULL,
  title varchar(128),
  status varchar(16) NOT NULL,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  action varchar(64) NOT NULL,
  resource_type varchar(32) NOT NULL,
  resource_id varchar(64),
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  name varchar(64) NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  scope varchar(16) NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id),
  name varchar(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  event_type varchar(24) NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action varchar(32) NOT NULL DEFAULT 'alert',
  action_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  cooldown_sec int NOT NULL DEFAULT 120,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rule_match_logs (
  id bigserial PRIMARY KEY,
  rule_id uuid NOT NULL REFERENCES rules(id),
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  session_id uuid NOT NULL REFERENCES monitoring_sessions(id),
  event_id bigint REFERENCES sensor_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  event_type varchar(24) NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action varchar(32) NOT NULL DEFAULT 'alert',
  suppressed boolean NOT NULL DEFAULT false,
  note text,
  matched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_match_logs_rule_time ON rule_match_logs(rule_id, matched_at DESC);
CREATE INDEX idx_rule_match_logs_user_time ON rule_match_logs(user_id, matched_at DESC);
