import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.config import settings
from app.models.entities import EdgeDevice, MonitoringSession, AlertIncident, Order
from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.services.push_service import send_alert_push
from app.services.ws_payloads import build_device_payload, build_event_payload
from app.services.alert_service import emit_alert_event
from app.services.alert_engine import _upsert_alert

async def check_device_offline() -> int:
    async with SessionLocal() as db:
        threshold = datetime.now(timezone.utc) - timedelta(seconds=settings.device_offline_sec)
        result = await db.execute(
            select(EdgeDevice).where(
                EdgeDevice.last_seen_at.is_not(None),
                EdgeDevice.last_seen_at < threshold,
            )
        )
        devices = result.scalars().all()
        count = 0
        for device in devices:
            # find latest active session for this device
            session = (
                await db.execute(
                    select(MonitoringSession)
                    .where(MonitoringSession.edge_device_id == device.id)
                    .where(MonitoringSession.state.in_(["armed", "alerted", "present"]))
                    .order_by(MonitoringSession.created_at.desc())
                )
            ).scalar_one_or_none()
            if not session:
                continue
            result = await _upsert_alert(
                db=db,
                session_id=session.id,
                order_id=session.order_id,
                alert_type="device_offline",
                level="warning",
                summary="device offline",
                rule_id=None,
                rule_set_id=None,
                cooldown_sec=float(settings.device_offline_sec),
                now=datetime.now(timezone.utc),
            )
            alert = result["alert"]
            device.status = "offline"
            # push to owner
            order = (
                await db.execute(select(Order).where(Order.id == session.order_id))
            ).scalar_one_or_none()
            if order:
                await send_alert_push(db, order.user_id, "device.offline", "设备离线，监控可能中断")
                invalidate_report_caches(order.user_id)
            await emit_alert_event(alert, "alert.triggered")
            device_payload = build_device_payload(device)
            await ws_hub.broadcast_event(
                "device.updated",
                {
                    "device_id": str(device.id),
                    "device": device_payload,
                    **build_event_payload("device", device_payload),
                },
            )
            count += 1
        await db.commit()
        return count

async def run_device_offline_loop() -> None:
    while True:
        await check_device_offline()
        await asyncio.sleep(30)
