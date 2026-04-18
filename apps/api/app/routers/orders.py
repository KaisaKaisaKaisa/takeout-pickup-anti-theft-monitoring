import uuid
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.entities import Order
from app.schemas.schemas import OrderCreate, OrderOut, OrderListOut
from app.core.security import get_current_user
from app.services.device_service import get_or_create_dev_device
from app.services.session_service import find_active_session, create_session_for_order, resolve_pickup_deadline
from app.services.order_state import apply_order_status, InvalidStatusTransition
from app.services.ws_payloads import build_event_payload, build_order_payload
from app.services.report_service import export_orders_csv
from app.services.audit_service import log_action
from app.core.cache_invalidation import invalidate_report_caches
from fastapi.responses import Response

router = APIRouter()

@router.post("/manual-import", response_model=OrderOut)
async def manual_import(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    expected_pickup_by = None
    if payload.expected_pickup_minutes and payload.expected_pickup_minutes > 0:
        expected_pickup_by = datetime.now(timezone.utc) + timedelta(minutes=payload.expected_pickup_minutes)
    order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        provider=payload.provider,
        provider_order_id=payload.provider_order_id,
        merchant_name=payload.merchant_name,
        item_summary=payload.item_summary,
        status="created",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        expected_pickup_by=expected_pickup_by,
    )
    db.add(order)
    try:
        await apply_order_status(db, order, "created", source="manual", raw_payload={})
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await log_action(db, user.id, "order.created", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    order_payload = build_order_payload(order)
    await ws_hub.broadcast_event(
        "order.created",
        {
            "order_id": str(order.id),
            "order": order_payload,
            **build_event_payload("order", order_payload),
        },
    )
    return OrderOut(
        id=str(order.id),
        provider=order.provider,
        status=order.status,
        merchant_name=order.merchant_name,
        item_summary=order.item_summary,
        delivered_at=order.delivered_at,
        expected_pickup_by=order.expected_pickup_by,
        latest_session_id=str(order.latest_session_id) if order.latest_session_id else None,
    )

@router.get("", response_model=OrderListOut)
async def list_orders(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    orders = result.scalars().all()
    return OrderListOut(
        orders=[
            OrderOut(
                id=str(o.id),
                provider=o.provider,
                status=o.status,
                merchant_name=o.merchant_name,
                item_summary=o.item_summary,
                delivered_at=o.delivered_at,
                expected_pickup_by=o.expected_pickup_by,
                latest_session_id=str(o.latest_session_id) if o.latest_session_id else None,
            )
            for o in orders
        ]
    )

@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
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
    return OrderOut(
        id=str(order.id),
        provider=order.provider,
        status=order.status,
        merchant_name=order.merchant_name,
        item_summary=order.item_summary,
        delivered_at=order.delivered_at,
        expected_pickup_by=order.expected_pickup_by,
        latest_session_id=str(order.latest_session_id) if order.latest_session_id else None,
    )

@router.get("/{order_id}/timeline")
async def order_timeline(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.models.entities import OrderStatusEvent
    order_result = await db.execute(select(Order).where(Order.id == uuid.UUID(order_id)))
    order = order_result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    result = await db.execute(
        select(OrderStatusEvent)
        .where(OrderStatusEvent.order_id == uuid.UUID(order_id))
        .order_by(OrderStatusEvent.event_time.desc())
    )
    events = result.scalars().all()
    return [
        {
            "from": e.from_status,
            "to": e.to_status,
            "source": e.source,
            "event_time": e.event_time,
        }
        for e in events
    ]

@router.get("/export/csv")
async def export_orders(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    data = await export_orders_csv(db, user.id)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )

@router.post("/{order_id}/confirm-pickup")
async def confirm_pickup(
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
    if order.status == "picked_up":
        from app.core import ws as ws_hub
        order_payload = build_order_payload(order)
        await ws_hub.broadcast_event(
            "order.picked_up",
            {
                "order_id": str(order.id),
                "order": order_payload,
                **build_event_payload("order", order_payload),
            },
        )
        return {"ok": True}
    try:
        await apply_order_status(db, order, "picked_up", source="user", raw_payload={})
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    order.updated_at = datetime.now(timezone.utc)
    await log_action(db, user.id, "order.picked_up", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    order_payload = build_order_payload(order)
    await ws_hub.broadcast_event(
        "order.picked_up",
        {
            "order_id": str(order.id),
            "order": order_payload,
            **build_event_payload("order", order_payload),
        },
    )
    return {"ok": True}

@router.post("/{order_id}/arm")
async def arm_order(
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
    active_session = await find_active_session(db, order.id)
    if active_session:
        order.latest_session_id = active_session.id
        await db.commit()
        from app.core import ws as ws_hub
        order_payload = build_order_payload(order)
        await ws_hub.broadcast_event(
            "order.armed",
            {
                "order_id": str(order.id),
                "session_id": str(active_session.id),
                "deduped": True,
                "order": order_payload,
                **build_event_payload("order", order_payload),
            },
        )
        return {"session_id": str(active_session.id), "deduped": True}
    device = await get_or_create_dev_device(db, user.id)
    await resolve_pickup_deadline(db, order, fallback_minutes=30)
    session = await create_session_for_order(db, order, device)
    await log_action(db, user.id, "order.armed", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    order_payload = build_order_payload(order)
    await ws_hub.broadcast_event(
        "order.armed",
        {
            "order_id": str(order.id),
            "session_id": str(session.id),
            "deduped": False,
            "order": order_payload,
            **build_event_payload("order", order_payload),
        },
    )
    return {"session_id": str(session.id)}
