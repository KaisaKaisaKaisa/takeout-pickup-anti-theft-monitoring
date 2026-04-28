# Deployment

## Local
1. `cd infra/compose`
2. `docker compose up`
3. The API container runs Alembic with `alembic upgrade head` before starting.

## Database Migrations
- Alembic is the only supported migration path.
- The migration source of truth is `apps/api/migrations`.
- Local non-compose setup can run `python scripts/init_db.py`, which delegates to `cd apps/api && alembic upgrade head`.
- `docs/schema.sql` is a historical schema snapshot for reading only; do not use it to initialize or modify a database.

## Production (single VM)
- Run Postgres and Redis as managed services or containers.
- Run S3-compatible object storage for evidence/media. Local development uses MinIO from compose.
- Set environment variables from `.env.example`.
- Run Alembic migrations with `cd apps/api && alembic upgrade head`.
- Run API with `RUN_BACKGROUND_TASKS=false uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Run exactly one worker with `RUN_BACKGROUND_TASKS=true python -m app.worker`.
- Serve PWA via any static server (nginx).

## Runtime Boundaries
- API processes handle HTTP and WebSocket traffic only.
- Worker processes own timeout checks, cleanup, and device-offline loops.
- `RUN_BACKGROUND_TASKS` defaults to `false`; enable it only for the worker process.
- Redis is accessed through `redis.asyncio`. If Redis is unavailable, the service falls back to in-memory cache and `/readyz` reports a degraded optional cache component.
- Media and evidence artifacts use `OBJECT_STORE`. `local` writes under `LOCAL_MEDIA_ROOT`; `minio` and `s3` use the S3 API and return short-lived signed download URLs for protected objects.

## Edge Device Authentication
- Legacy devices may still send `X-Device-Code`.
- New devices should sign requests with `X-Device-Timestamp`, `X-Device-Nonce`, and `X-Device-Signature`.
- Signature payload is `HMAC-SHA256(device_code, timestamp + "." + nonce + "." + canonical_body)`.
- Set `REQUIRE_DEVICE_HMAC=true` in production after all edge agents support signed requests.

## Env Vars
- `DB_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`
- `LOCAL_MEDIA_ROOT`
- `OBJECT_STORE`
- `OBJECT_STORE_BUCKET`
- `OBJECT_STORE_ENDPOINT_URL`
- `OBJECT_STORE_ACCESS_KEY`
- `OBJECT_STORE_SECRET_KEY`
- `OBJECT_STORE_REGION`
- `OBJECT_STORE_PRESIGN_TTL_SEC`
- `PROVIDER_WEBHOOK_SECRET`
- `PROVIDER_WEBHOOK_SECRETS`
- `PROVIDER_WEBHOOK_TTL_SEC`
- `REQUIRE_DEVICE_HMAC`
- `DEVICE_SIGNATURE_TTL_SEC`
- `RUN_BACKGROUND_TASKS`
