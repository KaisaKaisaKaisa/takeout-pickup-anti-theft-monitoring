from datetime import datetime, timedelta, timezone
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Order, OrderStatusEvent, MonitoringSession, AlertIncident, EdgeDevice
from app.services.session_service import find_active_session, create_session_for_order, resolve_pickup_deadline

KNOWN_ORDER_STATUSES = {"created", "delivered", "picked_up"}
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "created": {"created", "delivered", "picked_up"},
    "delivered": {"delivered", "picked_up"},
    "picked_up": {"picked_up"},
}

class InvalidStatusTransition(ValueError):
    pass

def _validate_transition(prev_status: str | None, to_status: str) -> None:
    if to_status not in KNOWN_ORDER_STATUSES:
        raise InvalidStatusTransition(f"Unknown status: {to_status}")
    if prev_status is None:
        return
    if prev_status not in ALLOWED_TRANSITIONS:
        raise InvalidStatusTransition(f"Unknown previous status: {prev_status}")
    if to_status not in ALLOWED_TRANSITIONS[prev_status]:
        raise InvalidStatusTransition(f"Invalid transition: {prev_status} -> {to_status}")

async def apply_order_status(
    db: AsyncSession,
    order: Order,
    to_status: str,
    source: str,
    raw_payload: dict | None = None,
) -> OrderStatusEvent | None:
    prev_status = order.status
    _validate_transition(prev_status, to_status)
    if order.status == to_status:
        order.updated_at = datetime.now(timezone.utc)
    else:
        order.status = to_status
        order.updated_at = datetime.now(timezone.utc)

    if to_status == "delivered" and order.delivered_at is None:
        order.delivered_at = datetime.now(timezone.utc)
        if order.expected_pickup_by is None:
            await resolve_pickup_deadline(db, order, fallback_minutes=30)

    if to_status == "picked_up":
        sessions = (
            await db.execute(select(MonitoringSession).where(MonitoringSession.order_id == order.id))
        ).scalars().all()
        for session in sessions:
            session.state = "confirmed"
        alerts = (
            await db.execute(
                select(AlertIncident)
                .where(AlertIncident.order_id == order.id)
                .where(AlertIncident.status == "open")
            )
        ).scalars().all()
        for alert in alerts:
            alert.status = "resolved"
        order.latest_session_id = None
    elif to_status == "delivered":
        # Only arm if monitoring is enabled and no active session yet.
        if order.monitoring_enabled:
            # avoid duplicates if an active session already exists
            active = await find_active_session(db, order.id)
            if active:
                order.latest_session_id = active.id
            else:
                device = (
                    await db.execute(
                        select(EdgeDevice)
                        .where(EdgeDevice.owner_user_id == order.user_id)
                        .order_by(EdgeDevice.created_at.desc())
                    )
                ).scalar_one_or_none()
                if not device:
                    device = EdgeDevice(
                        id=uuid.uuid4(),
                        owner_user_id=order.user_id,
                        device_code=f"auto-{order.user_id.hex[:6]}",
                        name="Auto Device",
                        device_type="auto",
                        status="online",
                        config_json={},
                    )
                    db.add(device)
                    await db.flush()
                await create_session_for_order(db, order, device)

    if prev_status != to_status:
        evt = OrderStatusEvent(
            order_id=order.id,
            source=source,
            from_status=prev_status,
            to_status=to_status,
            raw_payload=raw_payload or {},
            event_time=datetime.now(timezone.utc),
        )
        db.add(evt)
        return evt
    return None
