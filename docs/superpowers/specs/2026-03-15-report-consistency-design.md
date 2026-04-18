# Report Consistency Design

## Goal
Make `reports/summary`, `reports/trends`, and CSV exports consistent across user/global scopes and across all metric groups (orders, alerts, sessions, devices, events, rule_matches), while keeping the current API surface stable.

## Non-Goals
- No new database tables or materialized views.
- No background aggregation jobs.
- No UI redesign beyond field mapping and display alignment.

## Current Context
- Summary and trends are computed in `apps/api/app/services/report_service.py`.
- CSV exports use the same service but may omit fields or use inconsistent naming.
- Frontend consumes these endpoints and may apply its own assumptions.

## Consistency Rules
1. **Scope Alignment**
   - `scope=user`: filter by `user_id`.
   - `scope=global`: no user filter.
2. **Metric Alignment**
   - Each metric group must use the same base table and filters in both summary and trends.
3. **Time Window Alignment**
   - Summary uses explicit “last 24h” for events.
   - Trends use `interval=day` and `days` window.
   - Ensure both use the same timezone reference (`timezone.utc`).
4. **Export Alignment**
   - CSV exports must include all metric groups present in API responses.
   - Column naming must be stable and consistent with API field names.

## Backend Changes
1. **Report Service**
   - Consolidate query filters into shared helpers:
     - `apply_user_scope(stmt, user_id)`
     - `apply_time_scope(stmt, since)`
   - Ensure `orders/alerts/sessions/devices/events/rule_matches` use identical filters in `get_summary` and `get_trends`.
2. **CSV Export**
   - `export_trends_csv`: include `rule_matches` series.
   - `export_report_summary_csv`: include `rule_matches` metrics.

## Frontend Changes
1. **Field Mapping**
   - Normalize field names for summary/trends.
   - Provide fallback display for legacy fields (if missing).
2. **Presentation**
   - Ensure the same metric definitions appear in summary cards and charts.
   - Ensure CSV export labels match displayed labels.

## Testing
1. **Backend Unit Tests**
   - Summary and trends include identical metric groups.
   - CSV exports include the same metric groups as API.
2. **Frontend Tests**
   - Field mapping unit tests for summary and trends.
   - Snapshot tests for chart input structure (optional).

## Rollout
- Backward compatible for API consumers.
- Frontend is tolerant to missing fields via fallbacks.
