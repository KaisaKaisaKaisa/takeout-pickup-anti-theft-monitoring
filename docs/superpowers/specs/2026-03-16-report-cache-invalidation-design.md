# Report Cache Invalidation Completion Design

## Summary
补齐报表缓存失效点，确保设备、订单、告警相关变更后 `report_summary` 与 `report_trends` 立即刷新。

## Goals
- 仅补缺失的 `invalidate_report_caches(user_id)` 调用。
- 不改业务逻辑，不改统计口径，不改缓存 TTL。
- 变更点少、风险低、可快速验证。

## Non-goals
- 不做缓存体系重构。
- 不调整报表统计 SQL 逻辑。
- 不引入新的聚合表或异步任务。

## Affected Areas (Planned)

### Devices
- `devices.register_device`: 新设备影响设备统计 → 失效缓存
- `devices.update_device`: 状态/配置变化 → 失效缓存
- `devices.update_device_config`: 配置变化 → 失效缓存
- `devices.apply_preset`: 配置变化 → 失效缓存
- `edge_ingest.heartbeat`: 设备在线状态变化可能影响统计 → 失效缓存

### Orders / Integrations
- `integrations.mock_delivered`: 当前缺少失效 → 补齐

## Implementation Notes
- 使用现有 `invalidate_report_caches(user_id)`，不新增新接口。
- 对于设备相关接口，使用当前用户 `user.id`。
- 对于 `edge_ingest.heartbeat`，使用设备 owner 作为 user_id。

## Risks
- 在高频心跳下频繁失效缓存，可能带来更多报表请求压力（但当前 TTL 很短，影响有限）。

## Test Strategy
- 补齐单元测试不强制新增；使用现有集成验证或手动验证。
- 若新增测试，仅验证失效函数被调用。

