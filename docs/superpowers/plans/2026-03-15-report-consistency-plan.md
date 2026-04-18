# Report Consistency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align report summary, trends, and CSV exports across scopes and metric groups; update frontend mapping for consistent display.

**Architecture:** Centralize report filters and ensure metrics across summary/trends/export use identical group definitions. Adjust frontend mapping to tolerate missing fields and display consistent labels.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `unittest`, PWA vanilla JS.

---

## File Structure

- Modify: `apps/api/app/services/report_service.py` (shared filters and metrics alignment)
- Modify: `apps/api/app/routers/reports.py` (optional cache key changes if needed)
- Modify: `apps/pwa/src/app.js` (summary & trends mapping)
- Modify: `apps/pwa/src/rules.js` (if charts map metrics)
- Create: `apps/api/tests/test_report_consistency.py`
- Create: `apps/pwa/tests/report_mapping.test.js`

---

## Chunk 1: Backend Report Consistency

### Task 1: Add backend consistency test

**Files:**
- Create: `apps/api/tests/test_report_consistency.py`

- [ ] **Step 1: Write the failing test**

```python
import os
import sys
import unittest
import types
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
sqlalchemy.func = types.SimpleNamespace()
sqlalchemy.case = _noop
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
sqlalchemy_ext_asyncio.AsyncSession = object
sqlalchemy_ext.asyncio = sqlalchemy_ext_asyncio
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

entities = types.ModuleType("app.models.entities")
for name in [
    "User",
    "AlertIncident",
    "Order",
    "OrderStatusEvent",
    "AuditLog",
    "EdgeDevice",
    "MonitoringSession",
    "SensorEvent",
    "RuleMatchLog",
    "RuleSet",
    "Rule",
]:
    setattr(entities, name, type(name, (), {}))
entities.Base = type("Base", (), {})
sys.modules["app.models.entities"] = entities
app_models = types.ModuleType("app.models")
app_models.entities = entities
sys.modules["app.models"] = app_models

import importlib.util

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "report_service.py")


def load_module():
    spec = importlib.util.spec_from_file_location("report_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReportConsistencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_and_trends_have_same_groups(self):
        report_service = load_module()
        summary = {
            "orders": {"total": 1},
            "alerts": {"total": 1},
            "devices": {"total": 1},
            "sessions": {"total": 1},
            "events_last_24h": 1,
            "rule_matches": {"total": 1, "suppressed": 0},
        }
        trends = {
            "interval": "day",
            "orders": [],
            "alerts": [],
            "devices": [],
            "sessions": [],
            "events": [],
            "rule_matches": [],
        }
        with patch.object(report_service, "get_summary", new=AsyncMock(return_value=summary)), \
             patch.object(report_service, "get_trends", new=AsyncMock(return_value=trends)):
            summary_csv = await report_service.export_report_summary_csv(db=None)
            trends_csv = await report_service.export_trends_csv(db=None)
        text_summary = summary_csv.decode("utf-8")
        text_trends = trends_csv.decode("utf-8")
        self.assertIn("rule_matches", text_summary)
        self.assertIn("rule_matches", text_trends)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_report_consistency.py -v`
Expected: FAIL (before implementation updates)

- [ ] **Step 3: Implement backend alignment**

Update `apps/api/app/services/report_service.py`:
- Ensure summary includes `devices`, `sessions`, `events_last_24h`, `rule_matches`
- Ensure trends include `devices`, `sessions`, `events`, `rule_matches`
- Add shared helper for scope filtering if needed

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_report_consistency.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/report_service.py apps/api/tests/test_report_consistency.py
git commit -m "feat: align report summary and trends metrics"
```

---

## Chunk 2: Frontend Mapping Consistency

### Task 2: Add frontend mapping test

**Files:**
- Create: `apps/pwa/tests/report_mapping.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { normalizeSummary, normalizeTrends } from "../src/report_mapping.js";

test("normalizeSummary provides default groups", () => {
  const data = { orders: { total: 1 } };
  const normalized = normalizeSummary(data);
  expect(normalized.rule_matches).toBeDefined();
  expect(normalized.events_last_24h).toBeDefined();
});

test("normalizeTrends provides default groups", () => {
  const data = { interval: "day", orders: [] };
  const normalized = normalizeTrends(data);
  expect(normalized.rule_matches).toBeDefined();
  expect(normalized.events).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node apps/pwa/tests/report_mapping.test.js`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement mapping helper**

Create `apps/pwa/src/report_mapping.js`:

```javascript
export function normalizeSummary(data = {}) {
  return {
    orders: data.orders || { total: 0 },
    alerts: data.alerts || { total: 0 },
    devices: data.devices || { total: 0 },
    sessions: data.sessions || { total: 0 },
    events_last_24h: data.events_last_24h ?? 0,
    rule_matches: data.rule_matches || { total: 0, suppressed: 0 },
  };
}

export function normalizeTrends(data = {}) {
  return {
    interval: data.interval || "day",
    orders: data.orders || [],
    alerts: data.alerts || [],
    devices: data.devices || [],
    sessions: data.sessions || [],
    events: data.events || [],
    rule_matches: data.rule_matches || [],
  };
}
```

- [ ] **Step 4: Wire helper into frontend**

Update `apps/pwa/src/app.js` to use `normalizeSummary` and `normalizeTrends`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node apps/pwa/tests/report_mapping.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/report_mapping.js apps/pwa/src/app.js apps/pwa/tests/report_mapping.test.js
git commit -m "feat: normalize report mapping in frontend"
```

---

## Verification

- [ ] `py -3.12 -m unittest apps/api/tests/test_report_consistency.py -v`
- [ ] `node apps/pwa/tests/report_mapping.test.js`
