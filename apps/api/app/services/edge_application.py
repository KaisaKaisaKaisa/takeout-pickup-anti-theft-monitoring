from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.models.entities import EdgeDevice, MonitoringSession, Order, SensorEvent
from app.schemas.schemas import EdgeEventIn
from app.services.alert_engine import evaluate_sensor_event
from app.services.alert_service import emit_alert_event
from app.services.config_service import build_device_config
from app.services.push_service import send_alert_push
from app.services.ws_payloads import build_device_payload, build_event_payload

_device_security_path = Path(__file__).resolve().parent / "device_security.py"
_device_security_spec = importlib.util.spec_from_file_location("device_security_local", _device_security_path)
_device_security = importlib.util.module_from_spec(_device_security_spec)
assert _device_security_spec and _device_security_spec.loader
_device_security_spec.loader.exec_module(_device_security)
authenticate_device_request = _device_security.authenticate_device_request


class EdgeApplicationError(Exception):
    pass


class InvalidDeviceIdError(EdgeApplicationError):
    pass


class InvalidSessionIdError(EdgeApplicationError):
    pass


class DeviceNotFoundError(EdgeApplicationError):
    pass


class SessionNotFoundError(EdgeApplicationError):
    pass


class InvalidDeviceCodeError(EdgeApplicationError):
    pass


@dataclass(frozen=True)
class DeviceAuthHeaders:
    x_device_code: str | None = None
    x_device_timestamp: str | None = None
    x_device_nonce: str | None = None
    x_device_signature: str | None = None


@dataclass(frozen=True)
class IngestEventResult:
    ok: bool = True
    alert_id: str | None = None


def _parse_device_id(device_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(device_id)
    except ValueError as exc:
        raise InvalidDeviceIdError("Invalid device_id") from exc


def _parse_session_id(session_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(session_id)
    except ValueError as exc:
        raise InvalidSessionIdError("Invalid session_id") from exc


async def _get_device(db: AsyncSession, device_id: str) -> EdgeDevice:
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise DeviceNotFoundError("Device not found")
    return device


async def _authenticate_device(device: EdgeDevice, body: bytes, headers: DeviceAuthHeaders) -> None:
    await authenticate_device_request(
        device,
        body=body,
        x_device_code=headers.x_device_code,
        x_device_timestamp=headers.x_device_timestamp,
        x_device_nonce=headers.x_device_nonce,
        x_device_signature=headers.x_device_signature,
    )


def _device_payload_body(payload: dict | None) -> bytes:
    return json.dumps(payload or {}, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _event_payload_body(event: EdgeEventIn) -> bytes:
    event_body = {
        "eventTime": event.eventTime,
        "eventType": event.eventType,
        "metrics": event.metrics,
        "severity": event.severity,
    }
    return json.dumps(event_body, separators=(",", ":"), sort_keys=True).encode("utf-8")


async def heartbeat(
    db: AsyncSession,
    device_id: str,
    payload: dict | None,
    headers: DeviceAuthHeaders,
) -> dict:
    device = await _get_device(db, device_id)
    await _authenticate_device(device, _device_payload_body(payload), headers)
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


async def get_device_config(
    db: AsyncSession,
    device_id: str,
    headers: DeviceAuthHeaders,
) -> dict:
    device = await _get_device(db, device_id)
    await _authenticate_device(device, b"", headers)
    return {"config": build_device_config(device)}


async def ingest_event(
    db: AsyncSession,
    session_id: str,
    event: EdgeEventIn,
    headers: DeviceAuthHeaders,
) -> IngestEventResult:
    parsed_session_id = _parse_session_id(session_id)
    session_result = await db.execute(
        select(MonitoringSession).where(MonitoringSession.id == parsed_session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise SessionNotFoundError("Session not found")
    device = (
        await db.execute(select(EdgeDevice).where(EdgeDevice.id == session.edge_device_id))
    ).scalar_one_or_none()
    if not device:
        raise InvalidDeviceCodeError("Invalid device code")
    await _authenticate_device(device, _event_payload_body(event), headers)
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
    return IngestEventResult(ok=True, alert_id=str(alert.id) if alert else None)
