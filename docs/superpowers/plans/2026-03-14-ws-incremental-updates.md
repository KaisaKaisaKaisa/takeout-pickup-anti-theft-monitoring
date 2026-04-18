# WebSocket 增量更新 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为设备事件与规则命中日志补齐 WebSocket 增量更新链路，减少前端全量刷新。

**Architecture:** 后端补齐 `device.*` 与 `rule.match` 的 payload 快照；前端基于 payload 就地合并/插入，仍保留 HTTP 全量加载作为兜底。

**Tech Stack:** FastAPI, SQLAlchemy, WebSocket, Vanilla JS (PWA), Python unittest, Node (minimal JS tests).

---

## File Structure

- Create: `apps/api/app/services/ws_payloads.py` (构造 WS payload 的小型纯函数)
- Create: `apps/api/tests/test_ws_payloads.py` (unittest 覆盖 payload 结构)
- Modify: `apps/api/app/routers/devices.py` (广播中加入 `device` 快照)
- Modify: `apps/api/app/services/alert_engine.py` (广播中加入 `match` 快照)
- Create: `apps/pwa/src/ws_logic.js` (前端增量插入判定逻辑，UMD)
- Create: `apps/pwa/tests/ws_logic.test.js` (Node 纯 JS 测试)
- Modify: `apps/pwa/src/index.html` (引入 `ws_logic.js`)
- Modify: `apps/pwa/src/app.js` (WS 处理增量更新)

---

## Chunk 1: Backend Payload Builders + Tests

### Task 1: 新增 WS payload 构造函数（含 TDD）

**Files:**
- Create: `apps/api/tests/test_ws_payloads.py`
- Create: `apps/api/app/services/ws_payloads.py`

- [ ] **Step 1: 写失败测试（unittest）**

```python
import unittest
import uuid
from datetime import datetime, timezone

from app.models.entities import EdgeDevice, RuleMatchLog
from app.services import ws_payloads

class WsPayloadTests(unittest.TestCase):
    def test_device_payload_has_core_fields(self):
        device = EdgeDevice(
            id=uuid.uuid4(),
            owner_user_id=uuid.uuid4(),
            device_code="dev-1",
            name="Edge-1",
            device_type="camera",
            status="online",
            config_json={"sensitivity": {"min_motion_score": 0.6}},
            last_seen_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        payload = ws_payloads.build_device_payload(device)
        self.assertEqual(payload["id"], str(device.id))
        self.assertEqual(payload["device_code"], "dev-1")
        self.assertEqual(payload["status"], "online")
        self.assertIn("config", payload)
        self.assertIn("last_seen_at", payload)

    def test_rule_match_payload_has_core_fields(self):
        match = RuleMatchLog(
            rule_id=uuid.uuid4(),
            rule_set_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            session_id=uuid.uuid4(),
            event_type="motion",
            action="alert",
            suppressed=False,
            note=None,
            matched_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        match.id = 42
        payload = ws_payloads.build_rule_match_payload(match, summary="demo")
        self.assertEqual(payload["id"], 42)
        self.assertEqual(payload["rule_id"], str(match.rule_id))
        self.assertEqual(payload["order_id"], str(match.order_id))
        self.assertEqual(payload["event_type"], "motion")
        self.assertEqual(payload["summary"], "demo")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: FAIL (module `app.services.ws_payloads` not found)

- [ ] **Step 3: 编写最小实现**

```python
from __future__ import annotations

from datetime import datetime

def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.isoformat()

def build_device_payload(device) -> dict:
    return {
        "id": str(device.id),
        "name": device.name,
        "device_type": device.device_type,
        "status": device.status,
        "device_code": getattr(device, "device_code", None),
        "last_seen_at": _iso(getattr(device, "last_seen_at", None)),
        "config": getattr(device, "config_json", None),
    }

def build_rule_match_payload(match, summary: str | None = None) -> dict:
    return {
        "id": getattr(match, "id", None),
        "rule_id": str(match.rule_id),
        "rule_set_id": str(match.rule_set_id),
        "order_id": str(match.order_id),
        "session_id": str(match.session_id),
        "event_type": match.event_type,
        "action": match.action,
        "suppressed": bool(match.suppressed),
        "note": match.note,
        "matched_at": _iso(getattr(match, "matched_at", None)),
        "summary": summary,
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: PASS (`OK`)

- [ ] **Step 5: 提交**

Run: `git status -sb`  
If git available: `git add apps/api/tests/test_ws_payloads.py apps/api/app/services/ws_payloads.py`  
Commit: `git commit -m "test: add ws payload builders"`

---

## Chunk 2: Backend Broadcast Integration

### Task 2: 设备与规则命中广播加入 payload 快照

**Files:**
- Modify: `apps/api/app/routers/devices.py`
- Modify: `apps/api/app/services/alert_engine.py`
- Test: `apps/api/tests/test_ws_payloads.py`

- [ ] **Step 1: 写失败测试（覆盖 broadcast 结构时机）**

Add test to `apps/api/tests/test_ws_payloads.py`:

```python
    def test_rule_match_payload_includes_matched_at(self):
        match = RuleMatchLog(
            rule_id=uuid.uuid4(),
            rule_set_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            session_id=uuid.uuid4(),
            event_type="motion",
            action="alert",
            suppressed=False,
            note=None,
            matched_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        match.id = 7
        payload = ws_payloads.build_rule_match_payload(match)
        self.assertTrue(payload["matched_at"].startswith("2026-03-14"))
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: FAIL (payload missing `matched_at` or not formatted)

- [ ] **Step 3: 最小实现修正（若未覆盖）**

Ensure `_iso()` used and `matched_at` included in `build_rule_match_payload`.

- [ ] **Step 4: 后端接入 payload 构造**

`apps/api/app/routers/devices.py`:
- 在 `device.registered/updated/config` 广播中加入 `device: build_device_payload(device)`

`apps/api/app/services/alert_engine.py`:
- 在 `RuleMatchLog` `db.add` 后 `await db.flush()` 获取自增 ID
- 构造 `summary = rule.name or rule.event_type`
- 广播 `rule.match` 时包含 `match: build_rule_match_payload(match, summary)`
- 保留原有 `rule_id/rule_set_id/order_id/...` 字段以兼容旧消费方

- [ ] **Step 5: 运行测试确认通过**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: PASS (`OK`)

- [ ] **Step 6: 提交**

Run: `git status -sb`  
If git available:  
`git add apps/api/app/routers/devices.py apps/api/app/services/alert_engine.py apps/api/tests/test_ws_payloads.py`  
Commit: `git commit -m "feat: add device/rule match ws payload snapshots"`

---

## Chunk 3: Frontend 增量更新 + JS 测试

### Task 3: 规则命中与设备事件增量更新

**Files:**
- Create: `apps/pwa/src/ws_logic.js`
- Create: `apps/pwa/tests/ws_logic.test.js`
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 写失败测试（Node 纯 JS）**

`apps/pwa/tests/ws_logic.test.js`:

```javascript
const assert = require("assert");
const { shouldInsertRuleMatch } = require("../src/ws_logic");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("default filters accept non-suppressed match", () => {
  const match = { event_type: "motion", suppressed: false, matched_at: new Date().toISOString() };
  const filters = { filter: "", search: "", includeSuppressed: false, range: "24h" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date()), true);
});

test("suppressed match excluded by default", () => {
  const match = { event_type: "motion", suppressed: true, matched_at: new Date().toISOString() };
  const filters = { filter: "", search: "", includeSuppressed: false, range: "24h" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date()), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/ws_logic.test.js`  
Expected: FAIL (module `../src/ws_logic` not found)

- [ ] **Step 3: 实现 UMD 逻辑模块**

`apps/pwa/src/ws_logic.js`:

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.wsLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function shouldInsertRuleMatch(match, filters, now) {
    const filter = filters.filter || "";
    const search = filters.search || "";
    const includeSuppressed = Boolean(filters.includeSuppressed);
    const range = filters.range || "24h";
    if (!includeSuppressed && match.suppressed) {
      return false;
    }
    if (filter && match.event_type !== filter) {
      return false;
    }
    if (search) {
      const needle = String(search);
      const hay = [match.order_id, match.rule_id, match.rule_set_id].filter(Boolean).map(String);
      if (!hay.some((item) => item.includes(needle))) {
        return false;
      }
    }
    if (range !== "all" && match.matched_at) {
      const ts = new Date(match.matched_at).getTime();
      const base = (now instanceof Date ? now : new Date()).getTime();
      const limit = range === "7d" ? 7 * 24 * 3600 * 1000 : range === "30d" ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
      if (Number.isFinite(ts) && base - ts > limit) {
        return false;
      }
    }
    return true;
  }

  return { shouldInsertRuleMatch };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node apps/pwa/tests/ws_logic.test.js`  
Expected: PASS (exit 0)

- [ ] **Step 5: 前端接入**

`apps/pwa/src/index.html`:
- 在 `app.js` 前引入 `ws_logic.js`

`apps/pwa/src/app.js`:
- WS subscribe 增加 `"rule"`
- 新增 `buildRuleMatchCard` 与 `buildDeviceCard`（复用 `renderRuleMatches` 和 `renderDevices` 结构）
- `rule.match` 事件：若 `payload.payload.match` 存在且 `shouldInsertRuleMatch` 为 true，则 `mergeListItem("rule-matches-list", match.id, () => buildRuleMatchCard(match))`
- `device.*` 事件：若 `payload.payload.device` 存在，执行 `mergeListItem("devices-list", device.id, () => buildDeviceCard(device))`

- [ ] **Step 6: 基本验证**

Run: `node apps/pwa/tests/ws_logic.test.js`  
Expected: PASS

- [ ] **Step 7: 提交**

Run: `git status -sb`  
If git available:  
`git add apps/pwa/src/ws_logic.js apps/pwa/tests/ws_logic.test.js apps/pwa/src/index.html apps/pwa/src/app.js`  
Commit: `git commit -m "feat: ws incremental updates for devices and rule matches"`

---

## Notes

- 当前目录未检测到 `.git`，若无 git 可跳过提交步骤。
- 若 Node 不可用，需手工验证前端逻辑；但建议安装 Node 以保持最小化测试链路。
