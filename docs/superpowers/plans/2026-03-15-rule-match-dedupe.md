# 规则命中去重索引 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为规则命中列表引入去重索引与筛选一致性控制，避免重复插入并保持增量更新正确性。

**Architecture:** 前端维护 `ruleMatchIndex` 与 `filterSignature`，全量渲染重建索引；增量插入仅在签名一致时进行，缺失 `id` 触发兜底刷新。

**Tech Stack:** Vanilla JS, Node.

---

## File Structure

- Create: `apps/pwa/src/rule_match_index.js`
- Create: `apps/pwa/tests/rule_match_index.test.js`
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

---

## Chunk 1: 索引模块 + 测试

### Task 1: 新增索引工具函数

**Files:**
- Create: `apps/pwa/src/rule_match_index.js`
- Create: `apps/pwa/tests/rule_match_index.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
const assert = require("assert");
const { buildFilterSignature, shouldAcceptIncremental, rebuildIndex, removeIndexForNodes } = require("../src/rule_match_index");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("filter signature changes when inputs change", () => {
  const a = buildFilterSignature({ filter: "", range: "24h", includeSuppressed: false, search: "" });
  const b = buildFilterSignature({ filter: "motion", range: "24h", includeSuppressed: false, search: "" });
  assert.notStrictEqual(a, b);
});

test("incremental blocked when signature mismatch", () => {
  const current = buildFilterSignature({ filter: "", range: "24h", includeSuppressed: false, search: "" });
  const next = buildFilterSignature({ filter: "motion", range: "24h", includeSuppressed: false, search: "" });
  assert.strictEqual(shouldAcceptIncremental(current, next), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/rule_match_index.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: 实现工具函数**

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ruleMatchIndex = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function buildFilterSignature(filters) {
    const payload = {
      filter: filters.filter || "",
      range: filters.range || "24h",
      includeSuppressed: Boolean(filters.includeSuppressed),
      search: filters.search || "",
    };
    return JSON.stringify(payload);
  }

  function shouldAcceptIncremental(currentSignature, nextSignature) {
    return currentSignature === nextSignature;
  }

  function rebuildIndex(listEl) {
    const map = new Map();
    if (!listEl) {
      return map;
    }
    Array.from(listEl.children).forEach((node) => {
      const id = node && node.dataset ? node.dataset.id : null;
      if (id) {
        map.set(String(id), node);
      }
    });
    return map;
  }

  function removeIndexForNodes(index, nodes) {
    if (!index || !nodes) {
      return;
    }
    nodes.forEach((node) => {
      const id = node && node.dataset ? node.dataset.id : null;
      if (id) {
        index.delete(String(id));
      }
    });
  }

  return {
    buildFilterSignature,
    shouldAcceptIncremental,
    rebuildIndex,
    removeIndexForNodes,
  };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node apps/pwa/tests/rule_match_index.test.js`  
Expected: PASS

---

## Chunk 2: 前端接入索引

### Task 2: 索引与筛选一致性接入

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 引入 `rule_match_index.js`**

在 `index.html` 中，`app.js` 前引入 `rule_match_index.js`。

- [ ] **Step 2: 接入索引**

`app.js`:
- 新增 `ruleMatchIndex` 与 `ruleMatchSignature` 全局状态  
- `renderRuleMatches` 结束后重建索引  
- `mergeListItem` 在 `rule-matches-list` 更新时同步写入索引  
- `trimList` 裁剪时同步移除索引项  

- [ ] **Step 3: 筛选一致性**

在 `connectWebSocket` 中：
- 每次收到 `rule.match` 时计算当前 `filterSignature`  
- 若签名变化，则触发 `loadRuleMatches(1)`，不执行增量插入  
- 若 payload 缺少 `id`，直接 `loadRuleMatches(1)`  

- [ ] **Step 4: 验证**

Run: `node apps/pwa/tests/rule_match_index.test.js`  
Expected: PASS

---

## Notes

- 无 git 可跳过提交步骤  
