# Provider Webhook Signature and Idempotency

## Endpoint

`POST /api/v1/integrations/providers/{provider}/order-status`

Example: `/api/v1/integrations/providers/meituan/order-status`

## Headers

- `X-Provider-Timestamp`: Unix timestamp (seconds)
- `X-Provider-Signature`: `hex(HMAC_SHA256(secret, "{timestamp}.{raw_body}"))`
- `X-Provider-Nonce` (optional): Random nonce for replay protection
- `X-Provider-Event-Id` (optional): Unique event id for idempotency

Server validation:
1. `PROVIDER_WEBHOOK_SECRET` must be configured
2. `timestamp` must be within `PROVIDER_WEBHOOK_TTL_SEC`
3. Signature must match (use raw body)
4. If `X-Provider-Nonce` is provided, it cannot be reused within TTL
5. If the event is duplicate, server returns `{ "ok": true, "duplicate": true }`

## Request Body

```json
{
  "order_id": "uuid-optional",
  "provider_order_id": "string-optional",
  "status": "delivered|picked_up|completed|arrived|...",
  "event_time": "2026-03-15T10:00:00Z",
  "user_phone": "string-optional",
  "merchant_name": "string-optional",
  "item_summary": "string-optional"
}
```

Status mapping:
- `delivered` / `arrived` -> `delivered`
- `picked_up` / `pickedup` / `completed` -> `picked_up`

## Response

```json
{ "ok": true, "order_id": "<uuid>", "status": "delivered" }
```

Duplicate event response:

```json
{ "ok": true, "duplicate": true }
```

## Python Signature Example (Provider Side)

```python
import hmac
import hashlib
import json
import time
import requests

secret = "YOUR_SECRET"
timestamp = str(int(time.time()))
payload = {
    "provider_order_id": "mt-123456",
    "status": "delivered",
    "event_time": "2026-03-15T10:00:00Z",
    "user_phone": "demo-user",
    "merchant_name": "Coffee Lab",
    "item_summary": "Latte + pastry",
}
body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
sig = hmac.new(
    secret.encode("utf-8"),
    msg=(timestamp.encode("utf-8") + b"." + body),
    digestmod=hashlib.sha256,
).hexdigest()

resp = requests.post(
    "http://localhost:18000/api/v1/integrations/providers/meituan/order-status",
    headers={
        "X-Provider-Timestamp": timestamp,
        "X-Provider-Signature": sig,
        "X-Provider-Nonce": "nonce-123",
        "X-Provider-Event-Id": "evt-123",
        "Content-Type": "application/json",
    },
    data=body,
    timeout=5,
)
print(resp.status_code, resp.text)
```

## Node.js Signature Example (Provider Side)

```javascript
import crypto from "crypto";
import fetch from "node-fetch";

const secret = "YOUR_SECRET";
const timestamp = Math.floor(Date.now() / 1000).toString();
const payload = {
  provider_order_id: "mt-123456",
  status: "delivered",
  event_time: "2026-03-15T10:00:00Z",
  user_phone: "demo-user",
  merchant_name: "Coffee Lab",
  item_summary: "Latte + pastry",
};
const body = JSON.stringify(payload);
const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const resp = await fetch("http://localhost:18000/api/v1/integrations/providers/meituan/order-status", {
  method: "POST",
  headers: {
    "X-Provider-Timestamp": timestamp,
    "X-Provider-Signature": sig,
    "X-Provider-Nonce": "nonce-123",
    "X-Provider-Event-Id": "evt-123",
    "Content-Type": "application/json",
  },
  body,
});
console.log(resp.status, await resp.text());
```
