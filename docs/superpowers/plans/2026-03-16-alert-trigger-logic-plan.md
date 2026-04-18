# Alert Trigger Logic Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate alerts during cooldown windows while preserving rule-match history, and unify alert update/new creation behavior.

**Architecture:** Introduce an alert dedupe helper in `alert_engine.py` keyed by `(session_id, alert_type, rule_id)` that updates existing open alerts within cooldown and creates new alerts when cooldown expires. Keep rule match logs unchanged and broadcast alert updates with metadata.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/services/alert_engine.py` (dedupe helper + apply in rule/sensor flows)
- Modify: `apps/api/app/services/ws_payloads.py` (optional alert payload metadata)
- Modify: `apps/api/app/routers/edge_ingest.py` (emit update flag if alert updated)
- Create: `apps/api/tests/test_alert_dedupe.py`
- (Optional) Update: `docs/spec.md` (alert dedupe behavior note)

---

## Chunk 1: Backend Dedupe Helper + Tests

### Task 1: Add dedupe tests

**Files:**
- Create: `apps/api/tests/test_alert_dedupe.py`

- [ ] **Step 1: Write the failing tests**

```python
import importlib.util
import os
import sys
import unittest
import types
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

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

sqlalchemy = types.ModuleType("sqlalchemy")

def _noop(*args, **kwargs):
    return None

sqlalchemy.select = _noop
sqlalchemy.case = _noop
sqlalchemy.func = types.SimpleNamespace()
sqlalchemy.String = _noop
sqlalchemy.Text = _noop
sqlalchemy.Boolean = _noop
sqlalchemy.Integer = _noop
sqlalchemy.BigInteger = _noop
sqlalchemy.ForeignKey = _noop
sqlalchemy.JSON = _noop
sqlalchemy.DateTime = _noop
sys.modules["sqlalchemy"] = sqlalchemy

sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")
class _MappedStub:
    def __class_getitem__(cls, item):
        return cls

sqlalchemy_orm.Mapped = _MappedStub
sqlalchemy_orm.mapped_column = _noop
class _DeclarativeBaseStub:
    pass

sqlalchemy_orm.DeclarativeBase = _DeclarativeBaseStub
sys.modules["sqlalchemy.orm"] = sqlalchemy_orm

sqlalchemy_dialects = types.ModuleType("sqlalchemy.dialects")
sqlalchemy_dialects_postgresql = types.ModuleType("sqlalchemy.dialects.postgresql")
sqlalchemy_dialects_postgresql.UUID = _noop
sqlalchemy_dialects.postgresql = sqlalchemy_dialects_postgresql
sys.modules["sqlalchemy.dialects"] = sqlalchemy_dialects
sys.modules["sqlalchemy.dialects.postgresql"] = sqlalchemy_dialects_postgresql

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sqlalchemy_ext_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
class _AsyncSessionStub:
    pass

sqlalchemy_ext_asyncio.AsyncSession = _AsyncSessionStub
sqlalchemy_ext.asyncio = sqlalchemy_ext_asyncio
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

entities = types.ModuleType("app.models.entities")
for name in [
    "AlertIncident",
    "MonitoringSession",
    "SensorEvent",
    "RuleSet",
    "Rule",
    "Order",
    "RuleMatchLog",
]:
    setattr(entities, name, type(name, (), {}))
entities.Base = type("Base", (), {})
sys.modules["app.models.entities"] = entities
app_models = types.ModuleType("app.models")
app_models.entities = entities
sys.modules["app.models"] = app_models

app_core_ws = types.ModuleType("app.core.ws")
async def _noop_ws(*args, **kwargs):
    return None

app_core_ws.broadcast_event = _noop_ws
sys.modules["app.core.ws"] = app_core_ws

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *args, **kwargs: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_rule_utils = types.ModuleType("app.services.rule_engine_utils")
app_services_rule_utils.is_within_cooldown = lambda *args, **kwargs: False
sys.modules["app.services.rule_engine_utils"] = app_services_rule_utils

app_services_ws_payloads = types.ModuleType("app.services.ws_payloads")
app_services_ws_payloads.build_rule_match_payload = lambda *args, **kwargs: {}
app_services_ws_payloads.build_event_payload = lambda *args, **kwargs: {}
sys.modules["app.services.ws_payloads"] = app_services_ws_payloads

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "alert_engine.py")


def load_module():
    spec = importlib.util.spec_from_file_location("alert_engine", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AlertDedupeTests(unittest.IsolatedAsyncioTestCase):
    async def test_dedupe_updates_open_alert_within_cooldown(self):
        engine = load_module()
        now = datetime.now(timezone.utc)
        existing = types.SimpleNamespace(
            id="a1",
            status="open",
            triggered_at=now - timedelta(seconds=30),
            summary="old",
        )
        db = types.SimpleNamespace()
        db.execute = AsyncMock(return_value=types.SimpleNamespace(scalar_one_or_none=lambda: existing))
        db.add = AsyncMock()
        db.flush = AsyncMock()
        result = await engine._upsert_alert(
            db=db,
            session_id="s1",
            order_id="o1",
            alert_type="rule_triggered",
            level="warning",
            summary="new",
            rule_id=None,
            rule_set_id=None,
            cooldown_sec=60,
            now=now,
        )
        self.assertEqual(result["action"], "updated")
        self.assertEqual(existing.summary, "new")
        self.assertEqual(existing.triggered_at, now)

    async def test_dedupe_creates_new_alert_outside_cooldown(self):
        engine = load_module()
        now = datetime.now(timezone.utc)
        existing = types.SimpleNamespace(
            id="a1",
            status="open",
            triggered_at=now - timedelta(seconds=120),
            summary="old",
        )
        db = types.SimpleNamespace()
        db.execute = AsyncMock(return_value=types.SimpleNamespace(scalar_one_or_none=lambda: existing))
        db.add = AsyncMock()
        db.flush = AsyncMock()
        result = await engine._upsert_alert(
            db=db,
            session_id="s1",
            order_id="o1",
            alert_type="rule_triggered",
            level="warning",
            summary="new",
            rule_id=None,
            rule_set_id=None,
            cooldown_sec=60,
            now=now,
        )
        self.assertEqual(result["action"], "created")
        self.assertEqual(existing.status, "resolved")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`
Expected: FAIL (helper not implemented)

- [ ] **Step 3: Implement `_upsert_alert` helper**

In `apps/api/app/services/alert_engine.py`:
- Add an async helper `_upsert_alert(...)` returning `{ "alert": AlertIncident, "action": "created"|"updated" }`.
- Lookup existing open alert by `session_id`, `alert_type`, `rule_id` (nullable), `status == "open"`.
- If found and within cooldown: update `triggered_at` and `summary`; return `updated`.
- If found and cooldown expired: set status `resolved`, create new alert, return `created`.
- If not found: create new alert, return `created`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/alert_engine.py apps/api/tests/test_alert_dedupe.py
git commit -m "feat: dedupe alerts within cooldown"
```

---

## Chunk 2: Wire Dedupe into Rule/Sensor Paths

### Task 2: Update alert creation flows

**Files:**
- Modify: `apps/api/app/services/alert_engine.py`

- [ ] **Step 1: Update sensor event path**
- Replace direct `AlertIncident(...)` creation with `_upsert_alert(...)`.
- Maintain `session.state = "alerted"` when alert created/updated.
- Ensure `invalidate_report_caches(user_id)` called on update and create.

- [ ] **Step 2: Update rule action path**
- Replace direct rule alert creation with `_upsert_alert(...)`.
- Ensure `rule_id` and `rule_set_id` passed into helper.

- [ ] **Step 3: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/services/alert_engine.py
git commit -m "feat: apply alert dedupe to rule and sensor alerts"
```

---

## Chunk 3: WS Payload Metadata (Optional)

### Task 3: Add `is_update` to broadcast payloads

**Files:**
- Modify: `apps/api/app/services/alert_engine.py`
- Modify: `apps/api/app/routers/edge_ingest.py`

- [ ] **Step 1: Extend `_upsert_alert` return to include `is_update`**

- [ ] **Step 2: When broadcasting `alert.triggered`, include `is_update` flag**

- [ ] **Step 3: Add test (optional) or manual verification**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/services/alert_engine.py apps/api/app/routers/edge_ingest.py
git commit -m "feat: mark alert updates in ws payload"
```

---

## Verification

- [ ] `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`

---

## Notes
- Repository is not a git repo in this environment; if `git` commands fail, skip commits.
