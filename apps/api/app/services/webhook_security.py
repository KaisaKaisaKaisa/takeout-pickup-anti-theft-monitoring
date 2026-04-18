from __future__ import annotations

import hashlib
import json

from app.core.config import settings

from app.core import cache

KNOWN_ORDER_STATUSES = {"created", "delivered", "picked_up"}

STATUS_MAP = {
    "created": "created",
    "new": "created",
    "pending": "created",
    "delivered": "delivered",
    "arrived": "delivered",
    "picked_up": "picked_up",
    "pickedup": "picked_up",
    "completed": "picked_up",
    "received": "picked_up",
}

def _parse_provider_secrets(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    parsed: dict[str, str] = {}
    for key, value in data.items():
        if value is None:
            continue
        parsed[str(key).lower()] = str(value)
    return parsed

def get_provider_secret(
    provider: str,
    mapping_raw: str | None = None,
    fallback: str | None = None,
) -> str | None:
    if mapping_raw is None:
        mapping_raw = settings.provider_webhook_secrets
    if fallback is None:
        fallback = settings.provider_webhook_secret
    mapping = _parse_provider_secrets(mapping_raw)
    secret = mapping.get(str(provider).lower())
    if secret:
        return secret
    return fallback or None

def normalize_status(raw: str | None) -> str | None:
    if not raw:
        return None
    status = STATUS_MAP.get(str(raw).lower(), str(raw).lower())
    if status in KNOWN_ORDER_STATUSES:
        return status
    return None


def _extract_event_time(payload: dict) -> str | None:
    for key in ("event_time", "eventTime", "occurred_at", "timestamp"):
        value = payload.get(key)
        if value:
            return str(value)
    return None


def build_idempotency_key(
    provider: str,
    payload: dict,
    event_id: str | None = None,
    raw_body: bytes | None = None,
) -> str:
    if event_id:
        base = f"event:{event_id}"
    else:
        status = normalize_status(payload.get("status"))
        provider_order_id = payload.get("provider_order_id") or payload.get("order_id") or ""
        event_time = _extract_event_time(payload) or ""
        if provider_order_id and status and event_time:
            base = f"{provider}|{provider_order_id}|{status}|{event_time}"
        elif raw_body:
            base = raw_body.decode("utf-8", errors="ignore")
        else:
            base = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return f"webhook_idem:{provider}:{digest}"


def check_and_store_nonce(provider: str, nonce: str, ttl_sec: int) -> bool:
    if not nonce:
        return True
    key = f"webhook_nonce:{provider}:{nonce}"
    if cache.get(key):
        return False
    cache.set(key, {"ok": True}, ttl_sec=ttl_sec)
    return True


def check_and_store_idempotency(key: str, ttl_sec: int) -> bool:
    if cache.get(key):
        return False
    cache.set(key, {"ok": True}, ttl_sec=ttl_sec)
    return True
