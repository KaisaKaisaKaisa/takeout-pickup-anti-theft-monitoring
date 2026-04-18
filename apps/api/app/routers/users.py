import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user, is_admin_user
from app.models.entities import PushSubscription
from app.schemas.schemas import PushSubscriptionIn

router = APIRouter()

@router.post("/me/push-subscriptions")
async def add_push_subscription(
    payload: PushSubscriptionIn,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    sub = PushSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        platform=payload.platform,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        device_fingerprint=payload.device_fingerprint,
        enabled=True,
    )
    db.add(sub)
    await db.commit()
    return {"id": str(sub.id)}

@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "id": str(user.id),
        "phone": user.phone,
        "name": user.name,
        "is_admin": is_admin_user(user),
    }
