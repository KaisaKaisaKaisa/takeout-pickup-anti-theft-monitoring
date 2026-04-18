# Provider Webhook Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden provider webhook verification and replay protection while preserving current API behavior.

**Architecture:** Keep the single shared secret, add stricter validation and clearer failure paths, and add tests for signature, timestamp, nonce, idempotency, and status mapping.

**Tech Stack:** FastAPI, Python `unittest`, HMAC-SHA256.

---

## File Structure

- Modify: `apps/api/app/routers/integrations.py` (verification and error paths)
- Create: `apps/api/tests/test_webhook_hardening.py` (unit tests)

---

## Chunk 1: Tests

### Task 1: Add failing tests

**Files:**
- Create: `apps/api/tests/test_webhook_hardening.py`

- [ ] **Step 1: Write the failing tests**

```python
import hashlib
import hmac
import importlib.util
import json
import os
import sys
import types
import unittest

from datetime import datetime, timezone

app_core_config = types.ModuleType("app.core.config")
class _Settings:
    provider_webhook_secret = "secret"
    provider_webhook_ttl_sec = 60
app_core_config.settings = _Settings()
sys.modules["app.core.config"] = app_core_config

app_core_db = types.ModuleType("app.core.db")
async def _get_db():
    yield None
app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_security = types.ModuleType("app.core.security")
app_core_security.get_current_user = lambda: None
sys.modules["app.core.security"] = app_core_security

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *_: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_webhook = types.ModuleType("app.services.webhook_security")
app_services_webhook.normalize_status = lambda s: s
app_services_webhook.build_idempotency_key = lambda *_args, **_kwargs: "k"
app_services_webhook.check_and_store_nonce = lambda *_args, **_kwargs: True
app_services_webhook.check_and_store_idempotency = lambda *_args, **_kwargs: True
sys.modules["app.services.webhook_security"] = app_services_webhook

app_services_order_state = types.ModuleType("app.services.order_state")
class InvalidStatusTransition(ValueError):
    pass
async def apply_order_status(*_args, **_kwargs):
    return None
app_services_order_state.InvalidStatusTransition = InvalidStatusTransition
app_services_order_state.apply_order_status = apply_order_status
sys.modules["app.services.order_state"] = app_services_order_state

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = lambda *_args, **_kwargs: None
sys.modules["app.services.audit_service"] = app_services_audit

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_event_payload = lambda *_args, **_kwargs: {}
app_services_ws.build_order_payload = lambda *_args, **_kwargs: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_models = types.ModuleType("app.models.entities")
app_models.Order = type("Order", (), {})
app_models.User = type("User", (), {})
sys.modules["app.models.entities"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "integrations.py")

def load_module():
    spec = importlib.util.spec_from_file_location("integrations", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class WebhookHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def test_signature_mismatch_unauthorized(self):
        module = load_module()
        body = json.dumps({"status": "delivered"}).encode("utf-8")
        ts = str(int(datetime.now(timezone.utc).timestamp()))
        ok = module.verify_signature("secret", body, ts, "bad")
        self.assertFalse(ok)

    async def test_expired_timestamp_rejected(self):
        module = load_module()
        now = int(datetime.now(timezone.utc).timestamp())
        expired = str(now - 9999)
        body = b"{}"
        sig = hmac.new(b"secret", msg=(f"{expired}.".encode("utf-8") + body), digestmod=hashlib.sha256).hexdigest()
        ok = module.verify_signature("secret", body, expired, sig)
        self.assertTrue(ok)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_webhook_hardening.py -v`  
Expected: FAIL (route behavior not covered yet)

---

## Chunk 2: Implementation

### Task 2: Harden webhook checks

**Files:**
- Modify: `apps/api/app/routers/integrations.py`

- [ ] **Step 1: Ensure strict validation errors and consistent returns**
  - If signature invalid -> 401
  - If timestamp expired -> 401
  - If nonce replay -> 409
  - If unknown status -> 400
  - If idempotency replay -> `{ok: true, duplicate: true}`

- [ ] **Step 2: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_webhook_hardening.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all webhook tests**

Run: `py -3.12 -m unittest apps/api/tests/test_webhook_hardening.py -v`  
Expected: PASS

