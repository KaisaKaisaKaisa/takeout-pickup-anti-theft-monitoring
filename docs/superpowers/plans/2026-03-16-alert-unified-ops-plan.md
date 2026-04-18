# Alert Unified Operations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize alert broadcasts and status updates so all alert flows emit consistent payloads and side effects.

**Architecture:** Add an `alert_service` with two helpers (`emit_alert_event`, `apply_alert_status`). Replace duplicated WS broadcast/side-effect code in `edge_ingest`, `device_offline_checker`, `timeout_checker`, and `alerts` router to call these helpers.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `unittest`.

---

## File Structure

- Create: `apps/api/app/services/alert_service.py` (unified alert emit + status update helpers)
- Modify: `apps/api/app/routers/edge_ingest.py` (use helper for alert WS broadcast)
- Modify: `apps/api/app/services/device_offline_checker.py` (use helper for alert WS broadcast)
- Modify: `apps/api/app/services/timeout_checker.py` (use helper for alert WS broadcast)
- Modify: `apps/api/app/routers/alerts.py` (use helper for ack/resolve/false-positive)
- Create: `apps/api/tests/test_alert_service.py` (unit tests for helper behavior)

---

## Chunk 1: Alert Service + Tests

### Task 1: Add failing tests for `alert_service`

**Files:**
- Create: `apps/api/tests/test_alert_service.py`

- [ ] **Step 1: Write the failing tests**

```python
import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock

app_core_ws = types.ModuleType("app.core.ws")
app_core_ws.broadcast_event = AsyncMock()
sys.modules["app.core.ws"] = app_core_ws

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *args, **kwargs: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_ws_payloads = types.ModuleType("app.services.ws_payloads")
app_services_ws_payloads.build_alert_payload = lambda alert: {"id": getattr(alert, "id", None)}
app_services_ws_payloads.build_event_payload = lambda entity_type, payload: {"entity": payload}
sys.modules["app.services.ws_payloads"] = app_services_ws_payloads

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "alert_service.py")

def load_module():
    spec = importlib.util.spec_from_file_location("alert_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class AlertServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_emit_alert_event_includes_is_update(self):
        module = load_module()
        alert = types.SimpleNamespace(id="a1", is_update=True)
        await module.emit_alert_event(alert, "alert.triggered", user_id=None)
        args, _ = app_core_ws.broadcast_event.await_args
        self.assertEqual(args[0], "alert.triggered")
        payload = args[1]
        self.assertIn("is_update", payload)
        self.assertTrue(payload["is_update"])

    async def test_apply_alert_status_updates_and_broadcasts(self):
        module = load_module()
        alert = types.SimpleNamespace(id="a1", status="open", is_update=False)
        db = types.SimpleNamespace(commit=AsyncMock())
        await module.apply_alert_status(
            db=db,
            alert=alert,
            status="resolved",
            user_id="u1",
            audit={"user_id": "u1", "action": "alert.resolve"},
        )
        self.assertEqual(alert.status, "resolved")
        self.assertTrue(app_core_ws.broadcast_event.called)
        self.assertTrue(db.commit.called)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_service.py -v`  
Expected: FAIL (module missing)

---

### Task 2: Implement `alert_service`

**Files:**
- Create: `apps/api/app/services/alert_service.py`

- [ ] **Step 1: Implement minimal helper code**

```python
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_service.py -v`  
Expected: PASS

---

## Chunk 2: Wire Helpers Into Existing Flows

### Task 3: Update alert broadcasts in ingest and background tasks

**Files:**
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`
- Modify: `apps/api/app/services/timeout_checker.py`

- [ ] **Step 1: Replace direct WS broadcast with `emit_alert_event`**
  - Import `emit_alert_event` in each file.
  - Replace `ws_hub.broadcast_event("alert.triggered", ...)` blocks with:

```python
await emit_alert_event(alert, "alert.triggered")
```

- [ ] **Step 2: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`  
Expected: PASS

---

### Task 4: Update manual alert status endpoints

**Files:**
- Modify: `apps/api/app/routers/alerts.py`

- [ ] **Step 1: Replace status update blocks**
  - Import `apply_alert_status`.
  - In `ack_alert`, `resolve_alert`, `false_positive`, replace status + audit + broadcast + cache logic with:

```python
await apply_alert_status(
    db=db,
    alert=alert,
    status="<status>",
    user_id=user.id,
    audit={"user_id": user.id, "action": "<action>"},
)
```

- [ ] **Step 2: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_alert_service.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all alert-related tests**

Run:
- `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`
- `py -3.12 -m unittest apps/api/tests/test_alert_service.py -v`

Expected: PASS

---

## Notes
- This repo is not a git repository in this environment. Skip commit steps if `git` fails.
