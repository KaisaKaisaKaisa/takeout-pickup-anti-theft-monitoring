import json
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.entities import NotificationLog, PushSubscription

try:
    from pywebpush import webpush
except Exception:
    webpush = None

async def log_push(db: AsyncSession, user_id: uuid.UUID, title: str, status: str, response: dict | None = None) -> None:
    log = NotificationLog(
        user_id=user_id,
        incident_id=None,
        channel="push",
        title=title,
        status=status,
        provider_response=response or {},
    )
    db.add(log)

async def send_alert_push(db: AsyncSession, user_id: uuid.UUID, title: str, body: str | None = None) -> None:
    subs = (
        await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    ).scalars().all()
    if not subs:
        return

    # If VAPID or pywebpush not configured, only log.
    if webpush is None or not settings.vapid_private_key or not settings.vapid_public_key:
        for _sub in subs:
            await log_push(db, user_id, title, "queued")
        return

    for sub in subs:
        if not sub.endpoint or not sub.p256dh or not sub.auth:
            await log_push(db, user_id, title, "invalid_subscription")
            continue
        payload = json.dumps({"title": title, "body": body or title})
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_email},
            )
            await log_push(db, user_id, title, "sent")
        except Exception as exc:
            await log_push(db, user_id, title, "failed", {"error": str(exc)})
