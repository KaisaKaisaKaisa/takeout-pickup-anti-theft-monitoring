from __future__ import annotations

import hashlib
import hmac
from types import SimpleNamespace
from datetime import datetime, timezone
from typing import Protocol

try:
    from app.core.config import settings
except Exception:
    settings = SimpleNamespace(require_device_hmac=False, device_signature_ttl_sec=300)

try:
    from app.core import cache
except Exception:
    class _MemoryCache:
        def __init__(self):
            self.store: dict[str, object] = {}

        async def aget(self, key: str):
            return self.store.get(key)

        async def aset(self, key: str, value: object, ttl_sec: int = 300) -> None:
            self.store[key] = value

    cache = _MemoryCache()


class DeviceLike(Protocol):
    id: object
    device_code: str


def _device_hmac_required() -> bool:
    return bool(getattr(settings, "require_device_hmac", False))


def _signature_ttl_sec() -> int:
    return int(getattr(settings, "device_signature_ttl_sec", 300))


def build_device_signature(secret: str, body: bytes, timestamp: str, nonce: str) -> str:
    message = b".".join(
        [
            str(timestamp).encode("utf-8"),
            str(nonce).encode("utf-8"),
            body or b"",
        ]
    )
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_device_signature(
    secret: str,
    body: bytes,
    timestamp: str | None,
    nonce: str | None,
    signature: str | None,
    *,
    now_ts: int | None = None,
    ttl_sec: int | None = None,
) -> tuple[bool, str]:
    if not timestamp or not nonce or not signature:
        return False, "Missing device signature headers"
    try:
        ts = int(timestamp)
    except ValueError:
        return False, "Invalid device signature timestamp"
    if now_ts is None:
        now_ts = int(datetime.now(timezone.utc).timestamp())
    if ttl_sec is None:
        ttl_sec = _signature_ttl_sec()
    if abs(now_ts - ts) > ttl_sec:
        return False, "Expired device signature"
    expected = build_device_signature(secret, body, timestamp, nonce)
    if not hmac.compare_digest(expected, signature):
        return False, "Invalid device signature"
    return True, ""


async def authenticate_device_request(
    device: DeviceLike,
    *,
    body: bytes = b"",
    x_device_code: str | None = None,
    x_device_timestamp: str | None = None,
    x_device_nonce: str | None = None,
    x_device_signature: str | None = None,
) -> None:
    x_device_timestamp = x_device_timestamp if isinstance(x_device_timestamp, str) else None
    x_device_nonce = x_device_nonce if isinstance(x_device_nonce, str) else None
    x_device_signature = x_device_signature if isinstance(x_device_signature, str) else None
    x_device_code = x_device_code if isinstance(x_device_code, str) else None
    signature_present = any([x_device_timestamp, x_device_nonce, x_device_signature])
    if signature_present:
        ok, reason = verify_device_signature(
            device.device_code,
            body,
            x_device_timestamp,
            x_device_nonce,
            x_device_signature,
        )
        if not ok:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail=reason)
        replay_key = f"device_nonce:{device.id}:{x_device_nonce}"
        if await cache.aget(replay_key):
            from fastapi import HTTPException

            raise HTTPException(status_code=409, detail="Device nonce replay")
        await cache.aset(replay_key, {"ok": True}, ttl_sec=_signature_ttl_sec())
        return

    if _device_hmac_required():
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Missing device signature headers")
    if not x_device_code or device.device_code != x_device_code:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Invalid device code")
