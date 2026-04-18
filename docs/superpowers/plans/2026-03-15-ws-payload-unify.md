# WS 事件载荷统一 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 WS 事件 payload 结构（兼容式），为前端渐进迁移提供一致实体字段。

**Architecture:** 新增构造函数输出统一 entity，并在广播 payload 中新增 `entity_type/entity/version`，保留旧字段。

**Tech Stack:** FastAPI, SQLAlchemy, unittest.

---

## File Structure

- Modify: `apps/api/app/services/ws_payloads.py`
- Modify: `apps/api/tests/test_ws_payloads.py`
- Modify: `apps/api/app/routers/orders.py`
- Modify: `apps/api/app/routers/alerts.py`
- Modify: `apps/api/app/routers/devices.py`
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`
- Modify: `apps/api/app/services/alert_engine.py`
- Modify: `apps/api/app/routers/integrations.py`

---

## Chunk 1: 构造器与测试

### Task 1: 扩展 ws_payloads 构造器

**Files:**
- Modify: `apps/api/app/services/ws_payloads.py`
- Modify: `apps/api/tests/test_ws_payloads.py`

- [ ] **Step 1: 写失败测试**

```python
def test_build_event_payload_min_fields(self):
    entity = {"id": "1", "status": "ok", "summary": "demo", "updated_at": None}
    payload = ws_payloads.build_event_payload("device", entity, {"extra": 1})
    self.assertEqual(payload["entity_type"], "device")
    self.assertEqual(payload["entity"]["id"], "1")
    self.assertEqual(payload["version"], "v1")
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: FAIL

- [ ] **Step 3: 实现构造器**

新增：
- `build_order_payload(order)`
- `build_alert_payload(alert)`
- `build_event_payload(entity_type, entity, extra=None)`

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: PASS

---

## Chunk 2: 广播接入

### Task 2: 更新广播 payload

**Files:**
- Modify: `apps/api/app/routers/orders.py`
- Modify: `apps/api/app/routers/alerts.py`
- Modify: `apps/api/app/routers/devices.py`
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`
- Modify: `apps/api/app/services/alert_engine.py`
- Modify: `apps/api/app/routers/integrations.py`

- [ ] **Step 1: 为每个广播加入统一字段**

示例：

```python
event_payload = build_event_payload("order", build_order_payload(order))
await ws_hub.broadcast_event("order.created", {
  **event_payload,
  "order": build_order_payload(order),
  "order_id": str(order.id)
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: PASS

---

## Notes

- 当前目录非 git 仓库时跳过提交步骤  
