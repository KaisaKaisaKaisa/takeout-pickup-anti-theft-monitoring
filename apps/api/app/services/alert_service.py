from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.services.ws_payloads import build_alert_payload, build_event_payload
from app.services.audit_service import log_action

async def emit_alert_event(alert, event_name: str, user_id=None, extra: dict | None = None) -> None:
    alert_payload = build_alert_payload(alert)
    payload = {
        "alert_id": str(getattr(alert, "id", "")),
        "is_update": bool(getattr(alert, "is_update", False)),
        "alert": alert_payload,
        **build_event_payload("alert", alert_payload),
    }
    if extra:
        payload.update(extra)
    await ws_hub.broadcast_event(event_name, payload)
    if user_id:
        invalidate_report_caches(user_id)

async def apply_alert_status(
    db,
    alert,
    status: str,
    user_id=None,
    audit: dict | None = None,
) -> None:
    alert.status = status
    if audit:
        await log_action(
            db,
            audit.get("user_id"),
            audit.get("action"),
            audit.get("resource_type", "alert"),
            audit.get("resource_id", str(getattr(alert, "id", ""))),
            audit.get("meta"),
        )
    await db.commit()
    if user_id:
        invalidate_report_caches(user_id)
    await emit_alert_event(alert, "alert.updated")
