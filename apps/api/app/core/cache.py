from __future__ import annotations

import asyncio
import json
import logging
import time
from types import SimpleNamespace
from typing import Any

try:
    from app.core.config import settings
except Exception:
    settings = SimpleNamespace(redis_url="redis://localhost:6379/0")

logger = logging.getLogger(__name__)

_store: dict[str, tuple[float, Any]] = {}
_redis = None
_redis_degraded = False
_degrade_reason: str | None = None

try:
    from redis import asyncio as redis_asyncio

    _redis = redis_asyncio.from_url(settings.redis_url, decode_responses=True)
except Exception as exc:
    _redis = None
    _redis_degraded = True
    _degrade_reason = type(exc).__name__
    logger.warning("redis cache unavailable at startup; using in-memory fallback: %s", type(exc).__name__)


def _encode(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return json.dumps({"_raw": str(value)})


def _decode(payload: str) -> Any:
    try:
        return json.loads(payload)
    except Exception:
        return None


def _mark_degraded(exc: Exception) -> None:
    global _redis, _redis_degraded, _degrade_reason
    _redis_degraded = True
    _degrade_reason = type(exc).__name__
    _redis = None
    logger.warning("redis cache operation failed; using in-memory fallback: %s", type(exc).__name__)


def _get_memory(key: str) -> Any | None:
    entry = _store.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at < time.time():
        _store.pop(key, None)
        return None
    return value


async def aget(key: str) -> Any | None:
    if _redis is not None:
        try:
            payload = await _redis.get(key)
            if payload is None:
                return None
            return _decode(payload)
        except Exception as exc:
            _mark_degraded(exc)
    return _get_memory(key)


async def aset(key: str, value: Any, ttl_sec: int = 2) -> None:
    if _redis is not None:
        try:
            await _redis.setex(key, ttl_sec, _encode(value))
            return
        except Exception as exc:
            _mark_degraded(exc)
    _store[key] = (time.time() + ttl_sec, value)


async def ainvalidate(prefix: str | None = None) -> None:
    if _redis is not None:
        try:
            if not prefix:
                await _redis.flushdb()
            else:
                keys = [key async for key in _redis.scan_iter(match=f"{prefix}*")]
                if keys:
                    await _redis.delete(*keys)
        except Exception as exc:
            _mark_degraded(exc)
    if not prefix:
        _store.clear()
        return
    for key in list(_store.keys()):
        if key.startswith(prefix):
            _store.pop(key, None)


def _run_sync(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise RuntimeError("Use async cache API from a running event loop")


def get(key: str) -> Any | None:
    return _run_sync(aget(key))


def set(key: str, value: Any, ttl_sec: int = 2) -> None:
    _run_sync(aset(key, value, ttl_sec=ttl_sec))


def invalidate(prefix: str | None = None) -> None:
    _run_sync(ainvalidate(prefix))


async def close() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def probe_cache() -> dict[str, object]:
    if _redis is None:
        return {
            "ok": True,
            "backend": "memory",
            "degraded": True,
            "optional": True,
            "reason": _degrade_reason or "redis_unavailable",
        }
    try:
        pong = await _redis.ping()
        payload: dict[str, object] = {"ok": bool(pong), "backend": "redis"}
        if _redis_degraded:
            payload.update({"degraded": True, "optional": True, "reason": _degrade_reason or "operation_failed"})
        return payload
    except Exception as exc:
        _mark_degraded(exc)
        return {
            "ok": False,
            "backend": "redis",
            "degraded": True,
            "optional": True,
            "error": type(exc).__name__,
        }
