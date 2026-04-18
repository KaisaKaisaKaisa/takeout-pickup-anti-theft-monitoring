# Backend Logic Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden provider webhook security/idempotency, improve rule-engine alert linkage, and extend reports with rule-match metrics while keeping permissions and cache invalidation consistent.

**Architecture:** Add small helper modules for webhook security, rule cooldown, and report cache invalidation so router/service changes stay minimal and testable. Use the existing cache layer (Redis or in-memory) and keep the DB schema unchanged. Extend report aggregation to include rule_match counts/series and update webhook docs to reflect nonce/idempotency behavior.

**Tech Stack:** FastAPI, SQLAlchemy async, Redis/in-memory cache, Python `unittest`.

**Skill refs:** @writing-plans

---

## Constraints

- Repository is not a git repo; no worktree can be created. Skip commit steps if `git` is unavailable.
- Use `python -m unittest` for tests (no pytest dependency).

## File Structure

- Create: `apps/api/app/services/webhook_security.py` (normalize status, nonce/idempotency helpers)
- Create: `apps/api/app/core/cache_invalidation.py` (report cache invalidation helper)
- Create: `apps/api/app/services/rule_engine_utils.py` (cooldown helper)
- Create: `apps/api/tests/test_webhook_security.py`
- Create: `apps/api/tests/test_cache_invalidation.py`
- Create: `apps/api/tests/test_rule_engine_utils.py`
- Create: `apps/api/tests/test_report_exports.py`
- Modify: `apps/api/app/routers/integrations.py` (nonce/idempotency, status validation, new headers)
- Modify: `apps/api/app/services/alert_engine.py` (cooldown via RuleMatchLog, cache invalidation, alert metadata)
- Modify: `apps/api/app/services/ws_payloads.py` (optional rule_id/rule_set_id in alert payload)
- Modify: `apps/api/app/routers/orders.py` (cache invalidation helper)
- Modify: `apps/api/app/routers/alerts.py` (cache invalidation helper)
- Modify: `apps/api/app/routers/edge_ingest.py` (cache invalidation on alert/online change)
- Modify: `apps/api/app/services/device_offline_checker.py` (cache invalidation helper)
- Modify: `apps/api/app/services/report_service.py` (rule_match summary/trends/export)
- Modify: `docs/webhook.md` (nonce/event-id/idempotency contract)
- Modify: `docs/openapi.yaml` (webhook headers + duplicate response note)

---

## Chunk 1: Webhook Security + Idempotency

### Task 1: Add webhook security utilities + tests

**Files:**
- Create: `apps/api/app/services/webhook_security.py`
- Test: `apps/api/tests/test_webhook_security.py`

- [ ] **Step 1: Write the failing test**

```python
import os
import sys
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

from app.core import cache
from app.services import webhook_security


class WebhookSecurityTests(unittest.TestCase):
    def setUp(self):
        cache.invalidate("webhook_nonce:")
        cache.invalidate("webhook_idem:")

    def test_normalize_status(self):
        self.assertEqual(webhook_security.normalize_status("delivered"), "delivered")
        self.assertEqual(webhook_security.normalize_status("Arrived"), "delivered")
        self.assertEqual(webhook_security.normalize_status("pickedup"), "picked_up")
        self.assertEqual(webhook_security.normalize_status("CREATED"), "created")
        self.assertIsNone(webhook_security.normalize_status("unknown"))

    def test_nonce_replay(self):
        self.assertTrue(webhook_security.check_and_store_nonce("meituan", "abc", ttl_sec=10))
        self.assertFalse(webhook_security.check_and_store_nonce("meituan", "abc", ttl_sec=10))

    def test_idempotency_key(self):
        payload = {
            "provider_order_id": "p1",
            "status": "delivered",
            "event_time": "2026-03-15T10:00:00Z",
        }
        key1 = webhook_security.build_idempotency_key("meituan", payload, event_id=None, raw_body=None)
        key2 = webhook_security.build_idempotency_key("meituan", payload, event_id=None, raw_body=None)
        self.assertEqual(key1, key2)

    def test_idempotency_replay(self):
        payload = {
            "provider_order_id": "p1",
            "status": "delivered",
            "event_time": "2026-03-15T10:00:00Z",
        }
        key = webhook_security.build_idempotency_key("meituan", payload, event_id="evt-1", raw_body=None)
        self.assertTrue(webhook_security.check_and_store_idempotency(key, ttl_sec=10))
        self.assertFalse(webhook_security.check_and_store_idempotency(key, ttl_sec=10))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest apps/api/tests/test_webhook_security.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.webhook_security'`

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core import cache
from app.services.order_state import KNOWN_ORDER_STATUSES

STATUS_MAP = {
    "created": "created",
    "new": "created",
    "pending": "created",
    "delivered": "delivered",
    "arrived": "delivered",
    "picked_up": "picked_up",
    "pickedup": "picked_up",
    "completed": "picked_up",
    "received": "picked_up",
}

def normalize_status(raw: str | None) -> str | None:
    if not raw:
        return None
    status = STATUS_MAP.get(str(raw).lower(), str(raw).lower())
    if status in KNOWN_ORDER_STATUSES:
        return status
    return None

def _extract_event_time(payload: dict) -> str | None:
    for key in ("event_time", "eventTime", "occurred_at", "timestamp"):
        value = payload.get(key)
        if value:
            return str(value)
    return None

def build_idempotency_key(
    provider: str,
    payload: dict,
    event_id: str | None = None,
    raw_body: bytes | None = None,
) -> str:
    if event_id:
        base = f"event:{event_id}"
    else:
        status = normalize_status(payload.get("status"))
        provider_order_id = payload.get("provider_order_id") or payload.get("order_id") or ""
        event_time = _extract_event_time(payload) or ""
        if provider_order_id and status and event_time:
            base = f"{provider}|{provider_order_id}|{status}|{event_time}"
        elif raw_body:
            base = raw_body.decode("utf-8", errors="ignore")
        else:
            base = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return f"webhook_idem:{provider}:{digest}"

def check_and_store_nonce(provider: str, nonce: str, ttl_sec: int) -> bool:
    if not nonce:
        return True
    key = f"webhook_nonce:{provider}:{nonce}"
    if cache.get(key):
        return False
    cache.set(key, {"ok": True}, ttl_sec=ttl_sec)
    return True

def check_and_store_idempotency(key: str, ttl_sec: int) -> bool:
    if cache.get(key):
        return False
    cache.set(key, {"ok": True}, ttl_sec=ttl_sec)
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest apps/api/tests/test_webhook_security.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/webhook_security.py apps/api/tests/test_webhook_security.py
git commit -m "feat: add webhook security helpers"
```

### Task 2: Wire webhook security into integrations + update docs

**Files:**
- Modify: `apps/api/app/routers/integrations.py`
- Modify: `docs/webhook.md`
- Modify: `docs/openapi.yaml`

- [ ] **Step 1: Update webhook handler to use nonce/idempotency helpers**

```python
from app.core.cache_invalidation import invalidate_report_caches
from app.services.webhook_security import (
    normalize_status,
    build_idempotency_key,
    check_and_store_nonce,
    check_and_store_idempotency,
)

@router.post("/providers/{provider}/order-status")
async def provider_order_status(
    provider: str,
    request: Request,
    x_provider_timestamp: str | None = Header(default=None),
    x_provider_signature: str | None = Header(default=None),
    x_provider_nonce: str | None = Header(default=None),
    x_provider_event_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    ...
    payload = json.loads(body.decode("utf-8"))
    status = normalize_status(payload.get("status"))
    if not status:
        raise HTTPException(status_code=400, detail="Unknown status")
    payload["status"] = status

    if x_provider_nonce:
        ok = check_and_store_nonce(provider, x_provider_nonce, settings.provider_webhook_ttl_sec)
        if not ok:
            raise HTTPException(status_code=409, detail="Nonce replay")

    idem_key = build_idempotency_key(
        provider,
        payload,
        event_id=x_provider_event_id,
        raw_body=body,
    )
    if not check_and_store_idempotency(idem_key, settings.provider_webhook_ttl_sec):
        return {"ok": True, "duplicate": True}

    order_id = payload.get("order_id")
    if order_id:
        try:
            order_uuid = uuid.UUID(order_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid order_id")
        order = (await db.execute(select(Order).where(Order.id == order_uuid))).scalar_one_or_none()
    ...
    target_user_id = user.id if user else order.user_id
    invalidate_report_caches(target_user_id)
```

- [ ] **Step 2: Run unit tests**

Run: `python -m unittest apps/api/tests/test_webhook_security.py -v`  
Expected: PASS

- [ ] **Step 3: Update webhook docs to include nonce/event-id + duplicate response**

Update `docs/webhook.md`:
- Add optional headers `X-Provider-Nonce`, `X-Provider-Event-Id`
- Document idempotency behavior (`{ "ok": true, "duplicate": true }`)
- Document optional `event_time` field

Update `docs/openapi.yaml`:
- Add header parameters for the webhook endpoint
- Note duplicate response field in description

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/routers/integrations.py docs/webhook.md docs/openapi.yaml
git commit -m "feat: harden webhook nonce and idempotency"
```

---

## Chunk 2: Cache Invalidation + Rule Engine Improvements

### Task 3: Add report cache invalidation helper + tests

**Files:**
- Create: `apps/api/app/core/cache_invalidation.py`
- Test: `apps/api/tests/test_cache_invalidation.py`

- [ ] **Step 1: Write the failing test**

```python
import os
import sys
import unittest
import uuid
from unittest.mock import call, patch

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

from app.core import cache_invalidation


class CacheInvalidationTests(unittest.TestCase):
    def test_invalidate_report_caches_user(self):
        user_id = uuid.uuid4()
        with patch("app.core.cache_invalidation.cache.invalidate") as invalidate:
            cache_invalidation.invalidate_report_caches(user_id)
        invalidate.assert_has_calls(
            [
                call("report_summary:global"),
                call("report_trends:global:"),
                call(f"report_summary:user:{user_id}"),
                call("report_trends:user:"),
            ],
            any_order=False,
        )

    def test_invalidate_report_caches_global_only(self):
        with patch("app.core.cache_invalidation.cache.invalidate") as invalidate:
            cache_invalidation.invalidate_report_caches(None)
        invalidate.assert_has_calls(
            [
                call("report_summary:global"),
                call("report_trends:global:"),
            ],
            any_order=False,
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest apps/api/tests/test_cache_invalidation.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.cache_invalidation'`

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations

import uuid
from app.core import cache

def invalidate_report_caches(user_id: uuid.UUID | None) -> None:
    cache.invalidate("report_summary:global")
    cache.invalidate("report_trends:global:")
    if user_id:
        cache.invalidate(f"report_summary:user:{user_id}")
        cache.invalidate("report_trends:user:")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest apps/api/tests/test_cache_invalidation.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/core/cache_invalidation.py apps/api/tests/test_cache_invalidation.py
git commit -m "feat: centralize report cache invalidation"
```

### Task 4: Replace direct cache invalidations with helper + add missing invalidations

**Files:**
- Modify: `apps/api/app/routers/orders.py`
- Modify: `apps/api/app/routers/alerts.py`
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`
- Modify: `apps/api/app/routers/integrations.py`
- Modify: `apps/api/app/services/alert_engine.py`

- [ ] **Step 1: Replace direct cache invalidations**

Example for `orders.py` (apply to each location):

```python
from app.core.cache_invalidation import invalidate_report_caches

...
invalidate_report_caches(user.id)
```

Example for `alerts.py`:

```python
from app.core.cache_invalidation import invalidate_report_caches
...
invalidate_report_caches(user.id)
```

Example for `device_offline_checker.py`:

```python
from app.core.cache_invalidation import invalidate_report_caches
...
if order:
    invalidate_report_caches(order.user_id)
```

Example for `edge_ingest.py` heartbeat:

```python
from app.core.cache_invalidation import invalidate_report_caches
...
if should_broadcast:
    invalidate_report_caches(device.owner_user_id)
```

Example for `edge_ingest.py` alert creation:

```python
if order:
    invalidate_report_caches(order.user_id)
```

- [ ] **Step 2: Run unit tests**

Run: `python -m unittest apps/api/tests/test_cache_invalidation.py -v`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/routers/orders.py apps/api/app/routers/alerts.py apps/api/app/routers/edge_ingest.py apps/api/app/services/device_offline_checker.py apps/api/app/routers/integrations.py apps/api/app/services/alert_engine.py
git commit -m "chore: unify report cache invalidation"
```

### Task 5: Add rule cooldown helper + tests

**Files:**
- Create: `apps/api/app/services/rule_engine_utils.py`
- Test: `apps/api/tests/test_rule_engine_utils.py`

- [ ] **Step 1: Write the failing test**

```python
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

from app.services import rule_engine_utils


class RuleEngineUtilsTests(unittest.TestCase):
    def test_is_within_cooldown(self):
        now = datetime.now(timezone.utc)
        last = now - timedelta(seconds=30)
        self.assertTrue(rule_engine_utils.is_within_cooldown(last, cooldown_sec=60, now=now))
        self.assertFalse(rule_engine_utils.is_within_cooldown(last, cooldown_sec=10, now=now))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest apps/api/tests/test_rule_engine_utils.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.rule_engine_utils'`

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations

from datetime import datetime, timedelta

def is_within_cooldown(last_at: datetime | None, cooldown_sec: int, now: datetime) -> bool:
    if not last_at or cooldown_sec <= 0:
        return False
    return last_at >= (now - timedelta(seconds=cooldown_sec))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest apps/api/tests/test_rule_engine_utils.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/rule_engine_utils.py apps/api/tests/test_rule_engine_utils.py
git commit -m "feat: add rule engine cooldown helper"
```

### Task 6: Update rule engine cooldown + alert metadata + WS payloads

**Files:**
- Modify: `apps/api/app/services/alert_engine.py`
- Modify: `apps/api/app/services/ws_payloads.py`
- Modify: `apps/api/tests/test_ws_payloads.py`

- [ ] **Step 1: Update rule cooldown check to use RuleMatchLog**

```python
from app.services.rule_engine_utils import is_within_cooldown
from app.core.cache_invalidation import invalidate_report_caches

...
if rule.cooldown_sec > 0:
    recent_match = (
        await db.execute(
            select(RuleMatchLog.matched_at)
            .where(RuleMatchLog.rule_id == rule.id)
            .where(RuleMatchLog.session_id == session.id)
            .order_by(RuleMatchLog.matched_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if is_within_cooldown(recent_match, rule.cooldown_sec, datetime.now(timezone.utc)):
        suppressed = True
        note = "cooldown"

match = RuleMatchLog(...)
db.add(match)
await db.flush()
invalidate_report_caches(user_id)

if rule.action == "alert":
    alert = AlertIncident(...)
    alert.rule_id = rule.id
    alert.rule_set_id = rule.rule_set_id
```

- [ ] **Step 2: Extend alert payload to include rule_id and rule_set_id if present**

```python
def build_alert_payload(alert) -> dict:
    return {
        "id": str(_get_attr(alert, "id", "")),
        "order_id": str(_get_attr(alert, "order_id", "")) if _get_attr(alert, "order_id", None) else None,
        "alert_type": _get_attr(alert, "alert_type", None),
        "level": _get_attr(alert, "level", None),
        "status": _get_attr(alert, "status", None),
        "summary": _get_attr(alert, "summary", None),
        "rule_id": str(_get_attr(alert, "rule_id", "")) if _get_attr(alert, "rule_id", None) else None,
        "rule_set_id": str(_get_attr(alert, "rule_set_id", "")) if _get_attr(alert, "rule_set_id", None) else None,
        "triggered_at": _iso(_get_attr(alert, "triggered_at", None)),
        "updated_at": _iso(_get_attr(alert, "updated_at", None)),
    }
```

- [ ] **Step 3: Add WS payload test for alert rule metadata**

```python
def test_build_alert_payload_includes_rule_meta(self):
    alert = SimpleNamespace(
        id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        alert_type="rule_triggered",
        level="warning",
        status="open",
        summary="rule=demo",
        triggered_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        rule_id=uuid.uuid4(),
        rule_set_id=uuid.uuid4(),
    )
    payload = ws_payloads.build_alert_payload(alert)
    self.assertEqual(payload["rule_id"], str(alert.rule_id))
    self.assertEqual(payload["rule_set_id"], str(alert.rule_set_id))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest apps/api/tests/test_rule_engine_utils.py -v`  
Expected: PASS

Run: `python -m unittest apps/api/tests/test_ws_payloads.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/alert_engine.py apps/api/app/services/ws_payloads.py apps/api/tests/test_ws_payloads.py
git commit -m "feat: improve rule cooldown and alert payload metadata"
```

---

## Chunk 3: Report Rule-Match Summary + Trends

### Task 7: Add report export tests + implement rule_match metrics

**Files:**
- Create: `apps/api/tests/test_report_exports.py`
- Modify: `apps/api/app/services/report_service.py`

- [ ] **Step 1: Write the failing test**

```python
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

from app.services import report_service


class ReportExportTests(unittest.IsolatedAsyncioTestCase):
    async def test_export_trends_csv_includes_rule_matches(self):
        fake = {
            "interval": "day",
            "orders": [{"day": "2026-03-15", "count": 1}],
            "alerts": [],
            "events": [],
            "rule_matches": [{"day": "2026-03-15", "count": 2}],
        }
        with patch.object(report_service, "get_trends", new=AsyncMock(return_value=fake)):
            data = await report_service.export_trends_csv(db=None, interval="day", days=7)
        text = data.decode("utf-8")
        self.assertIn("rule_matches", text)

    async def test_export_summary_csv_includes_rule_matches(self):
        fake = {
            "orders": {"total": 1},
            "alerts": {"total": 0},
            "devices": {"total": 0},
            "sessions": {"total": 0},
            "events_last_24h": 0,
            "rule_matches": {"total": 3, "suppressed": 1},
        }
        with patch.object(report_service, "get_summary", new=AsyncMock(return_value=fake)):
            data = await report_service.export_report_summary_csv(db=None)
        text = data.decode("utf-8")
        self.assertIn("rule_matches,total,3", text)
        self.assertIn("rule_matches,suppressed,1", text)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest apps/api/tests/test_report_exports.py -v`  
Expected: FAIL in `test_export_trends_csv_includes_rule_matches` because `rule_matches` is not exported

- [ ] **Step 3: Implement rule_match summary/trends/export**

```python
from app.models.entities import RuleMatchLog

async def get_summary(db: AsyncSession, user_id=None) -> dict:
    ...
    rules_stmt = select(
        func.count(RuleMatchLog.id),
        func.count(case((RuleMatchLog.suppressed == True, 1))),
    )
    if user_id:
        rules_stmt = rules_stmt.where(RuleMatchLog.user_id == user_id)
    rules_row = (await db.execute(rules_stmt)).one()
    ...
    return {
        ...
        "rule_matches": {
            "total": rules_row[0],
            "suppressed": rules_row[1],
        },
    }

async def get_trends(...):
    ...
    rules_stmt = select(
        func.date_trunc(trunc, RuleMatchLog.matched_at).label("bucket"),
        func.count(RuleMatchLog.id),
    ).where(RuleMatchLog.matched_at >= since).group_by("bucket").order_by("bucket")
    if user_id:
        rules_stmt = rules_stmt.where(RuleMatchLog.user_id == user_id)
    rules_rows = (await db.execute(rules_stmt)).all()
    ...
    return {
        "interval": interval,
        "orders": normalize(orders_rows),
        "alerts": normalize(alerts_rows),
        "events": normalize(events_rows),
        "rule_matches": normalize(rules_rows),
    }

async def export_trends_csv(...):
    ...
    for series in ("orders", "alerts", "events", "rule_matches"):
        for row in trends.get(series, []):
            bucket = row.get("day") or row.get("week")
            writer.writerow([series, bucket, row.get("count", 0)])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest apps/api/tests/test_report_exports.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/report_service.py apps/api/tests/test_report_exports.py
git commit -m "feat: add rule match summary and trends"
```

