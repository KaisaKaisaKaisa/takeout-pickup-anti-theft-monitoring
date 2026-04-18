# PWA 告警卡与证据舱联动 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让告警卡与证据舱形成明确的选中态和装载态联动，同时保持现有业务交互逻辑不变。

**Architecture:** 在 `apps/pwa/src/app.js` 中为告警卡和证据舱增加轻量展示状态类切换，避免引入新的复杂状态管理。样式增强集中在 `apps/pwa/src/styles.css`，测试继续由 `apps/pwa/tests/cyber_ui_upgrade.test.js` 锁定结构与联动语义。

**Tech Stack:** vanilla JavaScript, CSS3, Node.js test scripts

---

## Chunk 1: Regression First

### Task 1: 为联动状态补失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增 app.js 联动状态断言**

至少覆盖：
- 告警卡存在 `is-selected` 或同类联动标记
- 证据舱存在 `is-loaded`、`is-evidence` 或同类状态标记
- 告警按钮点击流程中会触发状态切换辅助逻辑

- [ ] **Step 2: 新增 CSS 联动样式断言**

至少覆盖：
- 告警卡选中态
- 证据舱装载态
- 证据舱取证态

- [ ] **Step 3: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增联动测试失败

---

## Chunk 2: Behavior Wiring

### Task 2: 为告警卡和证据舱接入轻量状态类

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 增加告警卡选中态辅助逻辑**

为告警卡引入轻量辅助函数，使点击 `detail` 或 `evidence` 时：
- 当前告警卡进入选中态
- 其他告警卡退出选中态

- [ ] **Step 2: 增加证据舱状态类切换**

在详情和取证完成后分别给证据舱切换：
- 已加载详情状态
- 已生成证据状态

- [ ] **Step 3: 失败时清理误导状态**

确保请求失败时不会保留错误的激活态或舱内状态。

- [ ] **Step 4: 运行测试验证结构/逻辑断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 结构和逻辑断言通过
- 样式断言可能仍失败

---

## Chunk 3: Styling

### Task 3: 补齐联动状态样式

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 增加告警卡选中态样式**

让选中的告警卡明显区别于其他卡片。

- [ ] **Step 2: 增加证据舱已加载态样式**

让证据舱在详情成功加载后出现明显聚焦状态。

- [ ] **Step 3: 增加证据舱取证完成态样式**

让取证成功后的证据舱更像“证据包已装载”。

- [ ] **Step 4: 运行专项测试验证样式断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 专项测试通过

---

## Chunk 4: Full Verification

### Task 4: 完整验证

**Files:**
- Test: `apps/pwa/tests/cyber_ui_upgrade.test.js`
- Test: `apps/pwa/tests/*.test.js`

- [ ] **Step 1: 运行专项测试**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- PASS

- [ ] **Step 2: 运行全量测试**

Run: `Get-ChildItem 'apps/pwa/tests' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- 所有测试通过

- [ ] **Step 3: 验证页面可访问**

Run: `(Invoke-WebRequest 'http://127.0.0.1:5173/index.html').StatusCode`

Expected:
- 返回 `200`

---

环境说明：
- 当前目录不是 git 仓库，因此不包含 commit 步骤。
- 这一轮允许修改 `apps/pwa/src/app.js`，但仅限展示状态辅助逻辑。

Plan complete and saved to `docs/superpowers/plans/2026-03-18-pwa-alert-evidence-link-plan.md`. Ready to execute?
