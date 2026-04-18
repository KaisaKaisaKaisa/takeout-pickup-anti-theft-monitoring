# Provider Webhook Hardening Design

## Summary
Harden the existing provider webhook endpoint with strict signature checks, replay protection, idempotency, and clearer error handling, while keeping a single shared secret and current API surface.

## Goals
- Strengthen verification: signature + timestamp window.
- Prevent replay: nonce + idempotency.
- Keep behavior compatible for existing provider integration.
- Add minimal tests for core security paths.

## Non-goals
- No multi-provider secrets or signature variants.
- No new webhook event storage table.
- No changes to routing or response schema beyond clarity.

## Endpoints
- `/providers/{provider}/order-status` (unchanged)

## Verification Flow
1. Check `provider_webhook_secret` exists.
2. Validate timestamp format and window.
3. Verify signature: `HMAC_SHA256(secret, f"{timestamp}.{body}")`.
4. Parse JSON.
5. Check nonce (if provided): `check_and_store_nonce`.
6. Check idempotency: `check_and_store_idempotency`; return `{ok: true, duplicate: true}` if replay.
7. Normalize status and map: unknown -> 400.

## Processing Flow
- Load order by `order_id`, else `provider_order_id`.
- If no order but `user_phone` found, create order for user.
- Apply status via `apply_order_status` (valid transitions only).
- Write audit entry `order.webhook` if user known.
- Invalidate report caches for target user.
- Broadcast `order.webhook` via WS.

## Error Handling
- 401 for missing/invalid signature or expired timestamp.
- 409 for nonce replay.
- 400 for invalid JSON or unknown status.
- 404 if neither order nor user is found.

## Tests
Add unit tests covering:
1. Signature mismatch -> 401
2. Timestamp expired -> 401
3. Nonce replay -> 409
4. Idempotency duplicate -> `{ok: true, duplicate: true}`
5. Unknown status -> 400

