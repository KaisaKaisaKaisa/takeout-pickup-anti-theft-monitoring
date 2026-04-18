# WebSocket 增量更新链路优化设计

## 目标

补齐设备事件与规则命中日志的增量更新链路，减少前端全量刷新，保持 UI 实时与流畅。

## 范围

- WebSocket 消息 payload 结构补齐（`device.*` / `rule.match`）
- 前端基于 payload 的就地合并与插入
- 不改变现有接口路径与路由结构

## 设计决策

### 1) 事件模型

- 统一消息结构：`{ type, payload, ts }`
- 事件类型：
  - `device.registered` / `device.updated` / `device.config`
  - `rule.match`

### 2) Payload 结构

#### device.*

```json
{
  "device": {
    "id": "uuid",
    "name": "Edge-01",
    "device_type": "camera",
    "status": "online",
    "device_code": "TG-XXXX",
    "last_seen_at": "2026-03-14T10:00:00Z",
    "config": { "sensitivity": { "min_motion_score": 0.6 } }
  }
}
```

#### rule.match

```json
{
  "match": {
    "id": "uuid",
    "rule_id": "uuid",
    "order_id": "uuid",
    "event_type": "order.delivered",
    "matched_at": "2026-03-14T10:00:00Z",
    "suppressed": false,
    "summary": "超时未取餐"
  }
}
```

### 3) 后端改动

- `routers/devices.py`：
  - 在 `device.registered` / `device.updated` / `device.config` 广播中加入 `device` 实体快照
- `services/alert_engine.py`：
  - `rule.match` 广播中加入 `match` 结构（规则命中日志实体）

### 4) 前端改动

- `app.js`：
  - WS 事件处理：
    - `device.*`：合并更新 `devices-list` 列表项（按 `data-id`）
    - `rule.match`：将新日志插入 `rule-matches-list` 顶部，更新分页状态
  - 首次加载仍调用 `loadRuleMatches(1)`，WS 作为实时增量

### 5) 兼容性

- 不改变现有 HTTP API
- WebSocket 订阅机制不变

## 测试策略

### 后端（pytest）

- `device.*` 广播 payload 包含 `device` 字段与核心属性
- `rule.match` 广播 payload 包含 `match` 字段与核心属性

### 前端

若环境支持，增加最小化 JS 单测验证：
- `mergeListItem` 合并逻辑
- `rule.match` 插入逻辑（新元素出现在列表顶部）

## 风险与回滚

- 若增量更新异常，前端仍可通过手动刷新或全量加载恢复一致性
- 后端仅扩充 payload，不影响现有消费者
