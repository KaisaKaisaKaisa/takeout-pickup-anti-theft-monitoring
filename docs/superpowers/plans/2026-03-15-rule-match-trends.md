# 规则命中趋势增量统计 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端实现规则命中趋势的轻量增量更新，减少全量报表刷新。

**Architecture:** `renderTrends` 写入缓存，WS `rule.match` 驱动桶更新并局部重绘。

**Tech Stack:** Vanilla JS, Node.

---

## File Structure

- Create: `apps/pwa/src/trend_cache.js`
- Create: `apps/pwa/tests/trend_cache.test.js`
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

---

## Chunk 1: 趋势缓存模块

### Task 1: 新增趋势缓存工具与测试

**Files:**
- Create: `apps/pwa/src/trend_cache.js`
- Create: `apps/pwa/tests/trend_cache.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
const assert = require("assert");
const { buildBucketKey, applyRuleMatchIncrement } = require("../src/trend_cache");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("buildBucketKey day", () => {
  const key = buildBucketKey(new Date("2026-03-15T10:00:00Z"), "day");
  assert.strictEqual(key, "2026-03-15");
});

test("applyRuleMatchIncrement creates bucket", () => {
  const cache = { interval: "day", rule_matches: [] };
  applyRuleMatchIncrement(cache, "2026-03-15T10:00:00Z");
  assert.strictEqual(cache.rule_matches[0].count, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/trend_cache.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: 实现模块**

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.trendCache = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function buildBucketKey(date, interval) {
    const dt = new Date(date);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    if (interval === "week") {
      const year = dt.getUTCFullYear();
      const first = new Date(Date.UTC(year, 0, 1));
      const dayOfYear = Math.floor((dt - first) / 86400000) + 1;
      const week = Math.ceil(dayOfYear / 7);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    return dt.toISOString().slice(0, 10);
  }

  function applyRuleMatchIncrement(cache, matchedAt) {
    if (!cache || !matchedAt) {
      return false;
    }
    const interval = cache.interval || "day";
    const key = buildBucketKey(matchedAt, interval);
    if (!key) {
      return false;
    }
    const list = cache.rule_matches || [];
    let row = list.find((item) => (item.day || item.week) === key);
    if (!row) {
      row = interval === "week" ? { week: key, count: 0 } : { day: key, count: 0 };
      list.unshift(row);
    }
    row.count = (row.count || 0) + 1;
    cache.rule_matches = list;
    return true;
  }

  return { buildBucketKey, applyRuleMatchIncrement };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node apps/pwa/tests/trend_cache.test.js`  
Expected: PASS

---

## Chunk 2: 前端接入趋势缓存

### Task 2: 接入缓存与 UI

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 引入 `trend_cache.js`**

在 `index.html` 中 `app.js` 前引入。

- [ ] **Step 2: 接入趋势缓存**

`app.js`:
- `renderTrends` 执行后保存 `trendCache`  
- 新增 `renderRuleMatchTrend`（复用 `renderTrendBars`）  
- WS `rule.match` 到来时：
  - 若 `trendCache` 空，触发 `loadTrends()`  
  - 若 `matched_at` 缺失，触发 `loadTrends()`  
  - 否则 `applyRuleMatchIncrement` + 局部重绘  

- [ ] **Step 3: 验证**

Run: `node apps/pwa/tests/trend_cache.test.js`  
Expected: PASS

---

## Notes

- 如无 git，跳过提交步骤  
