import time
import json
from typing import Any
from app.core.config import settings

_store: dict[str, tuple[float, Any]] = {}
_redis = None

try:
    import redis
    _redis = redis.from_url(settings.redis_url, decode_responses=True)
except Exception:
    _redis = None

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

def get(key: str) -> Any | None:
    if _redis is not None:
        try:
            payload = _redis.get(key)
            if payload is None:
                return None
            return _decode(payload)
        except Exception:
            pass
    entry = _store.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at < time.time():
        _store.pop(key, None)
        return None
    return value

def set(key: str, value: Any, ttl_sec: int = 2) -> None:
    if _redis is not None:
        try:
            _redis.setex(key, ttl_sec, _encode(value))
            return
        except Exception:
            pass
    _store[key] = (time.time() + ttl_sec, value)

def invalidate(prefix: str | None = None) -> None:
    if _redis is not None:
        try:
            if not prefix:
                _redis.flushdb()
            else:
                keys = list(_redis.scan_iter(match=f"{prefix}*"))
                if keys:
                    _redis.delete(*keys)
        except Exception:
            pass
    if not prefix:
        _store.clear()
        return
    for key in list(_store.keys()):
        if key.startswith(prefix):
            _store.pop(key, None)
