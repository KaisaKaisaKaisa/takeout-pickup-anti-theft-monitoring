# PWA 审计链路与告警关联设计

日期：2026-03-18

## 目标
把首页下半段从“多个并列系统面板”升级成一条更明确的审计叙事链，让用户能够更直观地理解：

规则命中 -> 告警生成 -> 证据查看

这轮设计继续服务于已经确认的三个目标：
- 强化首页信息层级，让重点更突出
- 提升高级感和品牌辨识度
- 强化 hover、切换和滚动体验

## 范围
- 调整 `apps/pwa/src/index.html` 中 `rule-matches`、`alerts`、`alert-detail`、`devices` 的下半段结构关系
- 调整 `apps/pwa/src/styles.css` 中下半段视觉主轴、壳层语言和交互动效
- 为新的结构语义和关键样式补充回归测试

## 非目标
- 不修改 `app.js` 中的业务逻辑、接口调用、WebSocket 行为或状态流
- 不变更现有 DOM 挂载点的 `id`
- 不重做整页布局，只聚焦下半段的审计链路

## 当前问题
当前下半段虽然已经具备赛博指挥舱语义，但 `rule-matches`、`alerts`、`alert-detail` 仍然更像三个彼此独立的面板：
- `rule-matches` 更像普通日志区，缺少“链路起点”的强引导
- `alerts` 的角色已经偏向“告警矩阵”，但与命中日志的因果关系还不够明显
- `alert-detail` 是详情面板，但尚未形成“证据舱”的终点感

结果是：
- 信息层级仍然偏平
- 下半页主叙事不够明确
- 用户无法一眼感知平台“从规则到处置”的闭环能力

## 备选方案

### 方案 A：审计链路主轴化
把 `rule-matches`、`alerts`、`alert-detail` 组织成连续的“命中追踪台 -> 告警矩阵 -> 证据舱”链路，并用统一的视觉壳层和连接语义强化因果关系。

优点：
- 信息层级提升最明显
- 更符合“平台可信处置闭环”的品牌心智
- 能同时提升结构感、品牌感和交互动效

代价：
- 需要小幅重排下半段结构
- 需要补充新的结构和样式测试

### 方案 B：仅强化告警与详情
只把 `alerts` 和 `alert-detail` 做成更强的高级面板，`rule-matches` 基本保持现状。

优点：
- 改动较小
- 风险低

问题：
- 链路不完整
- 首页重点依然不够集中

### 方案 C：以动效为主
结构基本不动，主要强化 hover、切换和滚动进入。

优点：
- 实现成本最低

问题：
- 只能增加“热闹感”，不能根本提升信息层级

## 结论
采用方案 A。

理由：
- 这是最符合当前产品定位的一轮优化
- 能把下半页从“功能罗列”提升为“审计闭环”
- 也最直接回应用户对重点、高级感和品牌辨识度的要求

## 设计方案

### 1. 叙事结构
下半页聚焦为一条连续链路：

1. `rule-matches`
   作为链路起点，承担“规则命中追踪台 / 审计时间线”的角色
2. `alerts`
   作为中间层，承担“告警矩阵 / 处置分发台”的角色
3. `alert-detail`
   作为终点，承担“证据舱 / 载荷舱”的角色

`devices` 不再与三者争夺主叙事，而是退后为“支撑舱 / 设备网格”，保留系统存在感但不抢主轴。

### 2. 结构策略
在不改现有 `id` 的前提下，为下半段增加新的结构语义：

- 新增一层审计链路布局容器，用于组织 `rule-matches` 与 `alerts + alert-detail`
- `rule-matches` 获得更明确的链路起点语义类
- `alerts` 获得“矩阵舱”语义类
- `alert-detail` 获得“证据舱”语义类
- `devices` 保留 `command-shell-cabinet`，但在布局上后退为支撑区

结构上优先考虑：
- `rule-matches` 作为完整宽度的起始面板
- `alerts` 与 `alert-detail` 组成更紧密的双列链路
- `devices` 独立成为次级支撑面板

### 3. 视觉语言

#### `rule-matches`：命中追踪台
- 更偏数据主轴的冷色语义
- 增强纵向轨道感、扫描感、时间线感
- 列表容器更像“审计记录槽位”
- hover 更强调“锁定命中记录”的感觉

#### `alerts`：告警矩阵
- 更强调分级、聚类、派发感
- 壳层从普通列表提升为“矩阵面板”
- 面板内部的列表密度和状态对比更强
- 与 `rule-matches` 保持视觉因果关系

#### `alert-detail`：证据舱
- 更聚焦 payload、媒体、上下文
- 强化“舱室 / 载荷 / 证据抽屉”感
- 面板亮度和对比度略高于 `alerts`
- 成为下半页的视觉终点

### 4. 交互动效

#### Hover
- `rule-matches` hover 偏“锁定记录”
- `alerts` hover 偏“提升告警优先级感知”
- `alert-detail` hover 偏“打开证据仓”的聚焦感

#### Scroll reveal
- `rule-matches` 作为链路起点优先进入
- `alerts`、`alert-detail` 作为第二段进入
- `devices` 稍后进入，避免抢主轴

#### 切换与状态反馈
- 保持现有全局主题切换机制
- 下半段新增的壳层和连接高光要跟随主题切换统一映射

## 技术约束
- 保留以下挂载点不变：
  - `alerts-list`
  - `alert-detail-output`
  - `alert-media`
  - `devices-list`
  - `health-output`
  - `rule-matches-list`
  - `load-rule-matches`
  - `rule-match-filter`
  - `rule-match-range`
  - `rule-match-search`
  - `include-suppressed`
- 主要改动集中在 HTML 与 CSS
- 仅在确有必要时增加结构类名或包装层
- 不更改业务逻辑 JavaScript

## 验证策略
- 在 `apps/pwa/tests/cyber_ui_upgrade.test.js` 中新增结构断言
- 在 `apps/pwa/tests/cyber_ui_upgrade.test.js` 中新增关键样式断言
- 跑通：
  - `node apps/pwa/tests/cyber_ui_upgrade.test.js`
  - `Get-ChildItem 'apps/pwa/tests' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName }`
  - `(Invoke-WebRequest 'http://127.0.0.1:5173/index.html').StatusCode`

## 实施建议
这一轮建议严格保持 TDD 顺序：

1. 先写失败测试，锁定审计链路的结构语义和视觉语义
2. 再调整 `index.html`
3. 再补齐 `styles.css`
4. 最后做完整验证
