 # 2026-03-15 Backend Logic Optimization Design

## Status
- Draft (approved design from brainstorming)

## Goals
- Establish clear, enforceable permission boundaries for admin, user, and device access.
- Standardize platform callback security and idempotency.
- Strengthen rule engine → alert → report data flow so outputs are consistent and auditable.
- Expand reports to include rule match signals with reliable cache invalidation.

## Non-Goals
- Major schema refactors (no new RBAC tables).
- New UI/UX redesign work beyond wiring existing data.
- Multi-tenant org/group permissions.

## Current State (Summary)
- Admin detection via `admin_phones` in settings; no explicit roles table.
- Webhook supports HMAC signature + timestamp TTL, but lacks nonce/idempotency.
- Rule engine writes `RuleMatchLog` and can emit alerts; WS payloads are unified.
- Reports provide summary/trends for orders/alerts/events; no rule match series.
- Device endpoints use `x_device_code` checks; user endpoints use JWT.

## Proposed Design

### 1. Permission Boundaries (Admin / User / Device)
- **Admin**:
  - Can create/update global rule sets and access global reports.
  - Can list devices across all users (`?all=true`).
- **User**:
  - Can manage only their own rule sets, devices, orders, alerts, and reports.
  - No access to global scope.
- **Device**:
  - Only allowed to send sensor events and fetch its config using `x_device_code`.
  - No access to user endpoints or reports.

Implementation notes:
- Keep `is_admin_user` based on `admin_phones`.
- Use explicit checks in routers (rules, reports, devices, integrations).
- Add a helper for webhook + device scope checks if needed for consistency.

### 2. Platform Callback Security + Idempotency
- **Signature**: Keep `HMAC_SHA256(secret, "{timestamp}.{body}")`.
- **Nonce**:
  - Optional header `X-Provider-Nonce`.
  - If provided, store in Redis/cache with TTL = `provider_webhook_ttl_sec`.
  - Reject replay if nonce exists.
- **Idempotency**:
  - Compute a stable key from `(provider, provider_order_id, status, event_time)` or a hash of payload.
  - If key already processed (cache), return 200 with `{"ok": true, "duplicate": true}`.
- **Status mapping**:
  - Extend `STATUS_MAP` for common provider statuses.
  - Fallback to raw status only if it matches known states; else reject with 400.
- **Audit**:
  - Always log webhook events for a valid user link.

### 3. Rule Engine Enhancements
- **Evaluation order**:
  - `priority ASC`, `created_at DESC` within enabled rules.
- **Suppression**:
  - `cooldown_sec` creates `RuleMatchLog` with `suppressed=true` and `note="cooldown"`.
  - Continue evaluating later rules if suppressed.
- **Alert creation**:
  - Only create alert on first non-suppressed rule with `action=alert`.
  - Include `rule_id`, `rule_set_id` in alert metadata.
- **WS + API data**:
  - `RuleMatchLog` API returns `action`, `suppressed`, `note`, `rule_name`, `rule_set_name`.
  - WS payload remains unified (`entity_type`, `entity`, `summary`, `updated_at`).

### 4. Reports + Trends
- **Summary**:
  - Add `rule_matches` group: `total`, `suppressed`.
- **Trends**:
  - Add `rule_matches` series (daily/weekly buckets).
  - Export CSV includes rule match series.
- **Cache invalidation**:
  - Invalidate on rule match creation, alert status change, order status changes, device offline/online events.

### 5. Device Policy Strategy
- Standardize `config_json` schema to include:
  - `sensitivity.min_motion_score`
  - `sensitivity.max_weight_drop`
  - `sensitivity.alert_cooldown_sec`
- Ensure `evaluate_sensor_event` reads from config with fallbacks.
- Presets (existing endpoint) remain; add validation for preset names and audit logging.

### 6. Alert Linkage
- Alert status changes (`ack`, `resolve`, `false_positive`) must:
  - Write audit log
  - Invalidate report caches
  - Broadcast WS event with updated payload

## API Changes
- `POST /api/v1/integrations/providers/{provider}/order-status`
  - Optional headers: `X-Provider-Nonce`, `X-Provider-Event-Id`
  - Response may include `"duplicate": true`
- `GET /api/v1/rules/matches`
  - Returns `action`, `suppressed`, `note`, `rule_name`, `rule_set_name`
- `GET /api/v1/reports/summary`
  - Adds `rule_matches` object
- `GET /api/v1/reports/trends`
  - Adds `rule_matches` series
- `GET /api/v1/reports/trends/export`
  - Adds `rule_matches` rows

## Data Model
- No new tables required.
- Optional: if alert metadata needs rule link, store in alert `summary` or `meta_json`.

## Testing Plan
- Webhook:
  - Valid signature accepted, expired rejected.
  - Nonce replay rejected.
  - Duplicate event returns `duplicate=true`.
- Rules:
  - Cooldown produces suppressed match log.
  - Non-suppressed rule triggers alert once.
- Reports:
  - Rule match counts appear in summary/trends.
  - Export includes rule match rows.
- Permissions:
  - Admin can access global scopes.
  - User cannot access other users’ resources.
  - Device endpoints reject missing/invalid `x_device_code`.

## Rollout Plan
1. Implement permission checks + webhook nonce/idempotency.
2. Extend rule engine + alert linkage.
3. Expand report summary/trends + CSV.
4. Update PWA to render new fields (rule_matches series, summary).
