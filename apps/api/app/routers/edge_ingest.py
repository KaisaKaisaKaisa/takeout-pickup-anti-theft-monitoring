import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.entities import EdgeDevice, MonitoringSession, SensorEvent, Order
from app.schemas.schemas import EdgeEventIn
from app.services.alert_engine import evaluate_sensor_event
from app.services.push_service import send_alert_push
from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.services.config_service import build_device_config
from app.services.ws_payloads import build_device_payload, build_event_payload
from app.services.alert_service import emit_alert_event

router = APIRouter()


def _parse_device_id(device_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid device_id") from exc


def _parse_session_id(session_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid session_id") from exc

@router.post("/devices/{device_id}/heartbeat")
async def heartbeat(
    device_id: str,
    payload: dict | None = None,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not x_device_code or device.device_code != x_device_code:
        raise HTTPException(status_code=403, detail="Invalid device code")
    now = datetime.now(timezone.utc)
    was_online = device.status == "online"
    previous_seen = device.last_seen_at
    device.last_seen_at = now
    device.status = "online"
    if payload:
        device.config_json = device.config_json or {}
        device.config_json["last_heartbeat"] = payload
        applied = payload.get("applied_config_version")
        if applied:
            device.config_json["last_applied_version"] = applied
            device.config_json["last_applied_at"] = now.isoformat()
    await db.commit()
    should_broadcast = not was_online
    if previous_seen:
        delta = (now - previous_seen).total_seconds()
        if delta >= 30:
            should_broadcast = True
    if should_broadcast:
        device_payload = build_device_payload(device)
        invalidate_report_caches(device.owner_user_id)
        await ws_hub.broadcast_event(
            "device.updated",
            {
                "device_id": str(device.id),
                "device": device_payload,
                **build_event_payload("device", device_payload),
            },
        )
    return {"ok": True}

@router.get("/devices/{device_id}/config")
async def get_device_config(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not x_device_code or device.device_code != x_device_code:
        raise HTTPException(status_code=403, detail="Invalid device code")
    return {"config": build_device_config(device)}

@router.post("/sessions/{session_id}/events")
async def ingest_event(
    session_id: str,
    event: EdgeEventIn,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
):
    parsed_session_id = _parse_session_id(session_id)
    session_result = await db.execute(
        select(MonitoringSession).where(MonitoringSession.id == parsed_session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    device = (
        await db.execute(select(EdgeDevice).where(EdgeDevice.id == session.edge_device_id))
    ).scalar_one_or_none()
    if not device or not x_device_code or device.device_code != x_device_code:
        raise HTTPException(status_code=403, detail="Invalid device code")
    sensor = SensorEvent(
        session_id=session.id,
        device_id=session.edge_device_id,
        event_type=event.eventType,
        severity=event.severity,
        metrics_json=event.metrics,
        event_time=event.eventTime,
        created_at=datetime.now(timezone.utc),
    )
    db.add(sensor)
    await db.flush()
    alert = await evaluate_sensor_event(db, session, sensor)
    if alert:
        order_result = await db.execute(select(Order).where(Order.id == session.order_id))
        order = order_result.scalar_one_or_none()
        if order:
            await send_alert_push(db, order.user_id, "alert.triggered", "检测到可疑取餐事件")
        await emit_alert_event(alert, "alert.triggered")
    await db.commit()
    return {"ok": True, "alert_id": str(alert.id) if alert else None}
