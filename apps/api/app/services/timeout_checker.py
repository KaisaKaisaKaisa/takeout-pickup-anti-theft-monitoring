import asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.db import SessionLocal
from app.models.entities import MonitoringSession, AlertIncident, Order
from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.services.push_service import send_alert_push
from app.services.ws_payloads import build_alert_payload, build_event_payload
from app.services.alert_engine import _upsert_alert
from app.services.alert_service import emit_alert_event

async def check_timeouts() -> int:
    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(MonitoringSession).where(
                MonitoringSession.state.in_(["armed", "present"]),
                MonitoringSession.pickup_deadline_at < now,
            )
        )
        sessions = result.scalars().all()
        for session in sessions:
            result = await _upsert_alert(
                db=db,
                session_id=session.id,
                order_id=session.order_id,
                alert_type="pickup_timeout",
                level="warning",
                summary="pickup timeout",
                rule_id=None,
                rule_set_id=None,
                cooldown_sec=0,
                now=now,
            )
            alert = result["alert"]
            session.state = "alerted"
            order = (
                await db.execute(select(Order).where(Order.id == session.order_id))
            ).scalar_one_or_none()
            if order:
                await send_alert_push(db, order.user_id, "pickup.timeout", "已超出预计取餐时间")
                invalidate_report_caches(order.user_id)
            await emit_alert_event(alert, "alert.triggered")
        await db.commit()
        return len(sessions)

async def run_timeout_loop() -> None:
    while True:
        await check_timeouts()
        await asyncio.sleep(60)
