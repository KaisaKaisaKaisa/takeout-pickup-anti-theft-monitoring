# Report Cache Invalidation Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure report caches are invalidated after device and order changes that impact summary/trend metrics.

**Architecture:** Add missing `invalidate_report_caches(user_id)` calls in device and integration endpoints; add a minimal unit test to verify the helper is called from one representative path.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/routers/devices.py` (add cache invalidation after writes)
- Modify: `apps/api/app/routers/edge_ingest.py` (invalidate on heartbeat status changes)
- Modify: `apps/api/app/routers/integrations.py` (invalidate on mock delivered)
- Create: `apps/api/tests/test_report_cache_invalidation.py` (unit test)

---

## Chunk 1: Tests for Cache Invalidation

### Task 1: Add failing test

**Files:**
- Create: `apps/api/tests/test_report_cache_invalidation.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = AsyncMock()
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_core_security = types.ModuleType("app.core.security")
app_core_security.get_current_user = lambda: None
app_core_security.is_admin_user = lambda *_: False
sys.modules["app.core.security"] = app_core_security

app_core_db = types.ModuleType("app.core.db")
async def _get_db():
    yield None
app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_device_payload = lambda *_: {}
app_services_ws.build_event_payload = lambda *_: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

app_models = types.ModuleType("app.models.entities")
app_models.EdgeDevice = type("EdgeDevice", (), {})
sys.modules["app.models.entities"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "devices.py")

def load_module():
    spec = importlib.util.spec_from_file_location("devices_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class ReportCacheInvalidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_device_invalidates_report_cache(self):
        module = load_module()
        db = types.SimpleNamespace(add=lambda *_: None, commit=AsyncMock())
        user = types.SimpleNamespace(id="u1")
        payload = types.SimpleNamespace(device_code=None, name="d1", device_type="cam")
        await module.register_device(payload=payload, db=db, user=user)
        self.assertTrue(app_core_cache.invalidate_report_caches.called)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_report_cache_invalidation.py -v`  
Expected: FAIL (cache invalidation missing)

---

### Task 2: Implement cache invalidation

**Files:**
- Modify: `apps/api/app/routers/devices.py`
- Modify: `apps/api/app/routers/integrations.py`
- Modify: `apps/api/app/routers/edge_ingest.py`

- [ ] **Step 1: Add `invalidate_report_caches(user.id)` to device endpoints**
  - `register_device`, `update_device`, `update_device_config`, `apply_preset`.

- [ ] **Step 2: Add invalidation to `integrations.mock_delivered`**
  - After commit, call `invalidate_report_caches(user.id)`.

- [ ] **Step 3: Add invalidation to `edge_ingest.heartbeat`**
  - When `should_broadcast` is true (online transition or refresh), call `invalidate_report_caches(device.owner_user_id)`.

- [ ] **Step 4: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_report_cache_invalidation.py -v`  
Expected: PASS

---

## Chunk 2: Final Verification

- [ ] **Step 1: Run all report-related tests**

Run:
- `py -3.12 -m unittest apps/api/tests/test_report_cache_invalidation.py -v`

Expected: PASS

---

## Notes
- This repo is not a git repository in this environment. Skip commit steps if `git` fails.
