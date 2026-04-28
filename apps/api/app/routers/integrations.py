import uuid
import hmac
import hashlib
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.entities import Order, User
from app.services.order_state import apply_order_status, InvalidStatusTransition
from app.services.audit_service import log_action
from app.core.cache_invalidation import invalidate_report_caches
from app.services.ws_payloads import build_event_payload, build_order_payload
from app.services.webhook_security import (
    normalize_status,
    build_idempotency_key,
    acheck_and_store_nonce,
    acheck_and_store_idempotency,
    get_provider_secret,
)

router = APIRouter()

STATUS_MAP = {
    "delivered": "delivered",
    "arrived": "delivered",
    "picked_up": "picked_up",
    "pickedup": "picked_up",
    "completed": "picked_up",
}

def verify_signature(secret: str, body: bytes, timestamp: str, signature: str) -> bool:
    try:
        expected = hmac.new(
            secret.encode("utf-8"),
            msg=(f"{timestamp}.".encode("utf-8") + body),
            digestmod=hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False

@router.post("/mock/delivered/{order_id}")
async def mock_delivered(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Order).where(Order.id == uuid.UUID(order_id)))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        await apply_order_status(db, order, "delivered", source="mock", raw_payload={})
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    invalidate_report_caches(user.id)
    return {"ok": True, "status": order.status}

@router.post("/providers/{provider}/order-status")
async def provider_order_status(
    provider: str,
    request: Request,
    x_provider_timestamp: str | None = Header(default=None),
    x_provider_signature: str | None = Header(default=None),
    x_provider_nonce: str | None = Header(default=None),
    x_provider_event_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    secret = get_provider_secret(provider)
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    if not x_provider_timestamp or not x_provider_signature:
        raise HTTPException(status_code=401, detail="Missing signature headers")
    try:
        ts = int(x_provider_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp")
    now = int(datetime.now(timezone.utc).timestamp())
    if abs(now - ts) > settings.provider_webhook_ttl_sec:
        raise HTTPException(status_code=401, detail="Expired signature")

    body = await request.body()
    if not verify_signature(secret, body, x_provider_timestamp, x_provider_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    order_id = payload.get("order_id")
    provider_order_id = payload.get("provider_order_id")
    status_raw = payload.get("status")
    status = normalize_status(status_raw) or STATUS_MAP.get((status_raw or "").lower())
    if not status:
        raise HTTPException(status_code=400, detail="Unknown status")
    payload["status"] = status

    if x_provider_nonce:
        ok = await acheck_and_store_nonce(provider, x_provider_nonce, settings.provider_webhook_ttl_sec)
        if not ok:
            raise HTTPException(status_code=409, detail="Nonce replay")

    idem_key = build_idempotency_key(
        provider,
        payload,
        event_id=x_provider_event_id,
        raw_body=body,
    )
    if not await acheck_and_store_idempotency(idem_key, settings.provider_webhook_ttl_sec):
        return {"ok": True, "duplicate": True}

    order = None
    if order_id:
        try:
            order_uuid = uuid.UUID(order_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid order_id")
        order = (
            await db.execute(select(Order).where(Order.id == order_uuid))
        ).scalar_one_or_none()
    if not order and provider_order_id:
        order = (
            await db.execute(
                select(Order).where(Order.provider == provider).where(Order.provider_order_id == provider_order_id)
            )
        ).scalar_one_or_none()

    user = None
    user_phone = payload.get("user_phone")
    if user_phone:
        user = (
            await db.execute(select(User).where(User.phone == str(user_phone)))
        ).scalar_one_or_none()

    if not order and not user:
        raise HTTPException(status_code=404, detail="Order or user not found")

    if not order:
        order = Order(
            id=uuid.uuid4(),
            user_id=user.id,
            provider=provider,
            provider_order_id=provider_order_id,
            merchant_name=payload.get("merchant_name"),
            item_summary=payload.get("item_summary"),
            status="created",
        )
        db.add(order)
    else:
        if payload.get("merchant_name"):
            order.merchant_name = payload.get("merchant_name")
        if payload.get("item_summary"):
            order.item_summary = payload.get("item_summary")

    try:
        await apply_order_status(db, order, status, source=provider, raw_payload=payload)
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if user:
        await log_action(db, user.id, "order.webhook", "order", str(order.id))
    await db.commit()
    target_user_id = user.id if user else order.user_id
    invalidate_report_caches(target_user_id)
    from app.core import ws as ws_hub
    order_payload = build_order_payload(order)
    await ws_hub.broadcast_event(
        "order.webhook",
        {
            "order_id": str(order.id),
            "status": order.status,
            "order": order_payload,
            **build_event_payload("order", order_payload),
        },
    )
    return {"ok": True, "order_id": str(order.id), "status": order.status}
