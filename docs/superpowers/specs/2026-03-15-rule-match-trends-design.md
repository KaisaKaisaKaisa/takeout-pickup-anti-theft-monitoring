# 规则命中趋势轻量增量统计设计

## 目标

在不改动后端报表接口的前提下，让规则命中趋势在前端实现轻量增量更新，减少全量刷新频率并提升实时感。

## 范围

- 前端趋势缓存（rule_matches）
- WS 规则命中事件触发的本地桶更新
- 兜底刷新策略
- UI 增加“规则命中”趋势条

## 设计要点

### 1) 趋势缓存与桶更新

- 维护 `trendCache`（结构与 `renderTrends` 一致）  
- `renderTrends` 调用后写入 `trendCache`  
- 收到 `rule.match`：  
  - 若存在 `matched_at`，按当前 interval 计算桶  
  - 对 `rule_matches` 的对应桶 `count += 1`  
  - 局部重绘规则命中趋势条  

### 2) 兜底策略

- 若 `trendCache` 为空：触发一次 `loadTrends()`  
- 若 interval 变化：触发 `loadTrends()`  
- 若 `matched_at` 缺失：触发 `loadTrends()`  

### 3) UI

- 在趋势区新增 “规则命中” 走势图（样式与 alerts/events 一致）
- 不引入新图表库，复用现有 `renderTrendBars`

## 测试策略

- Node 纯 JS：
  - 计算桶函数（day/week）  
  - `applyRuleMatchIncrement` 增量更新逻辑
- 手动验证：
  - WS 规则命中发生时趋势条实时递增  

## 兼容性

- 不改变后端 API
- 与现有报表全量刷新逻辑兼容
