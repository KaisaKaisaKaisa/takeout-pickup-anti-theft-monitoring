# 实时一致性优化 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 WebSocket 增量更新一致性，补齐设备联动广播，优化报表刷新节流。

**Architecture:** 前端增加列表容量控制与异常兜底刷新；后端在心跳/离线事件中广播设备快照；报表刷新复用现有节流机制。

**Tech Stack:** FastAPI, SQLAlchemy, WebSocket, Vanilla JS, Node.

---

## File Structure

- Create: `apps/pwa/src/list_limit.js`
- Create: `apps/pwa/tests/list_limit.test.js`
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`

---

## Chunk 1: 前端列表容量控制

### Task 1: 列表裁剪工具函数 + 测试

**Files:**
- Create: `apps/pwa/src/list_limit.js`
- Create: `apps/pwa/tests/list_limit.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
const assert = require("assert");
const { enforceListLimit } = require("../src/list_limit");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("enforceListLimit trims to max size", () => {
  const items = [1, 2, 3, 4, 5];
  const trimmed = enforceListLimit(items, 3);
  assert.deepStrictEqual(trimmed, [1, 2, 3]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/list_limit.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: 实现函数**

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.listLimit = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function enforceListLimit(items, max) {
    if (!Array.isArray(items) || !Number.isFinite(max) || max <= 0) {
      return items || [];
    }
    return items.slice(0, max);
  }
  return { enforceListLimit };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node apps/pwa/tests/list_limit.test.js`  
Expected: PASS

- [ ] **Step 5: 提交（若有 git）**

`git add apps/pwa/src/list_limit.js apps/pwa/tests/list_limit.test.js`  
`git commit -m "test: add list limit helper"`

---

### Task 2: 前端列表裁剪接入

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 引入 `list_limit.js`**

在 `index.html` 中，`app.js` 前引入 `list_limit.js`。

- [ ] **Step 2: 接入裁剪逻辑**

在 `connectWebSocket` 中：
- `mergeListItem` 后调用 `trimList(listId, max)`  
  - `rule-matches-list` max=200  
  - `orders-list` max=100  
  - `alerts-list` max=100  
  - `devices-list` 不裁剪

实现 `trimList`：  
- 通过 `listLimit.enforceListLimit` 或直接操作 DOM
- 超过 max 时，删除末尾节点

- [ ] **Step 3: 异常兜底刷新**

若 payload 缺少 `id`：
- 对应列表标记为需要刷新  
- 进入 `scheduleFlush` 时触发 `load*`

- [ ] **Step 4: 验证**

Run: `node apps/pwa/tests/list_limit.test.js`  
Expected: PASS

---

## Chunk 2: 设备联动广播

### Task 3: 心跳与离线事件广播设备快照

**Files:**
- Modify: `apps/api/app/routers/edge_ingest.py`
- Modify: `apps/api/app/services/device_offline_checker.py`

- [ ] **Step 1: 心跳广播**

在 `heartbeat` 中：
- 记录上次 `last_seen_at`，若超过 30s 或状态切换为 online 才广播  
- 广播 `device.updated` + `device` 快照 (`build_device_payload`)

- [ ] **Step 2: 离线广播**

在 `device_offline_checker` 中：
- 标记离线后广播 `device.updated` + `device` 快照  

- [ ] **Step 3: 验证**

Run: `python -m unittest apps/api/tests/test_ws_payloads.py`  
Expected: PASS

---

## Notes

- 当前目录非 git 仓库时跳过提交步骤  
- `list_limit.js` 为 UMD，供浏览器与 Node 测试复用  
