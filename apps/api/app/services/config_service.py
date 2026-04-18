from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from app.core.config import settings
from app.models.entities import EdgeDevice

DEVICE_PRESETS: dict[str, dict] = {
    "relaxed": {
        "sensitivity": {
            "min_motion_score": max(1000, settings.default_min_motion_score // 2),
            "max_weight_drop": min(-50, settings.default_max_weight_drop + 100),
            "alert_cooldown_sec": max(30, settings.default_alert_cooldown_sec // 2),
        }
    },
    "balanced": {
        "sensitivity": {
            "min_motion_score": settings.default_min_motion_score,
            "max_weight_drop": settings.default_max_weight_drop,
            "alert_cooldown_sec": settings.default_alert_cooldown_sec,
        }
    },
    "strict": {
        "sensitivity": {
            "min_motion_score": int(settings.default_min_motion_score * 1.4),
            "max_weight_drop": min(settings.default_max_weight_drop, -350),
            "alert_cooldown_sec": int(settings.default_alert_cooldown_sec * 1.5),
        }
    },
}

def _deep_merge(base: dict, extra: dict) -> dict:
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = _deep_merge(base[key], value)
        else:
            base[key] = value
    return base

RUNTIME_KEYS = {
    "last_heartbeat",
    "last_applied_version",
    "last_applied_at",
    "config_version",
    "config_hash",
}

def _strip_runtime_fields(config: dict) -> dict:
    cleaned = deepcopy(config)
    for key in RUNTIME_KEYS:
        cleaned.pop(key, None)
    return cleaned

def _stable_config_hash(config: dict) -> str:
    payload = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def merge_device_config(current: dict, payload: dict, replace: bool = False) -> dict:
    if replace:
        return deepcopy(payload)
    return _deep_merge(deepcopy(current or {}), deepcopy(payload or {}))

def build_device_config(device: EdgeDevice) -> dict:
    base = {
        "sensitivity": {
            "min_motion_score": settings.default_min_motion_score,
            "max_weight_drop": settings.default_max_weight_drop,
            "alert_cooldown_sec": settings.default_alert_cooldown_sec,
        }
    }
    merged = _deep_merge(base, deepcopy(device.config_json or {}))
    merged["device_id"] = str(device.id)
    merged["device_code"] = device.device_code
    stripped = _strip_runtime_fields(merged)
    config_hash = _stable_config_hash(stripped)
    merged["config_hash"] = config_hash
    merged["config_version"] = config_hash
    return merged

def apply_device_preset(device: EdgeDevice, preset: str) -> dict:
    if preset not in DEVICE_PRESETS:
        raise ValueError("Unknown preset")
    merged = _deep_merge(deepcopy(device.config_json or {}), deepcopy(DEVICE_PRESETS[preset]))
    device.config_json = merged
    return merged
