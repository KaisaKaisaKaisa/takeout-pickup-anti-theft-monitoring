# Webhook Provider Secret + Device Config Version Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持按平台回调密钥验签并增加设备配置版本下发与心跳回传。

**Architecture:** 在回调验签链路中新增 provider -> secret 映射解析与全局兜底；设备配置生成时计算稳定 `config_version`/`config_hash`，心跳回传应用版本并记录到设备配置元信息中。

**Tech Stack:** FastAPI, Python (unittest), SQLAlchemy, Pydantic Settings.

---

## Notes
- 当前目录不是 git 仓库，无法创建 worktree，也无法提交。若后续迁移到 git，可将每个任务末尾的 “Commit” 步骤恢复执行。

## File Map
- Modify: `apps/api/app/core/config.py`（新增 PROVIDER_WEBHOOK_SECRETS 配置）
- Modify: `.env.example`（新增 PROVIDER_WEBHOOK_SECRETS 示例）
- Modify: `apps/api/app/services/webhook_security.py`（新增 provider 密钥解析与获取）
- Modify: `apps/api/app/routers/integrations.py`（改为按 provider 取密钥）
- Create: `apps/api/tests/test_webhook_provider_secret.py`
- Modify: `apps/api/app/services/config_service.py`（生成 config_version/config_hash）
- Modify: `apps/api/app/routers/edge_ingest.py`（心跳回传 applied_config_version）
- Create: `apps/api/tests/test_device_config_version.py`
- Create: `apps/api/tests/test_device_heartbeat_applied_version.py`

---

## Chunk 1: Provider Webhook Secret

### Task 1: Provider 密钥解析与验签改造

**Files:**
- Create: `apps/api/tests/test_webhook_provider_secret.py`
- Modify: `apps/api/app/core/config.py`
- Modify: `.env.example`
- Modify: `apps/api/app/services/webhook_security.py`
- Modify: `apps/api/app/routers/integrations.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import os
import sys
import types
import unittest

try:
    import pydantic  # noqa: F401
    import pydantic_settings  # noqa: F401
except Exception:
    pydantic = types.ModuleType("pydantic")
    def Field(default=None, **kwargs):
        return default
    pydantic.Field = Field
    sys.modules["pydantic"] = pydantic

    pydantic_settings = types.ModuleType("pydantic_settings")
    class BaseSettings:
        def __init__(self, **kwargs):
            for key, value in self.__class__.__dict__.items():
                if key.startswith("_") or key == "Config":
                    continue
                setattr(self, key, value)
            for key, value in kwargs.items():
                setattr(self, key, value)
    pydantic_settings.BaseSettings = BaseSettings
    sys.modules["pydantic_settings"] = pydantic_settings

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

MODULE_PATH = os.path.join(base_dir, "app", "services", "webhook_security.py")

def load_module():
    spec = importlib.util.spec_from_file_location("webhook_security", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class WebhookProviderSecretTests(unittest.TestCase):
    def test_provider_secret_prefers_mapping(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw='{"meituan":"s1","eleme":"s2"}',
            fallback="fb",
        )
        self.assertEqual(secret, "s1")

    def test_provider_secret_fallback(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw="{}",
            fallback="fb",
        )
        self.assertEqual(secret, "fb")

    def test_provider_secret_none(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw="{}",
            fallback="",
        )
        self.assertIsNone(secret)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_webhook_provider_secret.py -v`  
Expected: FAIL with `AttributeError: module 'webhook_security' has no attribute 'get_provider_secret'`.

- [ ] **Step 3: Write minimal implementation**

Update `apps/api/app/core/config.py`:
```python
provider_webhook_secrets: str = Field(default="", validation_alias="PROVIDER_WEBHOOK_SECRETS")
```

Update `.env.example`:
```bash
PROVIDER_WEBHOOK_SECRETS={"meituan":"xxx","eleme":"yyy"}
```

Update `apps/api/app/services/webhook_security.py`:
```python
import json
from app.core.config import settings

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
```

Update `apps/api/app/routers/integrations.py`:
```python
from app.services.webhook_security import get_provider_secret

secret = get_provider_secret(provider)
if not secret:
    raise HTTPException(status_code=503, detail="Webhook not configured")
...
if not verify_signature(secret, body, x_provider_timestamp, x_provider_signature):
    raise HTTPException(status_code=401, detail="Invalid signature")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_webhook_provider_secret.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/api/tests/test_webhook_provider_secret.py apps/api/app/core/config.py .env.example \
  apps/api/app/services/webhook_security.py apps/api/app/routers/integrations.py
git commit -m "feat: support provider webhook secrets with fallback"
```

---

## Chunk 2: Device Config Version + Heartbeat Ack

### Task 2: Config Version 稳定生成

**Files:**
- Create: `apps/api/tests/test_device_config_version.py`
- Modify: `apps/api/app/services/config_service.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import os
import sys
import types
import unittest
import uuid

app_core_config = types.ModuleType("app.core.config")
app_core_config.settings = types.SimpleNamespace(
    default_min_motion_score=5000,
    default_max_weight_drop=-200,
    default_alert_cooldown_sec=120,
)
sys.modules["app.core.config"] = app_core_config

app_models = types.ModuleType("app.models.entities")
class _EdgeDevice:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
app_models.EdgeDevice = _EdgeDevice
sys.modules["app.models.entities"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "config_service.py")

def load_module():
    spec = importlib.util.spec_from_file_location("config_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class DeviceConfigVersionTests(unittest.TestCase):
    def test_config_version_stable_for_runtime_fields(self):
        config_service = load_module()
        device = _EdgeDevice(
            id=uuid.uuid4(),
            device_code="dev-1",
            config_json={
                "sensitivity": {"min_motion_score": 123},
                "last_heartbeat": {"seq": 1},
            },
        )
        cfg1 = config_service.build_device_config(device)
        version1 = cfg1.get("config_version")
        self.assertTrue(version1)

        device.config_json["last_heartbeat"] = {"seq": 2}
        device.config_json["last_applied_version"] = "v1"
        device.config_json["last_applied_at"] = "2026-03-16T10:00:00Z"
        cfg2 = config_service.build_device_config(device)
        version2 = cfg2.get("config_version")
        self.assertEqual(version1, version2)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_device_config_version.py -v`  
Expected: FAIL with missing `config_version` or unstable version assertion.

- [ ] **Step 3: Write minimal implementation**

Update `apps/api/app/services/config_service.py`:
```python
import hashlib
import json

RUNTIME_KEYS = {"last_heartbeat", "last_applied_version", "last_applied_at", "config_version", "config_hash"}

def _strip_runtime_fields(config: dict) -> dict:
    cleaned = deepcopy(config)
    for key in RUNTIME_KEYS:
        cleaned.pop(key, None)
    return cleaned

def _stable_config_hash(config: dict) -> str:
    payload = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def build_device_config(device: EdgeDevice) -> dict:
    base = {...}
    merged = _deep_merge(base, deepcopy(device.config_json or {}))
    merged["device_id"] = str(device.id)
    merged["device_code"] = device.device_code
    stripped = _strip_runtime_fields(merged)
    config_hash = _stable_config_hash(stripped)
    merged["config_hash"] = config_hash
    merged["config_version"] = config_hash
    return merged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_device_config_version.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/api/tests/test_device_config_version.py apps/api/app/services/config_service.py
git commit -m "feat: add stable device config version/hash"
```

### Task 3: Heartbeat 回传已应用版本

**Files:**
- Create: `apps/api/tests/test_device_heartbeat_applied_version.py`
- Modify: `apps/api/app/routers/edge_ingest.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import os
import sys
import types
import unittest
import uuid
from unittest.mock import AsyncMock

app_core_db = types.ModuleType("app.core.db")
async def _get_db():
    yield None
app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *_: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_core_ws = types.ModuleType("app.core.ws")
app_core_ws.broadcast_event = AsyncMock()
sys.modules["app.core.ws"] = app_core_ws

app_core = types.ModuleType("app.core")
app_core.ws = app_core_ws
sys.modules["app.core"] = app_core

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine.evaluate_sensor_event = AsyncMock(return_value=None)
sys.modules["app.services.alert_engine"] = app_services_alert_engine

app_services_push = types.ModuleType("app.services.push_service")
app_services_push.send_alert_push = AsyncMock()
sys.modules["app.services.push_service"] = app_services_push

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_device_payload = lambda *_: {}
app_services_ws.build_event_payload = lambda *_: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_services_config = types.ModuleType("app.services.config_service")
app_services_config.build_device_config = lambda *_: {}
sys.modules["app.services.config_service"] = app_services_config

app_services_alert_service = types.ModuleType("app.services.alert_service")
app_services_alert_service.emit_alert_event = AsyncMock()
sys.modules["app.services.alert_service"] = app_services_alert_service

app_schemas = types.ModuleType("app.schemas.schemas")
class _EdgeEventIn:  # placeholder
    pass
app_schemas.EdgeEventIn = _EdgeEventIn
sys.modules["app.schemas.schemas"] = app_schemas

app_models = types.ModuleType("app.models.entities")
class _EdgeDevice:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
app_models.EdgeDevice = _EdgeDevice
app_models.MonitoringSession = object
app_models.SensorEvent = object
app_models.Order = object
sys.modules["app.models.entities"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "edge_ingest.py")

def load_module():
    spec = importlib.util.spec_from_file_location("edge_ingest", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class _Result:
    def __init__(self, device):
        self._device = device
    def scalar_one_or_none(self):
        return self._device

class _DB:
    def __init__(self, device):
        self.device = device
        self.commit = AsyncMock()
    async def execute(self, *_args, **_kwargs):
        return _Result(self.device)

class HeartbeatAppliedVersionTests(unittest.IsolatedAsyncioTestCase):
    async def test_applied_version_recorded(self):
        module = load_module()
        device = _EdgeDevice(
            id=uuid.uuid4(),
            device_code="dev-1",
            status="offline",
            last_seen_at=None,
            config_json={},
            owner_user_id="u1",
        )
        db = _DB(device)
        payload = {"applied_config_version": "v1"}
        await module.heartbeat(device_id=str(device.id), payload=payload, db=db, x_device_code="dev-1")
        self.assertEqual(device.config_json.get("last_applied_version"), "v1")
        self.assertIn("last_applied_at", device.config_json)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_device_heartbeat_applied_version.py -v`  
Expected: FAIL because `last_applied_version`/`last_applied_at` 未写入。

- [ ] **Step 3: Write minimal implementation**

Update `apps/api/app/routers/edge_ingest.py` heartbeat:
```python
if payload:
    device.config_json = device.config_json or {}
    device.config_json["last_heartbeat"] = payload
    applied = payload.get("applied_config_version")
    if applied:
        device.config_json["last_applied_version"] = applied
        device.config_json["last_applied_at"] = now.isoformat()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_device_heartbeat_applied_version.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/api/tests/test_device_heartbeat_applied_version.py apps/api/app/routers/edge_ingest.py
git commit -m "feat: record applied config version from heartbeat"
```

---

## Final Verification

- [ ] Run all new tests:

```
py -3.12 -m unittest apps/api/tests/test_webhook_provider_secret.py -v
py -3.12 -m unittest apps/api/tests/test_device_config_version.py -v
py -3.12 -m unittest apps/api/tests/test_device_heartbeat_applied_version.py -v
```

Expected: PASS.
