import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import Response
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import AlertIncident, MonitoringSession, Order, MediaAsset
from app.schemas.schemas import AlertOut, AlertListOut
from app.services.report_service import export_incidents_csv
from app.services.audit_service import log_action
from app.core.cache_invalidation import invalidate_report_caches
from app.services.ws_payloads import build_alert_payload, build_event_payload
from app.services.alert_service import apply_alert_status

router = APIRouter()


def _parse_incident_id(incident_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(incident_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid incident_id") from exc

@router.get("", response_model=AlertListOut)
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(AlertIncident)
        .join(Order, AlertIncident.order_id == Order.id)
        .where(Order.user_id == user.id)
        .order_by(AlertIncident.triggered_at.desc())
    )
    alerts = result.scalars().all()
    return AlertListOut(
        alerts=[
            AlertOut(
                id=str(a.id),
                order_id=str(a.order_id),
                alert_type=a.alert_type,
                level=a.level,
                status=a.status,
                triggered_at=a.triggered_at,
            )
            for a in alerts
        ]
    )

@router.get("/{incident_id}")
async def get_alert_detail(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_incident_id = _parse_incident_id(incident_id)
    alert = (
        await db.execute(select(AlertIncident).where(AlertIncident.id == parsed_incident_id))
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    order = (
        await db.execute(select(Order).where(Order.id == alert.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    media = (
        await db.execute(select(MediaAsset).where(MediaAsset.incident_id == alert.id))
    ).scalars().all()
    return {
        "id": str(alert.id),
        "order_id": str(alert.order_id),
        "alert_type": alert.alert_type,
        "level": alert.level,
        "status": alert.status,
        "summary": alert.summary,
        "triggered_at": alert.triggered_at,
        "media": [
            {
                "id": str(m.id),
                "type": m.media_type,
                "size": m.size_bytes,
                "download_url": f"/api/v1/media/{m.id}/download",
            }
            for m in media
        ],
    }

@router.post("/{incident_id}/ack")
async def ack_alert(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_incident_id = _parse_incident_id(incident_id)
    alert = (
        await db.execute(select(AlertIncident).where(AlertIncident.id == parsed_incident_id))
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    order = (
        await db.execute(select(Order).where(Order.id == alert.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await apply_alert_status(
        db=db,
        alert=alert,
        status="acknowledged",
        user_id=user.id,
        audit={"user_id": user.id, "action": "alert.ack"},
    )
    return {"ok": True}

@router.post("/{incident_id}/resolve")
async def resolve_alert(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_incident_id = _parse_incident_id(incident_id)
    alert = (
        await db.execute(select(AlertIncident).where(AlertIncident.id == parsed_incident_id))
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    order = (
        await db.execute(select(Order).where(Order.id == alert.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await apply_alert_status(
        db=db,
        alert=alert,
        status="resolved",
        user_id=user.id,
        audit={"user_id": user.id, "action": "alert.resolve"},
    )
    return {"ok": True}

@router.post("/{incident_id}/false-positive")
async def false_positive(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_incident_id = _parse_incident_id(incident_id)
    alert = (
        await db.execute(select(AlertIncident).where(AlertIncident.id == parsed_incident_id))
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    order = (
        await db.execute(select(Order).where(Order.id == alert.order_id))
    ).scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    alert.status = "false_positive"
    session = (
        await db.execute(select(MonitoringSession).where(MonitoringSession.id == alert.session_id))
    ).scalar_one_or_none()
    if session:
        session.false_alarm_count += 1
        if session.false_alarm_count >= 3:
            cfg = session.sensitivity_config or {}
            cfg["min_motion_score"] = float(cfg.get("min_motion_score", 0)) + 1000
            cfg["max_weight_drop"] = float(cfg.get("max_weight_drop", -200)) - 50
            session.sensitivity_config = cfg
    await apply_alert_status(
        db=db,
        alert=alert,
        status="false_positive",
        user_id=user.id,
        audit={"user_id": user.id, "action": "alert.false_positive"},
    )
    return {"ok": True}

@router.get("/export/csv")
async def export_alerts(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    data = await export_incidents_csv(db, user.id)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=alerts.csv"},
    )
