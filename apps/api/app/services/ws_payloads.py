from __future__ import annotations

from datetime import datetime

def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.isoformat()

def _get_attr(entity, key: str, default=None):
    if isinstance(entity, dict):
        return entity.get(key, default)
    return getattr(entity, key, default)

def build_order_payload(order) -> dict:
    return {
        "id": str(_get_attr(order, "id", "")),
        "provider": _get_attr(order, "provider", None),
        "status": _get_attr(order, "status", None),
        "merchant_name": _get_attr(order, "merchant_name", None),
        "item_summary": _get_attr(order, "item_summary", None),
        "delivered_at": _iso(_get_attr(order, "delivered_at", None)),
        "expected_pickup_by": _iso(_get_attr(order, "expected_pickup_by", None)),
        "latest_session_id": str(_get_attr(order, "latest_session_id", "")) if _get_attr(order, "latest_session_id", None) else None,
        "summary": _get_attr(order, "item_summary", None) or _get_attr(order, "merchant_name", None),
        "updated_at": _iso(_get_attr(order, "updated_at", None)),
    }

def build_alert_payload(alert) -> dict:
    return {
        "id": str(_get_attr(alert, "id", "")),
        "order_id": str(_get_attr(alert, "order_id", "")) if _get_attr(alert, "order_id", None) else None,
        "alert_type": _get_attr(alert, "alert_type", None),
        "level": _get_attr(alert, "level", None),
        "status": _get_attr(alert, "status", None),
        "summary": _get_attr(alert, "summary", None),
        "rule_id": str(_get_attr(alert, "rule_id", "")) if _get_attr(alert, "rule_id", None) else None,
        "rule_set_id": str(_get_attr(alert, "rule_set_id", "")) if _get_attr(alert, "rule_set_id", None) else None,
        "triggered_at": _iso(_get_attr(alert, "triggered_at", None)),
        "updated_at": _iso(_get_attr(alert, "updated_at", None)),
    }

def build_event_payload(entity_type: str, entity, extra: dict | None = None) -> dict:
    payload = {
        "version": "v1",
        "entity_type": entity_type,
        "entity": entity or {},
    }
    if extra:
        payload.update(extra)
    return payload

def build_device_payload(device) -> dict:
    return {
        "id": str(device.id),
        "name": device.name,
        "device_type": device.device_type,
        "status": device.status,
        "device_code": getattr(device, "device_code", None),
        "last_seen_at": _iso(getattr(device, "last_seen_at", None)),
        "config": getattr(device, "config_json", None),
        "summary": device.name,
        "updated_at": _iso(getattr(device, "last_seen_at", None)),
    }

def build_rule_match_payload(match, summary: str | None = None) -> dict:
    return {
        "id": getattr(match, "id", None),
        "rule_id": str(match.rule_id) if getattr(match, "rule_id", None) else None,
        "rule_set_id": str(match.rule_set_id) if getattr(match, "rule_set_id", None) else None,
        "order_id": str(match.order_id) if getattr(match, "order_id", None) else None,
        "session_id": str(match.session_id) if getattr(match, "session_id", None) else None,
        "event_type": getattr(match, "event_type", None),
        "action": getattr(match, "action", None),
        "suppressed": bool(getattr(match, "suppressed", False)),
        "note": getattr(match, "note", None),
        "matched_at": _iso(getattr(match, "matched_at", None)),
        "summary": summary,
        "updated_at": _iso(getattr(match, "matched_at", None)),
    }
