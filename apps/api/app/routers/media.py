import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Header
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import MediaAsset, AlertIncident, MonitoringSession, EdgeDevice, Order
from app.schemas.schemas import MediaOut
from app.services.storage_service import write_bytes, storage_path

router = APIRouter()

@router.get("", response_model=list[MediaOut])
async def list_media(
    order_id: str | None = None,
    session_id: str | None = None,
    incident_id: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    query = (
        select(MediaAsset)
        .join(Order, MediaAsset.order_id == Order.id)
        .where(Order.user_id == user.id)
        .order_by(MediaAsset.created_at.desc())
        .limit(limit)
    )
    if order_id:
        query = query.where(MediaAsset.order_id == uuid.UUID(order_id))
    if session_id:
        query = query.where(MediaAsset.session_id == uuid.UUID(session_id))
    if incident_id:
        query = query.where(MediaAsset.incident_id == uuid.UUID(incident_id))
    result = await db.execute(query)
    media_list = result.scalars().all()
    return [
        MediaOut(
            id=str(m.id),
            order_id=str(m.order_id) if m.order_id else None,
            session_id=str(m.session_id) if m.session_id else None,
            incident_id=str(m.incident_id) if m.incident_id else None,
            media_type=m.media_type,
            size_bytes=m.size_bytes,
            content_type=m.content_type,
            created_at=m.created_at,
            download_url=f"/api/v1/media/{m.id}/download",
        )
        for m in media_list
    ]

@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    media_type: str = Form(...),
    session_id: str | None = Form(None),
    incident_id: str | None = Form(None),
    x_device_code: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_device_code:
        raise HTTPException(status_code=401, detail="Missing device code")
    dev = (
        await db.execute(select(EdgeDevice).where(EdgeDevice.device_code == x_device_code))
    ).scalar_one_or_none()
    if not dev:
        raise HTTPException(status_code=403, detail="Invalid device code")
    session_uuid = uuid.UUID(session_id) if session_id else None
    incident_uuid = uuid.UUID(incident_id) if incident_id else None
    order_id = None

    if incident_uuid:
        incident = (
            await db.execute(select(AlertIncident).where(AlertIncident.id == incident_uuid))
        ).scalar_one_or_none()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        order_id = incident.order_id

    if session_uuid and not order_id:
        session = (
            await db.execute(select(MonitoringSession).where(MonitoringSession.id == session_uuid))
        ).scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.edge_device_id != dev.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        order_id = session.order_id

    raw = await file.read()
    object_key = f"media/{uuid.uuid4().hex}-{file.filename}"
    write_bytes(object_key, raw)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    media = MediaAsset(
        order_id=order_id,
        session_id=session_uuid,
        incident_id=incident_uuid,
        media_type=media_type,
        storage_provider="local",
        bucket_name="local",
        object_key=object_key,
        content_type=file.content_type,
        size_bytes=len(raw),
        retention_class="24h",
        expires_at=expires_at,
    )
    db.add(media)
    await db.commit()
    return {"media_id": str(media.id), "object_key": object_key}

@router.get("/{media_id}")
async def get_media(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    media_uuid = uuid.UUID(media_id)
    media = (
        await db.execute(select(MediaAsset).where(MediaAsset.id == media_uuid))
    ).scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.order_id:
        order = (
            await db.execute(select(Order).where(Order.id == media.order_id))
        ).scalar_one_or_none()
        if not order or order.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
    path = storage_path(media.object_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"object_key": media.object_key, "path": str(path)}

@router.get("/{media_id}/download")
async def download_media(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    media_uuid = uuid.UUID(media_id)
    media = (
        await db.execute(select(MediaAsset).where(MediaAsset.id == media_uuid))
    ).scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.order_id:
        order = (
            await db.execute(select(Order).where(Order.id == media.order_id))
        ).scalar_one_or_none()
        if not order or order.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
    path = storage_path(media.object_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type=media.content_type or "application/octet-stream",
        filename=path.name,
    )
