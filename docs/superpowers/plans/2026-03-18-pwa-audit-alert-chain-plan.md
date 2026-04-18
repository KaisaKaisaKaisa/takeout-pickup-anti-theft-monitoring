# PWA 审计链路与告警关联 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页下半段重构为更明确的“规则命中 -> 告警 -> 证据详情”审计链路，同时保留现有业务绑定与交互逻辑。

**Architecture:** 保留 `apps/pwa/src/index.html` 中现有核心 section 和所有业务 `id`，仅通过新增包装层、语义类和布局重排来建立新的链路关系。样式改动集中在 `apps/pwa/src/styles.css`，业务逻辑默认不动，测试继续由 `apps/pwa/tests/cyber_ui_upgrade.test.js` 锁定结构和关键样式。

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js test scripts

---

## Chunk 1: Regression First

### Task 1: 为审计链路补失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增审计链路结构断言**

补充针对下半段的新测试，至少覆盖：
- `#rule-matches` 具备新的链路起点语义类
- `#alerts` 具备新的矩阵舱语义类
- `#alert-detail` 具备新的证据舱语义类
- 下半段存在新的链路布局容器
- `#devices` 仍保留但退出主链路焦点

- [ ] **Step 2: 新增审计链路关键样式断言**

补充 CSS 断言，至少覆盖：
- 新的链路布局网格
- `rule-matches` 的审计轨道/扫描语义
- `alerts` 的矩阵壳层语义
- `alert-detail` 的证据舱壳层语义
- 下半段新的 reveal 节奏或 hover 反馈

- [ ] **Step 3: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增测试失败
- 失败原因指向缺失的新结构或样式，而不是拼写错误

---

## Chunk 2: Markup

### Task 2: 重组下半段审计链路结构

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: 为下半段加入链路布局容器**

在不移除已有 section `id` 的前提下：
- 新增审计链路包装层
- 明确 `rule-matches` 为链路起点
- 明确 `alerts + alert-detail` 为链路主段
- 让 `devices` 成为次级支撑面板

- [ ] **Step 2: 为 `rule-matches` 增加链路起点语义**

新增只影响视觉和结构的类名/包装层，使其更像：
- 审计追踪台
- 命中时间线
- 记录槽位起始面板

保留：
- `rule-match-filter`
- `rule-match-range`
- `rule-match-search`
- `load-rule-matches`
- `include-suppressed`
- `rule-matches-list`

- [ ] **Step 3: 为 `alerts` 增加矩阵舱语义**

新增只影响视觉和结构的类名/包装层，使其更像：
- 告警矩阵
- 分级分发面板
- 中段处理节点

保留 `alerts-list` 原样挂载。

- [ ] **Step 4: 为 `alert-detail` 增加证据舱语义**

新增只影响视觉和结构的类名/包装层，使其更像：
- 证据舱
- 载荷舱
- 链路终点详情面板

保留：
- `alert-detail-output`
- `alert-media`

- [ ] **Step 5: 调整 `devices` 的叙事优先级**

保留 `devices` 现有功能和挂载点，但在结构上：
- 降为辅助区
- 不与审计链路争夺主叙事

- [ ] **Step 6: 运行测试验证结构断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增结构测试通过
- 样式断言仍可能失败

---

## Chunk 3: Styling

### Task 3: 为审计链路补齐主轴样式

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 新增链路布局样式**

新增下半段相关布局样式，至少包括：
- 审计链路整体容器
- `rule-matches` 的主轴位置
- `alerts + alert-detail` 的主链路双列关系
- `devices` 的次级支撑位置

- [ ] **Step 2: 强化 `rule-matches` 的审计追踪语言**

补充样式，让它明显区别于普通日志：
- 纵向轨道感
- 审计扫描感
- 更强的数据冷色表面
- 更清晰的槽位边界

- [ ] **Step 3: 强化 `alerts` 的矩阵壳层**

补充样式，让它明显区别于普通列表：
- 更强的面板分级感
- 告警矩阵表面纹理
- 更明确的 hover 抬升与状态反馈

- [ ] **Step 4: 强化 `alert-detail` 的证据舱语义**

补充样式，让它成为链路终点：
- 更聚焦的亮度和对比
- 媒体与 payload 的舱室感
- 比 `alerts` 更强的聚焦反馈

- [ ] **Step 5: 调整 reveal 和交互节奏**

确保下半段进入节奏更符合叙事链：
- `rule-matches` 优先出现
- `alerts` 与 `alert-detail` 紧随其后
- `devices` 稍后进入

- [ ] **Step 6: 运行测试验证样式断言通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 结构断言和样式断言全部通过

---

## Chunk 4: Full Verification

### Task 4: 完整验证

**Files:**
- Test: `apps/pwa/tests/cyber_ui_upgrade.test.js`
- Test: `apps/pwa/tests/*.test.js`

- [ ] **Step 1: 运行审计链路专项测试**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- PASS

- [ ] **Step 2: 运行全量前端测试**

Run: `Get-ChildItem 'apps/pwa/tests' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- 所有测试脚本通过

- [ ] **Step 3: 验证本地页面可访问**

Run: `(Invoke-WebRequest 'http://127.0.0.1:5173/index.html').StatusCode`

Expected:
- 返回 `200`

---

环境说明：
- 当前工作区不是 git 仓库，因此本计划不包含 commit 步骤。
- 默认不修改 `apps/pwa/src/app.js`；如实现时必须调整，只能做不影响业务行为的最小改动，并补测试说明理由。

Plan complete and saved to `docs/superpowers/plans/2026-03-18-pwa-audit-alert-chain-plan.md`. Ready to execute?
