from __future__ import annotations

from datetime import datetime, timezone, timedelta
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import MonitoringSession, Order, EdgeDevice, User
from app.services.config_service import build_device_config

ACTIVE_SESSION_STATES = {"armed", "alerted", "present"}

async def find_active_session(db: AsyncSession, order_id) -> MonitoringSession | None:
    return (
        await db.execute(
            select(MonitoringSession)
            .where(MonitoringSession.order_id == order_id)
            .where(MonitoringSession.state.in_(list(ACTIVE_SESSION_STATES)))
            .order_by(MonitoringSession.created_at.desc())
        )
    ).scalar_one_or_none()

async def find_latest_session(db: AsyncSession, order_id) -> MonitoringSession | None:
    return (
        await db.execute(
            select(MonitoringSession)
            .where(MonitoringSession.order_id == order_id)
            .order_by(MonitoringSession.created_at.desc())
        )
    ).scalar_one_or_none()

async def resolve_pickup_deadline(
    db: AsyncSession,
    order: Order,
    fallback_minutes: int = 30,
) -> datetime:
    if order.expected_pickup_by is not None:
        return order.expected_pickup_by
    minutes = fallback_minutes
    user = (
        await db.execute(select(User).where(User.id == order.user_id))
    ).scalar_one_or_none()
    if user and user.default_pickup_window_min:
        minutes = int(user.default_pickup_window_min)
    base = order.delivered_at or datetime.now(timezone.utc)
    order.expected_pickup_by = base + timedelta(minutes=minutes)
    return order.expected_pickup_by

async def create_confirmed_session(
    db: AsyncSession,
    order: Order,
    device: EdgeDevice,
    confirmed_at: datetime | None = None,
) -> MonitoringSession:
    ts = confirmed_at or datetime.now(timezone.utc)
    session = MonitoringSession(
        id=uuid.uuid4(),
        order_id=order.id,
        edge_device_id=device.id,
        state="confirmed",
        pickup_deadline_at=ts,
        sensitivity_config={},
    )
    db.add(session)
    return session

async def create_session_for_order(
    db: AsyncSession,
    order: Order,
    device: EdgeDevice,
    pickup_deadline: datetime | None = None,
    fallback_minutes: int = 30,
) -> MonitoringSession:
    if pickup_deadline is None:
        pickup_deadline = order.expected_pickup_by
    if pickup_deadline is None:
        pickup_deadline = await resolve_pickup_deadline(db, order, fallback_minutes=fallback_minutes)
    if order.expected_pickup_by is None:
        order.expected_pickup_by = pickup_deadline
    device_config = build_device_config(device)
    session = MonitoringSession(
        id=uuid.uuid4(),
        order_id=order.id,
        edge_device_id=device.id,
        state="armed",
        pickup_deadline_at=pickup_deadline,
        sensitivity_config=device_config.get("sensitivity", {}),
    )
    db.add(session)
    order.latest_session_id = session.id
    return session
