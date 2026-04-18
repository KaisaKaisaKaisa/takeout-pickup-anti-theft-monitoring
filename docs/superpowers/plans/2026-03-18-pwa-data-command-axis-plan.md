# PWA Data Command Axis Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `报表 / 规则引擎 / 规则命中日志` 统一强化为下半页的数据指挥舱主轴

**Architecture:** 保留现有静态页面与动态规则引擎的功能结构，只为规则引擎补齐数据主轴壳层、工具栏和列表轨道语义。样式增强集中在 `styles.css`，通过回归测试同时锁定 `index.html`、`rules.js` 和关键 CSS 选择器。

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js test scripts

---

## Chunk 1: Regression First

### Task 1: 为数据主轴补失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增规则引擎主轴结构断言**
- [ ] **Step 2: 新增规则引擎主轴样式断言**
- [ ] **Step 3: 运行 `node apps/pwa/tests/cyber_ui_upgrade.test.js` 并确认失败**

## Chunk 2: Markup And Styling

### Task 2: 强化规则引擎结构

**Files:**
- Modify: `apps/pwa/src/rules.js`

- [ ] **Step 1: 为规则引擎外层补充数据主轴容器类**
- [ ] **Step 2: 为规则网格、编辑器卡片、工具栏、列表壳层补充语义类**
- [ ] **Step 3: 保持现有 `id` 与按钮绑定不变**

### Task 3: 强化数据主轴样式

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 增强规则引擎数据主轴容器与列宽节奏**
- [ ] **Step 2: 强化编辑器卡、工具栏、列表轨道的指挥舱质感**
- [ ] **Step 3: 保持 `reports / rules / rule-matches` 视觉语言一致**

## Chunk 3: Verification

### Task 4: 完整验证

**Files:**
- Test: `apps/pwa/tests/*.test.js`

- [ ] **Step 1: 运行 `node apps/pwa/tests/cyber_ui_upgrade.test.js`**
- [ ] **Step 2: 运行 `Get-ChildItem 'apps/pwa/tests' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName }`**
- [ ] **Step 3: 运行 `(Invoke-WebRequest 'http://127.0.0.1:5173/index.html').StatusCode`**

Plan complete and saved to `docs/superpowers/plans/2026-03-18-pwa-data-command-axis-plan.md`. Ready to execute?
