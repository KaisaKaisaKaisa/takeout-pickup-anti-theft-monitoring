# Provider Webhook 多密钥验签设计

## 概述
在保持现有回调流程不变的前提下，支持按 `provider` 配置独立密钥，同时保留全局密钥作为兜底。验签算法继续使用 `HMAC_SHA256(secret, f"{timestamp}.{body}")`。

## 目标
- 支持 `PROVIDER_WEBHOOK_SECRETS`（JSON 字符串）作为 provider -> secret 映射。
- 未配置映射时回退到 `PROVIDER_WEBHOOK_SECRET`。
- 沿用现有签名、时间窗、nonce、幂等等安全流程。

## 非目标
- 不引入平台专用签名算法或 SDK。
- 不改变回调 API 的路径、请求体或响应结构。

## 配置
- `PROVIDER_WEBHOOK_SECRETS`：JSON 字符串，例如 `{"meituan":"xxx","eleme":"yyy"}`。
- `PROVIDER_WEBHOOK_SECRET`：全局密钥（兜底）。

## 验签流程
1. 解析 provider 专用密钥；若不存在则使用全局密钥。
2. 若两者都为空，返回 503（Webhook not configured）。
3. 校验 timestamp 格式与时间窗。
4. 验签：`HMAC_SHA256(secret, f"{timestamp}.{body}")`。
5. 继续执行 nonce / 幂等 / 订单状态处理逻辑。

## 错误处理
- 缺失或非法签名头：401。
- 过期 timestamp：401。
- 签名不匹配：401。
- 没有任何密钥配置：503。

## 测试
- provider 专用密钥优先于全局密钥。
- 无专用密钥时回落到全局密钥。
- 没有任何密钥时返回 `None`（供路由判断 503）。
