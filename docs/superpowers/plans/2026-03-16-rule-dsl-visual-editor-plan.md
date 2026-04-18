# Rule DSL 可视化编辑器前端 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PWA 中实现规则 DSL 可视化编辑器，支持字段/运算符/规则组编辑、DSL 校验与评估、保存 `dsl_json`。

**Architecture:** 新增 `rule_dsl_editor.js` 提供纯函数与 DSL 结构处理；`rules.js` 输出新 UI 结构与 API 入口；`app.js` 负责状态、渲染与 API 交互；`styles.css` 补充编辑器样式。测试覆盖纯函数模块。

**Tech Stack:** 原生 JS + FastAPI 后端接口 + Node 运行简单单元测试。

---

## File Structure

- Create: `apps/pwa/src/rule_dsl_editor.js`（DSL 结构工具函数）
- Create: `apps/pwa/tests/rule_dsl_editor.test.js`（纯函数单测）
- Modify: `apps/pwa/src/rules.js`（规则编辑器 UI + DSL API）
- Modify: `apps/pwa/src/app.js`（DSL 编辑逻辑与保存）
- Modify: `apps/pwa/src/styles.css`（编辑器样式）
- Modify: `apps/pwa/src/index.html`（引入 `rule_dsl_editor.js`）

---

## Chunk 1: Tests (TDD)

### Task 1: DSL 工具函数测试

**Files:**
- Create: `apps/pwa/tests/rule_dsl_editor.test.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require("assert");
const {
  createEmptyDsl,
  normalizeDsl,
  conditionsToDsl,
  isGroup,
} = require("../src/rule_dsl_editor");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("createEmptyDsl builds default group", () => {
  const dsl = createEmptyDsl("motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.ok(Array.isArray(dsl.rules));
  assert.strictEqual(dsl.rules.length, 1);
  assert.strictEqual(dsl.rules[0].field, "motion_score");
});

test("normalizeDsl falls back on invalid input", () => {
  const dsl = normalizeDsl(null, "motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.strictEqual(dsl.rules.length, 1);
});

test("conditionsToDsl maps simple condition", () => {
  const dsl = conditionsToDsl({ motion_score: { gte: 5 } }, "motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.strictEqual(dsl.rules[0].field, "motion_score");
  assert.strictEqual(dsl.rules[0].op, "gte");
  assert.strictEqual(dsl.rules[0].value, 5);
});

test("isGroup detects group shape", () => {
  assert.strictEqual(isGroup({ op: "and", rules: [] }), true);
  assert.strictEqual(isGroup({ field: "x", op: "gte", value: 1 }), false);
});

if (require.main === module) {
  console.log("done");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node apps/pwa/tests/rule_dsl_editor.test.js`  
Expected: FAIL (module not found / missing exports)

---

## Chunk 2: Implement DSL 工具函数

### Task 2: Create `rule_dsl_editor.js`

**Files:**
- Create: `apps/pwa/src/rule_dsl_editor.js`

- [ ] **Step 1: Implement minimal functions**

```js
function createEmptyDsl(defaultField = "motion_score") {
  return {
    op: "and",
    rules: [{ field: defaultField, op: "gte", value: "" }],
  };
}

function isGroup(node) {
  return Boolean(
    node &&
    typeof node === "object" &&
    (node.op === "and" || node.op === "or") &&
    Array.isArray(node.rules)
  );
}

function normalizeDsl(input, defaultField = "motion_score") {
  if (isGroup(input) && input.rules.length) {
    return input;
  }
  return createEmptyDsl(defaultField);
}

function conditionsToDsl(conditions, defaultField = "motion_score") {
  if (!conditions || typeof conditions !== "object") {
    return createEmptyDsl(defaultField);
  }
  if (Array.isArray(conditions)) {
    return createEmptyDsl(defaultField);
  }
  if (conditions.$or && Array.isArray(conditions.$or)) {
    return {
      op: "or",
      rules: conditions.$or.map((child) => conditionsToDsl(child, defaultField)),
    };
  }
  const entries = Object.entries(conditions);
  if (!entries.length) {
    return createEmptyDsl(defaultField);
  }
  return {
    op: "and",
    rules: entries.map(([field, cond]) => {
      if (cond && typeof cond === "object" && !Array.isArray(cond)) {
        const op = Object.keys(cond)[0] || "eq";
        return { field, op, value: cond[op] };
      }
      return { field, op: "eq", value: cond };
    }),
  };
}

if (typeof module === "object" && module.exports) {
  module.exports = { createEmptyDsl, normalizeDsl, conditionsToDsl, isGroup };
}

if (typeof window !== "undefined") {
  window.ruleDslEditor = { createEmptyDsl, normalizeDsl, conditionsToDsl, isGroup };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node apps/pwa/tests/rule_dsl_editor.test.js`  
Expected: PASS

---

## Chunk 3: UI 结构与样式

### Task 3: Update `rules.js` UI + DSL API

**Files:**
- Modify: `apps/pwa/src/rules.js`

- [ ] **Step 1: Replace editor markup with可视化布局**
  - 新增 `#dsl-builder`、`#dsl-preview`、`#dsl-metrics`、`#dsl-validate`、`#dsl-evaluate`、`#dsl-result` 等节点。

- [ ] **Step 2: Add DSL API helpers**
```js
async getDslMeta(token) { ... }
async getDslFields(token) { ... }
async validateDsl(token, payload) { ... }
async evaluateDsl(token, payload) { ... }
```

---

### Task 4: Update `styles.css`

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: Add DSL editor styles**
  - `.rule-card-wide`, `.dsl-builder`, `.dsl-group`, `.dsl-row`, `.dsl-actions`
  - `.code-input` textarea style, `.dsl-status` 结果展示

---

### Task 5: Load new script

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: Add `<script src="./rule_dsl_editor.js"></script>`**
  - 放在 `rules.js` 之前或 `app.js` 之前

---

## Chunk 4: 行为逻辑与保存

### Task 6: Implement DSL editor behavior

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: Load DSL meta/fields**
  - 初始化阶段拉取 `/rules/dsl/meta` 与 `/rules/dsl/fields`
  - 缓存到 `dslMeta` / `dslFields`

- [ ] **Step 2: Render DSL builder**
  - 构建 group/row 的 DOM
  - 支持添加/删除规则行、添加子组、切换 AND/OR

- [ ] **Step 3: DSL 预览/校验/评估**
  - 预览 JSON
  - 校验按钮调用 `/rules/dsl/validate`
  - 评估按钮调用 `/rules/dsl/evaluate`

- [ ] **Step 4: 保存规则**
  - 保存时提交 `dsl_json`
  - `conditions` 可为空或省略
  - 编辑时若无 `dsl_json` 则从 `conditions` 初始化 DSL

---

## Chunk 5: Final Verification

- [ ] **Step 1: Run DSL editor tests**

Run: `node apps/pwa/tests/rule_dsl_editor.test.js`  
Expected: PASS
