# 实时一致性优化设计（WS 增量 + 设备联动 + 报表节流）

## 目标

在保持现有 API 结构的前提下，优化前端列表实时更新的一致性与性能，并补齐设备心跳/离线事件的实时同步。

## 范围

- 前端增量更新：去重、容量上限、异常兜底刷新
- 设备联动：心跳/离线事件广播 `device.updated`
- 报表节流：利用现有 `mark/scheduleFlush` 做轻量刷新

## 设计要点

### 1) 列表一致性与容量控制

- 规则命中列表最多保留 200 条  
- 订单/告警列表各保留 100 条  
- 设备列表不裁剪  

插入策略：
- 使用 `mergeListItem` 按 `data-id` 替换或新增
- 插入后执行裁剪，移除末尾超额项
- 若 payload 缺失 `id` 或关键字段，触发一次轻量全量刷新

### 2) 设备联动

心跳路径：
`/edge/devices/{device_id}/heartbeat`
- 当设备状态从非在线转为在线，或 `last_seen_at` 更新超过节流阈值时广播  
- 广播事件：`device.updated` + `device` 快照
- 默认节流 30 秒

离线路径：
`device_offline_checker`
- 标记设备离线后广播  
  `device.updated` + `device` 快照

### 3) 报表节流刷新

- 通过现有 `mark("order"/"alert"/"device")` + `scheduleFlush` 进行 250ms 节流刷新  
- `rule.match` 只触发列表增量插入，不强制刷新趋势  
- 若 WS 事件缺字段，触发一次 `loadReports()` 兜底

## 兼容性

- 不改变现有 HTTP API
- WS 订阅机制不变

## 测试策略

### 前端（Node 纯 JS）
- 新增 `capList`/`enforceListLimit` 类函数测试
- 规则命中插入逻辑仍通过 `shouldInsertRuleMatch` 覆盖

### 后端（unittest）
- 心跳广播逻辑与离线广播路径覆盖（最小化断言 payload 字段存在）

## 风险与回滚

- 若 WS 增量异常，前端可通过手动刷新恢复一致性  
- 事件广播仅扩充，不破坏现有消费方
