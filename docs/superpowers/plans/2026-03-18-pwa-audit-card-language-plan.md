# PWA 审计链路卡片语言 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 强化审计链路中的规则命中卡、告警卡和设备卡，让链路内部单元也具备明确的信息层级、状态语言和动作主次。

**Architecture:** 保持现有下半段布局与挂载点不变，只对 `apps/pwa/src/app.js` 中的卡片模板结构做展示级增强，并在 `apps/pwa/src/styles.css` 中补充共享卡片语言与针对性视觉层次。测试继续由 `apps/pwa/tests/cyber_ui_upgrade.test.js` 锁定模板结构和关键样式语义。

**Tech Stack:** vanilla JavaScript, HTML template strings, CSS3, Node.js test scripts

---

## Chunk 1: Regression First

### Task 1: 为卡片级审计 UI 补失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增卡片模板结构断言**

补充对 `app.js` 的结构断言，至少覆盖：
- 规则命中卡存在新的头部/元信息/状态结构类
- 告警卡存在新的等级或状态芯片结构
- 设备卡存在新的支撑节点结构
- localized 版本也带上相同结构语义

- [ ] **Step 2: 新增卡片级样式断言**

补充对 `styles.css` 的断言，至少覆盖：
- 审计记录卡的轨道感或状态芯片
- 告警卡的矩阵状态与主动作语言
- 设备卡的支撑舱节点语言

- [ ] **Step 3: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增测试失败
- 失败原因来自缺失的新卡片结构或样式

---

## Chunk 2: Template Updates

### Task 2: 更新 `app.js` 中的卡片模板

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: 重构规则命中卡模板**

为 `buildRuleMatchCard` 和 localized 版本增加：
- 头部容器
- 元信息网格
- 抑制状态芯片
- 代码区容器语义

- [ ] **Step 2: 重构告警卡模板**

为 `buildAlertCard` 和 localized 版本增加：
- 头部容器
- 等级/状态芯片
- 更明确的元信息层级
- 主次动作分组语义

- [ ] **Step 3: 重构设备卡模板**

为 `buildDeviceCard` 和 localized 版本增加：
- 支撑节点头部
- 元信息层级
- 辅助动作区

- [ ] **Step 4: 保留业务行为不变**

确认以下不变：
- `data-action`
- 事件监听
- `data-id`
- 列表挂载逻辑

- [ ] **Step 5: 运行测试验证结构断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增结构断言通过
- 样式断言可能仍失败

---

## Chunk 3: Styling

### Task 3: 补齐卡片级视觉语言

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 新增共享卡片语言类**

为新模板补齐通用样式：
- 卡片头部
- 芯片 / 状态标签
- 元信息网格
- 主次动作区

- [ ] **Step 2: 强化规则命中卡**

新增样式，使其更像审计记录：
- 轨道或定位标记
- 抑制状态高亮
- 数据元信息更紧凑

- [ ] **Step 3: 强化告警卡**

新增样式，使其更像告警矩阵单元：
- 等级突出
- 状态芯片明显
- 主动作更醒目

- [ ] **Step 4: 强化设备卡**

新增样式，使其更像支撑舱节点：
- 相对克制
- 但比普通列表更可信

- [ ] **Step 5: 运行测试验证样式断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 专项测试全部通过

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
- 这一轮允许修改 `apps/pwa/src/app.js`，但仅限展示模板层，不能修改业务行为。

Plan complete and saved to `docs/superpowers/plans/2026-03-18-pwa-audit-card-language-plan.md`. Ready to execute?
