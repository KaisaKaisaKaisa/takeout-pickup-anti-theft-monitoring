# Alert Unified Operations Design

## Summary
Unify alert side effects (WS broadcast, cache invalidation, audit logging, status updates)
behind a small `alert_service` API so alerts triggered from sensors, devices, timeouts,
and manual actions behave consistently.

## Goals
- One place to build alert WS payloads, including `is_update`.
- One place to apply alert status updates and emit `alert.updated`.
- Keep existing trigger timing and routing logic unchanged.
- Reduce drift between automated alerts and manual updates.

## Non-goals
- No new alert types or rule logic changes.
- No schema changes.
- No changes to front-end behavior beyond consistent payloads.

## Current Issues
- WS payloads and `is_update` fields are manually assembled in multiple places.
- Manual alert updates (`ack/resolve/false-positive`) duplicate side-effect logic.
- Hard to keep payload shape consistent across trigger paths.

## Proposed Design

### New Service: `app/services/alert_service.py`

1. `emit_alert_event(alert, event_name, user_id=None, extra=None)`
   - Build payload with `build_alert_payload(alert)` and `build_event_payload("alert", payload)`.
   - Inject `is_update` via `getattr(alert, "is_update", False)`.
   - Broadcast via `ws_hub.broadcast_event(event_name, payload)`.
   - If `user_id` provided, perform `invalidate_report_caches(user_id)` after DB commit.

2. `apply_alert_status(alert, status, user_id=None, audit=None)`
   - Set `alert.status` to the new status.
   - If `audit` provided, call `log_action` with `{user_id, action, entity_type, entity_id}`.
   - Commit the DB transaction at the caller or in the helper (implementation detail in plan).
   - Call `emit_alert_event(alert, "alert.updated", user_id=user_id)`.

### Integration Points

- `edge_ingest`: replace direct WS broadcast with `emit_alert_event`.
- `device_offline_checker`: replace WS broadcast with `emit_alert_event`.
- `timeout_checker`: replace WS broadcast with `emit_alert_event`.
- `alerts` router:
  - `ack`, `resolve`, `false-positive` call `apply_alert_status` instead of duplicating logic.
  - Keep existing auth/ownership checks.

### Data Flow (High Level)

1. Alert created or updated by `_upsert_alert`.
2. Caller sets any local changes (session state, etc.).
3. Caller calls `emit_alert_event` with `alert.triggered` or `alert.updated`.
4. Client receives consistent payload:
   - `alert_id`, `alert`, `is_update`, `entity` wrapper.

### Error Handling
- WS failures should not rollback DB state.
- Exceptions in broadcast should be logged and surfaced to logs but not crash the process.

### Testing

- Add unit tests for `alert_service`:
  - Ensure `emit_alert_event` includes `is_update` in payload.
  - Ensure `apply_alert_status` updates status and emits `alert.updated`.
- Keep existing `test_alert_dedupe.py` unchanged.

## Migration/Compatibility
- Existing payload shape remains compatible; only `is_update` is added/standardized.
- No DB migrations required.

## Open Questions
- Whether `emit_alert_event` should commit or assume caller commits.
- Whether `apply_alert_status` should always commit or return a flag for caller to commit.

