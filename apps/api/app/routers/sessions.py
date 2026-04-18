import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import MonitoringSession, Order, SensorEvent, EdgeDevice
from app.schemas.schemas import SessionOut, SessionListOut, SensorEventOut, SensorEventListOut

router = APIRouter()

@router.get("", response_model=SessionListOut)
async def list_sessions(
    order_id: str | None = None,
    device_id: str | None = None,
    state: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    query = (
        select(MonitoringSession)
        .join(Order, MonitoringSession.order_id == Order.id)
        .where(Order.user_id == user.id)
        .order_by(MonitoringSession.created_at.desc())
        .limit(limit)
    )
    if order_id:
        query = query.where(MonitoringSession.order_id == uuid.UUID(order_id))
    if device_id:
        query = query.where(MonitoringSession.edge_device_id == uuid.UUID(device_id))
    if state:
        query = query.where(MonitoringSession.state == state)

    result = await db.execute(query)
    sessions = result.scalars().all()
    return SessionListOut(
        sessions=[
            SessionOut(
                id=str(s.id),
                order_id=str(s.order_id),
                device_id=str(s.edge_device_id),
                state=s.state,
                armed_at=s.armed_at,
                pickup_deadline_at=s.pickup_deadline_at,
                presence_status=s.presence_status,
                sensitivity_config=s.sensitivity_config or {},
                false_alarm_count=s.false_alarm_count,
            )
            for s in sessions
        ]
    )

@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    session = (
        await db.execute(select(MonitoringSession).where(MonitoringSession.id == uuid.UUID(session_id)))
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    order = (
        await db.execute(select(Order).where(Order.id == session.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return SessionOut(
        id=str(session.id),
        order_id=str(session.order_id),
        device_id=str(session.edge_device_id),
        state=session.state,
        armed_at=session.armed_at,
        pickup_deadline_at=session.pickup_deadline_at,
        presence_status=session.presence_status,
        sensitivity_config=session.sensitivity_config or {},
        false_alarm_count=session.false_alarm_count,
    )

@router.get("/{session_id}/events", response_model=SensorEventListOut)
async def list_session_events(
    session_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    session = (
        await db.execute(select(MonitoringSession).where(MonitoringSession.id == uuid.UUID(session_id)))
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    order = (
        await db.execute(select(Order).where(Order.id == session.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    result = await db.execute(
        select(SensorEvent)
        .where(SensorEvent.session_id == session.id)
        .order_by(SensorEvent.event_time.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return SensorEventListOut(
        events=[
            SensorEventOut(
                id=e.id,
                session_id=str(e.session_id),
                device_id=str(e.device_id),
                event_type=e.event_type,
                severity=e.severity,
                metrics=e.metrics_json or {},
                event_time=e.event_time,
            )
            for e in events
        ]
    )
