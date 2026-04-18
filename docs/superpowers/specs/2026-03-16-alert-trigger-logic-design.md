# Alert Trigger Logic Design

## Goal
Reduce alert noise while preserving forensic history by deduplicating alerts per
session/type/rule during cooldown windows. Rule match logs remain the source of
truth for every trigger.

## Non-Goals
- No new tables or background jobs.
- No changes to the external API surface beyond optional payload metadata.
- No changes to rule evaluation semantics (conditions/action/cooldown stay).

## Current Context
- Alerts are created in `app/services/alert_engine.py` from both sensor events and
  rule-triggered actions.
- Rule matches are already persisted in `RuleMatchLog`.
- Alert records have `status` and `triggered_at` but no `updated_at`.

## Decision Summary
- Use a dedupe key `(session_id, alert_type, rule_id?)`.
- If an open alert with the same key exists:
  - Inside cooldown: update existing alert fields (summary + triggered_at).
  - Outside cooldown: resolve old alert, create a new alert.
- Rule matches always persist regardless of dedupe.

## Behavior Details

### Dedupe Key
- `session_id`: current monitoring session.
- `alert_type`: "rule_triggered" for rules, "suspicious_pickup" for sensor events.
- `rule_id`: present for rule alerts, `None` for sensor alerts.

### Cooldown Window
Use the same cooldown source as today:
- Rule alerts: `rule.cooldown_sec`.
- Sensor alerts: `session.sensitivity_config.alert_cooldown_sec` (fallback to default).

### Update vs New
If an open alert exists for the key:
- `now - last.triggered_at <= cooldown`:
  - Update `triggered_at` to now.
  - Update `summary` to include latest event info.
  - Do not create a new alert record.
- Else:
  - Mark old alert `status = "resolved"` (or keep existing resolved state if already).
  - Create a new alert record.

### Rule Match Path
1. Evaluate rules.
2. Persist `RuleMatchLog` with `suppressed` state as now.
3. If `suppressed=True`, return without alert.
4. If `action=alert`, run dedupe logic to update/create alert.

### Sensor Event Path
1. Filter by `session.state` and `SUSPICIOUS_EVENT_TYPES`.
2. Apply thresholds as now.
3. Run dedupe logic to update/create alert.

### WebSocket Payload
Add optional metadata to alert payload (non-breaking):
- `is_update`: boolean when an existing alert was updated.
- `dedupe_key`: string for debugging (optional).

### Cache Invalidation
On new alert or update, invalidate report caches for the affected user.

## Testing
- Rule path: same session + rule triggers twice within cooldown -> single open alert updated.
- Rule path: triggers outside cooldown -> old alert resolved, new alert created.
- Sensor path: same event type within cooldown -> single alert updated.
- Report invalidation called for updates as well as new alerts.

## Rollout
- Backward compatible; clients ignoring new payload fields still behave correctly.
- Frontend can choose to refresh alerts on update events.
