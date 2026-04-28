import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.entities import Order
from app.schemas.schemas import OrderCreate, OrderOut, OrderListOut
try:
    from app.schemas.schemas import ErrorOut, OkOut, OrderArmOut
except ImportError:
    ErrorOut = dict
    OkOut = dict
    OrderArmOut = dict
from app.core.security import get_current_user
from app.services import order_application
from app.services.order_application import (
    OrderForbiddenError,
    OrderNotFoundError,
    OrderTransitionError,
)
from app.services.report_service import export_orders_csv
from fastapi.responses import Response

router = APIRouter()
ERROR_RESPONSES = {
    400: {"model": ErrorOut},
    403: {"model": ErrorOut},
    404: {"model": ErrorOut},
}
CSV_RESPONSE = {
    200: {
        "description": "CSV download",
        "content": {"text/csv": {"schema": {"type": "string"}}},
    }
}

@router.post("/manual-import", response_model=OrderOut)
async def manual_import(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        order = await order_application.manual_import(db, user.id, payload)
    except OrderTransitionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
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

@router.get("/{order_id}", response_model=OrderOut, responses=ERROR_RESPONSES)
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

@router.get("/export/csv", response_class=Response, responses=CSV_RESPONSE)
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

@router.post("/{order_id}/confirm-pickup", response_model=OkOut)
async def confirm_pickup(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        await order_application.confirm_pickup(db, user.id, order_id)
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail="Order not found")
    except OrderForbiddenError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except OrderTransitionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}

@router.post("/{order_id}/arm", response_model=OrderArmOut)
async def arm_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        result = await order_application.arm_order(db, user.id, order_id)
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail="Order not found")
    except OrderForbiddenError:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"session_id": result.session_id, "deduped": result.deduped}
