from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.models.entities import Order
from app.schemas.schemas import OrderCreate
from app.services.audit_service import log_action
from app.services.device_service import get_or_create_dev_device
from app.services.order_state import InvalidStatusTransition, apply_order_status
from app.services.session_service import (
    create_session_for_order,
    find_active_session,
    resolve_pickup_deadline,
)
from app.services.ws_payloads import build_event_payload, build_order_payload


class OrderApplicationError(Exception):
    pass


class OrderNotFoundError(OrderApplicationError):
    pass


class OrderForbiddenError(OrderApplicationError):
    pass


class OrderTransitionError(OrderApplicationError):
    pass


@dataclass(frozen=True)
class ArmOrderResult:
    session_id: str
    deduped: bool = False


async def _get_user_order(db: AsyncSession, order_id: str, user_id) -> Order:
    result = await db.execute(select(Order).where(Order.id == uuid.UUID(order_id)))
    order = result.scalar_one_or_none()
    if not order:
        raise OrderNotFoundError("Order not found")
    if order.user_id != user_id:
        raise OrderForbiddenError("Forbidden")
    return order


async def _emit_order_event(order: Order, event_name: str, extra: dict | None = None) -> None:
    order_payload = build_order_payload(order)
    payload = {
        "order_id": str(order.id),
        "order": order_payload,
        **build_event_payload("order", order_payload),
    }
    if extra:
        payload.update(extra)
    await ws_hub.broadcast_event(event_name, payload)


async def manual_import(db: AsyncSession, user_id, payload: OrderCreate) -> Order:
    expected_pickup_by = None
    if payload.expected_pickup_minutes and payload.expected_pickup_minutes > 0:
        expected_pickup_by = datetime.now(timezone.utc) + timedelta(minutes=payload.expected_pickup_minutes)
    order = Order(
        id=uuid.uuid4(),
        user_id=user_id,
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
        raise OrderTransitionError(str(exc)) from exc
    await log_action(db, user_id, "order.created", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user_id)
    await _emit_order_event(order, "order.created")
    return order


async def confirm_pickup(db: AsyncSession, user_id, order_id: str) -> bool:
    order = await _get_user_order(db, order_id, user_id)
    if order.status == "picked_up":
        await _emit_order_event(order, "order.picked_up")
        return True
    try:
        await apply_order_status(db, order, "picked_up", source="user", raw_payload={})
    except InvalidStatusTransition as exc:
        raise OrderTransitionError(str(exc)) from exc
    order.updated_at = datetime.now(timezone.utc)
    await log_action(db, user_id, "order.picked_up", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user_id)
    await _emit_order_event(order, "order.picked_up")
    return True


async def arm_order(db: AsyncSession, user_id, order_id: str) -> ArmOrderResult:
    order = await _get_user_order(db, order_id, user_id)
    active_session = await find_active_session(db, order.id)
    if active_session:
        order.latest_session_id = active_session.id
        await db.commit()
        await _emit_order_event(
            order,
            "order.armed",
            {"session_id": str(active_session.id), "deduped": True},
        )
        return ArmOrderResult(session_id=str(active_session.id), deduped=True)
    device = await get_or_create_dev_device(db, user_id)
    await resolve_pickup_deadline(db, order, fallback_minutes=30)
    session = await create_session_for_order(db, order, device)
    await log_action(db, user_id, "order.armed", "order", str(order.id))
    await db.commit()
    invalidate_report_caches(user_id)
    await _emit_order_event(
        order,
        "order.armed",
        {"session_id": str(session.id), "deduped": False},
    )
    return ArmOrderResult(session_id=str(session.id), deduped=False)
