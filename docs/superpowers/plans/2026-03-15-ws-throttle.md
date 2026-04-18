# WS 分类型节流 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端实现分类型节流刷新与页面可见性处理，降低 WS 事件刷新抖动。

**Architecture:** 将单一 `scheduleFlush` 拆分为多类型调度，使用独立 timer + pending；在 `visibilitychange` 中集中刷新。

**Tech Stack:** Vanilla JS, Node.

---

## File Structure

- Create: `apps/pwa/src/ws_throttle.js`
- Create: `apps/pwa/tests/ws_throttle.test.js`
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

---

## Chunk 1: 节流模块

### Task 1: 新增节流函数与测试

**Files:**
- Create: `apps/pwa/src/ws_throttle.js`
- Create: `apps/pwa/tests/ws_throttle.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
const assert = require("assert");
const { createThrottle } = require("../src/ws_throttle");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("createThrottle merges calls within window", (done) => {
  let count = 0;
  const throttle = createThrottle(50, () => { count += 1; });
  throttle();
  throttle();
  setTimeout(() => {
    assert.strictEqual(count, 1);
    done && done();
  }, 80);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/ws_throttle.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: 实现模块**

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.wsThrottle = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createThrottle(waitMs, handler) {
    let timer = null;
    return function trigger() {
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        handler();
      }, waitMs);
    };
  }
  return { createThrottle };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node apps/pwa/tests/ws_throttle.test.js`  
Expected: PASS

---

## Chunk 2: 前端接入节流

### Task 2: 接入分类型节流与可见性处理

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 引入 `ws_throttle.js`**

在 `index.html` 中 `app.js` 前引入。

- [ ] **Step 2: 接入逻辑**

`app.js`:
- 用 `createThrottle` 创建 `orders/alerts/devices/reports` 4 个节流器  
- `mark(type)` 改为触发对应节流器  
- `document.visibilitychange`：
  - 从隐藏切换为可见时，检查 pending 并刷新  

- [ ] **Step 3: 验证**

Run: `node apps/pwa/tests/ws_throttle.test.js`  
Expected: PASS

---

## Notes

- 若无 git 可跳过提交步骤  
