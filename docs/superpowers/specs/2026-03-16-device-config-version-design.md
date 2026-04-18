# Device Config Version 下发设计

## 概述
为设备配置增加稳定的版本标识（`config_version`/`config_hash`），设备轮询配置时可判断是否需要更新，并在心跳中回传已应用版本，便于后端记录与排查。

## 目标
- 配置响应包含 `config_version` 与 `config_hash`（一致的稳定值）。
- 设备心跳可上报 `applied_config_version`，后端记录到设备配置元信息中。
- 不新增表结构，沿用 `edge_devices.config_json`。

## 非目标
- 不新增 WebSocket 主动推送配置。
- 不新增独立的 ack 接口。
- 不改变现有设备配置结构的业务语义。

## 设计

### 版本计算
- 计算对象：`build_device_config(device)` 返回的配置内容，但需剔除运行态字段，避免每次心跳引发版本变化。
- 运行态字段（剔除）：
  - `last_heartbeat`
  - `last_applied_version`
  - `last_applied_at`
- 计算方式：对剔除后的配置进行稳定 JSON 序列化（`sort_keys=True`）后取 `sha256`，结果作为 `config_hash`，同时复用为 `config_version`。

### 配置下发
`GET /edge/devices/{device_id}/config` 返回：
```json
{
  "config": {
    "...": "...",
    "config_hash": "sha256...",
    "config_version": "sha256..."
  }
}
```

### 设备回传
设备心跳 `POST /edge/devices/{device_id}/heartbeat` 允许携带：
```json
{
  "applied_config_version": "sha256..."
}
```
后端记录：
- `device.config_json["last_applied_version"]`
- `device.config_json["last_applied_at"]`（UTC 时间戳）

## 兼容性
- 老设备不回传 `applied_config_version` 时不影响现有流程。
- 旧字段缺失时作为回退显示（不阻塞 UI）。

## 测试
- `build_device_config` 生成的 `config_version` 对运行态字段变更保持稳定。
- 心跳上报 `applied_config_version` 时，`config_json` 正确记录。
