# 报表导出 + 规则命中日志 + 前端可视化增强设计

## 概述
在不改变现有报表结构的前提下，增强报表导出能力（可选时间范围）、规则命中日志筛选能力，并在前端增加清晰的筛选与导出反馈。

## 目标
- 报表导出支持可选 `start/end` 时间范围。
- 规则命中日志接口支持 `start/end` 与 `rule_set_id` 过滤。
- 前端新增时间范围筛选与导出状态提示。
- 与现有 `interval/days/weeks` 兼容，不破坏旧行为。

## 非目标
- 不引入异步导出任务或离线聚合表。
- 不修改报表基础数据结构（summary/trends/matches）。
- 不新增 WebSocket 实时推送逻辑。

## 后端设计

### 1. 报表导出接口
新增可选参数：
- `start` / `end`：ISO8601 或 `YYYY-MM-DD`。

行为规则：
- 若 `start/end` 同时提供，则优先使用范围过滤。
- 若未提供 `start/end`，沿用既有 `interval/days/weeks` 行为。

涉及接口：
- `GET /reports/summary/export?scope=user|global&start=&end=`
- `GET /reports/trends/export?scope=user|global&interval=day|week&start=&end=&days=&weeks=`
- `GET /reports/rule-matches/export?scope=user|global&limit=&start=&end=`

导出响应：
- CSV 保持原格式，可在第一行增加范围注释（可选，确保兼容）。

### 2. 规则命中日志接口
在 `GET /rules/matches` 增加过滤项：
- `start` / `end`（时间范围）
- `rule_set_id`（规则集）
- 保持原分页与 `limit` 逻辑。

### 3. 缓存一致性
- 报表缓存 key 需包含 `start/end`，避免范围混用。
- 导出接口不走缓存（避免 stale）。

## 前端设计

### 1. 报表区时间范围
- 增加起止日期输入。
- 若选择范围，则请求与导出使用 `start/end`。
- 若清空范围，则恢复 `interval/days/weeks` 策略。

### 2. 规则命中日志筛选
- 增加起止日期与规则集下拉（复用 Rule Sets 列表）。
- 列表与分页按钮保持现有行为。

### 3. 导出反馈
- 点击导出：按钮禁用 + 文案切换（下载中）。
- 成功/失败提示：复用现有 toast/notice 风格。

## 边界与错误处理
- `start/end` 解析失败返回 400。
- 仅提供一个参数时视为无效范围，回退到旧逻辑或提示缺失（实现中明确）。
- `rule_set_id` 不存在时返回空列表。

## 测试
- 后端：新增时间范围导出测试（summary/trends/rule-matches）。
- 规则命中日志：start/end 与 rule_set_id 过滤测试。
- 前端：导出按钮状态与参数拼接（轻量单测/手测）。
