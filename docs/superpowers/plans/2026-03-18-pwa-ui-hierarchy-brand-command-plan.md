# PWA UI 层级强化与品牌中枢化 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 PWA 交互逻辑的前提下，重构页面信息层级、品牌表达和动效节奏，让首页更有品牌压强，内容区更像高端赛博指挥中枢。

**Architecture:** 以 `apps/pwa/src/index.html` 的现有模块骨架为基础，保留已有 section、id、class 和 JS 挂载点，只对局部 DOM 包裹层、文案结构和模块顺序做增量增强。样式与动效全部集中在 `apps/pwa/src/styles.css`，继续复用现有 `data-theme`、`data-motion` 和 `data-grid` 机制，不新增业务 JS 依赖。

**Tech Stack:** HTML5, CSS3, Python http.server, Node.js test scripts

---

## Chunk 1: 首屏品牌压强与全局层级重建

### Task 1: 为首屏层级重排写回归测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 为 Hero 结构新增失败测试**

在 `apps/pwa/tests/cyber_ui_upgrade.test.js` 中新增一个测试，检查：
- `#overview` 内存在更强的品牌层级容器或品牌状态组
- 首屏 KPI 仍在 Hero 内
- 右侧主视觉区仍保留可供 JS/静态展示复用的实时窗口

测试断言应基于 HTML 字符串，不依赖浏览器环境。

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增的 Hero 层级测试失败
- 失败原因是当前 DOM 尚未包含新的品牌层级结构

### Task 2: 重做 Topbar 与 Hero 结构

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: 重排 Topbar 品牌区与操作区**

在不移除现有导航和按钮功能的前提下：
- 提升品牌标识与品牌文案容器的可塑性
- 为右侧动作区增加更清晰的品牌动作布局
- 保持现有按钮文本和基础节点仍可复用

- [ ] **Step 2: 重构 Hero 左侧内容层级**

将 Hero 左侧整理成更清晰的层次：
- 品牌状态/标签行
- 更高压强的主标题区
- 价值主张说明
- 更明确的主 CTA / 次 CTA 区
- 首屏可信证明短句

保留 `#overview` 与现有 Hero 内核心内容语义，不引入破坏性结构变更。

- [ ] **Step 3: 升级 Hero 右侧主视觉窗口**

将现有波形卡提升为更有品牌感的“实时态势视窗”：
- 扩大视觉权重
- 保留波形 SVG 与在线状态元素
- 让右侧窗口承担首屏主视觉角色

- [ ] **Step 4: 重新组织 Hero KPI 证明带**

保留已有 `hero-sessions`、`hero-alerts`、`hero-devices` 这三个 id，
但重排容器和说明关系，让 KPI 更像首屏证明带，而不是松散数值块。

- [ ] **Step 5: 运行测试确认通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增 Hero 层级测试通过
- 原有赛博 UI 回归测试继续通过

### Task 3: 重建全局品牌层级样式

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 重写 Topbar 的品牌压强样式**

调整以下区域样式：
- `.topbar`
- `.brand`
- `.brand-mark`
- `.brand-text`
- `.top-actions`
- `.nav`

目标：
- 导航弱化为辅助层
- 品牌区更像高端产品入口
- 主按钮成为顶部最明确的动作点

- [ ] **Step 2: 重写 Hero 布局与首屏主次**

调整以下区域样式：
- `.hero`
- `.hero-copy`
- `.hero-actions`
- `.hero-meta`
- `.hero-visual`
- `.signal-card`
- `.metric-grid`
- `.metric`

目标：
- 左侧标题压强显著高于其他模块
- 右侧实时窗口成为首屏第二视觉焦点
- KPI 成为可信证明带

- [ ] **Step 3: 为首屏增加品牌级入场节奏**

通过 CSS 为以下元素增加分层入场：
- Hero 背景层
- 标签/标题/说明
- CTA
- 主视觉窗口
- KPI

要求：
- 只使用 CSS
- 默认节奏克制，不得造成整页躁动
- 与 `prefers-reduced-motion` 兼容

- [ ] **Step 4: 运行测试确保未破坏现有用例**

Run: `Get-ChildItem apps/pwa/tests -Filter *.test.js | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- `apps/pwa/tests` 全部通过

---

## Chunk 2: 中段展示区与下段作战区主次重构

### Task 4: 为关键中下段层级写失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增关键模块权重结构测试**

新增测试，检查：
- `#console`、`#reports`、`#rules`、`#alerts`、`#devices` 仍然存在
- 展示型模块与系统型模块有可区分的容器/类名或结构标记
- `#reports .trend-grid` 继续包含 6 张趋势卡

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增的模块层级测试失败
- 失败原因是当前结构还没有新的角色分层标记

### Task 5: 调整中段展示区结构

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: 为展示型模块补充分组语义**

在不破坏现有 id 和交互的前提下，为以下 section 增加更明确的角色标识或包裹层：
- `#mission`
- `#gallery`
- `#motion`
- `#workflow`

目标：
- 这些区域统一归为“展示/品牌支撑区”
- 不与系统型模块抢主语

- [ ] **Step 2: 为系统型模块补充分组语义**

为以下 section 增加更明确的角色标识或包裹层：
- `#console`
- `#reports`
- `#ops`
- `#rules`
- `#orders`
- `#alerts`
- `#alert-detail`
- `#devices`
- `#rule-matches`

目标：
- 建立“中枢系统区 / 作战区”的统一基础
- 后续样式可针对系统型模块整体增强

- [ ] **Step 3: 运行测试确认通过**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 新增模块层级测试通过
- 旧测试继续通过

### Task 6: 强化展示区与作战区视觉差异

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 下调展示型模块的系统压强**

针对案例、模板、动效、流程相关卡片：
- 保留精致感
- 降低统一 hover 抬升和高频 glow 的存在感
- 强化它们作为“品牌支撑区”的展示属性

- [ ] **Step 2: 上调系统型模块的中枢压强**

针对控制台、报表、规则、设备、告警、日志等区域：
- 强化边界与背景层级
- 强化标题、状态、过滤器和动作区的可操作感
- 让这些模块更接近“中枢面板”而不是普通卡片

- [ ] **Step 3: 重做流程区为链路感表达**

调整 `#workflow` 的样式关系：
- 更明确的步骤推进关系
- 更强的系统链路感
- 保持现有文本和节点仍可复用

- [ ] **Step 4: 强化报表区为数据中枢**

重点调整：
- `.summary-grid`
- `.summary-card`
- `.trend-grid`
- `.trend-card`
- `.trend-legend`
- `.report-actions`

目标：
- 摘要卡成为可信证明层
- 趋势区成为真实的数据核心
- 导出动作退居辅助但仍清晰可用

- [ ] **Step 5: 运行全套前端测试**

Run: `Get-ChildItem apps/pwa/tests -Filter *.test.js | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- `apps/pwa/tests` 全部通过

---

## Chunk 3: 交互质感、主题切换与滚动节奏强化

### Task 7: 为交互层级和主题切换写失败测试

**Files:**
- Modify: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 新增交互动效相关测试**

新增测试，至少覆盖：
- 主按钮伪元素动画仍存在且为 `buttonSweep`
- 默认主题变量与切换主题后的关键变量继续不同
- 关键系统模块仍保有装饰层和不阻断交互的背景层

- [ ] **Step 2: 运行测试确认失败**

Run: `node apps/pwa/tests/cyber_ui_upgrade.test.js`

Expected:
- 至少一个新增动效/层级断言失败

### Task 8: 分层强化 hover、切换与滚动体验

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 区分展示型卡片与系统型卡片 hover**

将展示型与系统型模块的 hover 分成两套反馈：
- 展示型：更轻、更柔和
- 系统型：更明确的激活与状态强化

- [ ] **Step 2: 统一主题切换过渡**

为主题变量驱动的关键区域补统一过渡：
- 背景光场
- 边框光
- 按钮高亮
- 主视觉窗口

要求：
- 不修改业务 JS
- 主题切换依旧由现有 `data-theme` 驱动

- [ ] **Step 3: 调整滚动 reveal 节奏**

在现有 reveal 结构不失效的前提下，让关键模块比次级模块更先建立视觉主次。
如果当前 reveal 仅依赖 CSS，可通过选择器和延时分层完成。

- [ ] **Step 4: 强化筛选器、标签、状态点的组件级反馈**

重点统一：
- `.pill`
- `.chip`
- 筛选按钮
- toggle 按钮
- 状态型微组件

目标：
- 强化激活态
- 提升系统语义
- 保持品牌一致性

- [ ] **Step 5: 运行测试确认全部通过**

Run: `Get-ChildItem apps/pwa/tests -Filter *.test.js | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- `apps/pwa/tests` 全部通过

---

## Chunk 4: 视觉验收与交付检查

### Task 9: 生成最终视觉验收结果

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/styles.css`
- Test: `apps/pwa/tests/cyber_ui_upgrade.test.js`

- [ ] **Step 1: 启动本地静态服务**

Run: `Set-Location apps/pwa/src; py -m http.server 5173`

Expected:
- 本地可访问 `http://127.0.0.1:5173/index.html`

- [ ] **Step 2: 手动检查默认主题**

检查点：
- 首屏品牌主语明显强于下方模块
- Hero 右侧主视觉承担第二焦点
- 控制台、报表、规则、告警、设备比展示型模块更有系统权重

- [ ] **Step 3: 手动检查主题切换**

检查点：
- 切到 `ember` / `azur` / `lime` 时品牌感仍成立
- 主题切换时没有破坏对比度
- 关键 glow 和描边仍有统一逻辑

- [ ] **Step 4: 手动检查交互与滚动**

检查点：
- 主按钮、卡片、筛选器 hover 更有差异化
- 滚动进入更有主次顺序
- 页面整体不躁动，静区仍然存在

- [ ] **Step 5: 运行最终回归测试**

Run: `Get-ChildItem apps/pwa/tests -Filter *.test.js | Sort-Object Name | ForEach-Object { node $_.FullName }`

Expected:
- `apps/pwa/tests` 全部通过

---

Plan complete and saved to `docs/superpowers/plans/2026-03-18-pwa-ui-hierarchy-brand-command-plan.md`. Ready to execute?
