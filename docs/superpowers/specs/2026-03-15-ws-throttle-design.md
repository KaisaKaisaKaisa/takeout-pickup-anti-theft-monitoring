# WebSocket 事件去抖/合并策略设计

## 目标

细化前端 WebSocket 事件的刷新节流，避免不同类型事件相互拖累，并在后台/前台切换时保证一致性。

## 范围

- 前端刷新节流逻辑（orders/alerts/devices/reports）
- 页面可见性处理
- 最小化测试

## 设计要点

### 1) 分类型节流

- 独立 timer 与 pending 状态：
  - orders/alerts：200ms
  - devices：500ms
  - reports：800ms

### 2) 可见性与一致性

- `document.hidden` 时仅记录 pending，不触发刷新  
- 页面恢复时统一刷新一次（以 pending 为准）

### 3) 兜底

- 事件爆发时合并到下一次刷新，避免高频请求

## 测试策略（Node 纯 JS）

- 简单节流函数行为验证（触发次数统计）

## 兼容性

- 不改变后端接口与 WebSocket 协议
