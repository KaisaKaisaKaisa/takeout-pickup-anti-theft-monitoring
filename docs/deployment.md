# Deployment

## Local
1. `cd infra/compose`
2. `docker compose up`
3. `python scripts/init_db.py`

## Production (single VM)
- Run Postgres and Redis as managed services or containers.
- Set environment variables from `.env.example`.
- Run API with `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Serve PWA via any static server (nginx).

## Env Vars
- `DB_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`
- `LOCAL_MEDIA_ROOT`
