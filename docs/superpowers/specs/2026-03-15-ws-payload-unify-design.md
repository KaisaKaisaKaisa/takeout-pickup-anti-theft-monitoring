# WS 事件载荷统一（兼容式）设计

## 目标

在不破坏现有消费者的前提下统一 WebSocket 事件载荷结构，便于前端与后端逐步迁移到统一实体结构。

## 范围

- WS payload 增加统一字段（entity）
- 统一事件构造函数
- 更新主要广播点（orders/alerts/devices/rule.match）

## 设计要点

### 1) 统一事件结构（兼容式）

保留现有 `payload.order/alert/device/match`，新增：

- `payload.entity_type`: `"order" | "alert" | "device" | "rule_match"`
- `payload.entity`: 统一实体快照
- `payload.version`: `"v1"`

### 2) 统一实体最小字段

`payload.entity` 至少包含：

- `id`
- `status`
- `summary`
- `updated_at`

若某字段暂无对应值，置为 `null`。

### 3) 构造器

在 `ws_payloads.py` 增加：

- `build_order_payload(order)`
- `build_alert_payload(alert)`
- `build_event_payload(entity_type, entity, extra=None)`

`summary` 统一：
- order: `provider + status`
- alert: `alert_type + level`
- device: `name + status`
- rule_match: `rule.name or event_type`

### 4) 接入范围

- `orders.py`（order.*）
- `alerts.py`（alert.*）
- `devices.py` / `edge_ingest.py` / `device_offline_checker.py`（device.*）
- `alert_engine.py`（rule.match）
- `integrations.py`（order.webhook）

## 兼容性

- 旧字段保留，前端可渐进迁移到 `payload.entity`

## 测试策略

- Python unittest：验证构造器的 entity 最小字段存在  
