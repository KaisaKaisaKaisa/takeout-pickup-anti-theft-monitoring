# 项目结构与接口清单

## 项目目录结构

```text
D:\mine_codex\mycodex3
|-- apps
|   |-- api
|   |   `-- app
|   |       |-- core
|   |       |-- models
|   |       |-- routers
|   |       |-- schemas
|   |       |-- services
|   |       `-- main.py
|   |-- edge-agent
|   |   `-- agent
|   |       |-- main.py
|   |       |-- camera_guard.py
|   |       |-- motion_detector.py
|   |       |-- weight_sensor.py
|   |       |-- weight_sensor_gpio.py
|   |       |-- config_client.py
|   |       `-- edge_queue.py
|   `-- pwa
|       `-- src
|           |-- index.html
|           |-- app.js
|           |-- rules.js
|           |-- styles.css
|           `-- sw.js
|-- docs
|   |-- architecture.md
|   |-- deployment.md
|   |-- openapi.yaml
|   |-- schema.sql        # 历史 schema 快照，不作为迁移入口
|   |-- sequence.mmd
|   |-- solution.md
|   |-- webhook.md
|   `-- spec.md
|-- infra
|   `-- compose
|       `-- docker-compose.yml
|-- scripts
|   |-- init_db.py
|   |-- simulate_flow.py
|   |-- gen_vapid.py
|   `-- run_pwa.ps1
|-- .env.example
`-- README.md
```

## 数据库表设计（摘要）

数据库结构以 Alembic 迁移为唯一来源，迁移目录为 `apps/api/migrations`。`docs/schema.sql` 仅作为历史 schema 快照，不能用于初始化、升级或回滚数据库。

| 表名 | 用途 | 关键字段 |
| --- | --- | --- |
| users | 用户账号 | phone, password_hash, default_pickup_window_min |
| edge_devices | 边缘设备 | device_code, status, last_seen_at, config_json |
| orders | 外卖订单 | provider, provider_order_id, status, delivered_at |
| order_status_events | 订单状态事件 | from_status, to_status, raw_payload, event_time |
| monitoring_sessions | 监控会话 | state, pickup_deadline_at, sensitivity_config |
| sensor_events | 传感器事件 | event_type, severity, metrics_json, snapshot_media_id |
| whitelist_profiles | 白名单 | name, method_type, enabled, meta_json |
| pickup_confirmations | 取餐确认 | confirm_method, confirmed_at |
| pickup_codes | 取餐码 | code, expires_at, used_at |
| alert_incidents | 告警事件 | alert_type, level, status, triggered_at, rule_id, rule_set_id |
| media_assets | 证据媒体 | media_type, object_key, sha256, expires_at |
| evidence_bundles | 取证包 | status, zip_media_id, manifest_json |
| push_subscriptions | 推送订阅 | platform, endpoint, p256dh, auth |
| notification_logs | 通知日志 | channel, status, provider_response |
| audit_logs | 审计日志 | action, resource_type, resource_id |
| rule_sets | 规则集 | name, scope, enabled |
| rules | 规则 | event_type, conditions, action, cooldown_sec |
| rule_match_logs | 规则命中日志 | rule_id, order_id, event_type, suppressed |

完整字段定义以当前 Alembic revision 为准。

## API 清单（摘要）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | /api/v1/auth/register | 注册 | 否 |
| POST | /api/v1/auth/login | 登录 | 否 |
| GET | /api/v1/me | 当前用户 | 是 |
| POST | /api/v1/me/push-subscriptions | 订阅推送 | 是 |
| GET | /api/v1/orders | 订单列表 | 是 |
| GET | /api/v1/orders/{orderId} | 订单详情 | 是 |
| GET | /api/v1/orders/{orderId}/timeline | 订单时间线 | 是 |
| POST | /api/v1/orders/manual-import | 手动导入订单 | 是 |
| POST | /api/v1/orders/{orderId}/arm | 启动监控 | 是 |
| POST | /api/v1/orders/{orderId}/confirm-pickup | 确认取餐 | 是 |
| GET | /api/v1/orders/export/csv | 导出订单 CSV | 是 |
| GET | /api/v1/alerts | 告警列表 | 是 |
| GET | /api/v1/alerts/{incidentId} | 告警详情 | 是 |
| POST | /api/v1/alerts/{incidentId}/ack | 告警确认 | 是 |
| POST | /api/v1/alerts/{incidentId}/resolve | 告警结案 | 是 |
| POST | /api/v1/alerts/{incidentId}/false-positive | 误报标记 | 是 |
| GET | /api/v1/alerts/export/csv | 导出告警 CSV | 是 |
| GET | /api/v1/devices | 设备列表 | 是 |
| POST | /api/v1/devices/register | 注册设备 | 是 |
| GET | /api/v1/devices/{deviceId} | 设备详情 | 是 |
| PATCH | /api/v1/devices/{deviceId} | 更新设备 | 是 |
| PATCH | /api/v1/devices/{deviceId}/config | 更新配置 | 是 |
| POST | /api/v1/devices/{deviceId}/apply-preset | 应用策略 | 是 |
| GET | /api/v1/devices/{deviceId}/health | 设备健康 | 是 |
| GET | /api/v1/evidence/{incidentId} | 取证信息 | 是 |
| POST | /api/v1/evidence/{incidentId}/generate | 生成取证包 | 是 |
| GET | /api/v1/evidence/{incidentId}/download | 下载取证包 | 是 |
| POST | /api/v1/media/upload | 上传媒体 | 设备 |
| GET | /api/v1/media | 媒体列表 | 是 |
| GET | /api/v1/media/{mediaId}/download | 下载媒体 | 是 |
| GET | /api/v1/whitelist | 白名单列表 | 是 |
| POST | /api/v1/whitelist | 新增白名单 | 是 |
| POST | /api/v1/whitelist/{profileId}/issue-code | 生成取餐码 | 是 |
| POST | /api/v1/whitelist/verify-code | 校验取餐码 | 否 |
| POST | /api/v1/edge/sessions/{sessionId}/events | 上报事件 | 设备 |
| GET | /api/v1/edge/devices/{deviceId}/config | 拉取设备配置 | 设备 |
| GET | /api/v1/audit | 审计日志 | 是 |
| GET | /api/v1/audit/export/csv | 导出审计 CSV | 是 |
| GET | /api/v1/config | 公共配置 | 是 |
| GET | /api/v1/reports/summary | 报表摘要 | 是 |
| GET | /api/v1/reports/trends | 报表趋势（日/周） | 是 |
| GET | /api/v1/reports/summary/export | 导出报表摘要 CSV | 是 |
| GET | /api/v1/reports/trends/export | 导出报表趋势 CSV | 是 |
| GET | /api/v1/reports/rule-matches/export | 导出规则命中 CSV | 是 |
| POST | /api/v1/rules/sets | 创建规则集 | 是 |
| GET | /api/v1/rules/sets | 规则集列表 | 是 |
| PATCH | /api/v1/rules/sets/{setId} | 更新规则集 | 是 |
| POST | /api/v1/rules/sets/{setId}/rules | 创建规则 | 是 |
| GET | /api/v1/rules/sets/{setId}/rules | 规则列表 | 是 |
| PATCH | /api/v1/rules/rules/{ruleId} | 更新规则 | 是 |
| DELETE | /api/v1/rules/rules/{ruleId} | 删除规则 | 是 |
| GET | /api/v1/rules/matches | 规则命中日志 | 是 |
| POST | /api/v1/integrations/mock/delivered/{orderId} | 模拟送达 | 是 |
| POST | /api/v1/integrations/providers/{provider}/order-status | 平台回调 | 否 |

完整接口定义见 `docs/openapi.yaml`。

## 规则范围与优先级

- 普通用户可查看全局规则集，但无法编辑。
- 生效规则集：用户规则集和全局规则集共同生效。
- 优先级：`priority` 升序；在相同 `priority` 下，用户规则优先于全局规则。
