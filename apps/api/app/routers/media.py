import uuid
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Header
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import MediaAsset, AlertIncident, MonitoringSession, EdgeDevice, Order
from app.schemas.schemas import MediaOut
from app.services.storage_service import (
    StorageUnavailable,
    object_download_url,
    sha256_hex,
    storage_path,
    write_object,
)
from app.services.device_security import authenticate_device_request
try:
    from app.schemas.schemas import MediaMetadataOut
except ImportError:
    MediaMetadataOut = dict

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
    x_device_timestamp: str | None = Header(default=None),
    x_device_nonce: str | None = Header(default=None),
    x_device_signature: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    x_device_code = x_device_code if isinstance(x_device_code, str) and x_device_code else None
    x_device_timestamp = x_device_timestamp if isinstance(x_device_timestamp, str) and x_device_timestamp else None
    x_device_nonce = x_device_nonce if isinstance(x_device_nonce, str) and x_device_nonce else None
    x_device_signature = x_device_signature if isinstance(x_device_signature, str) and x_device_signature else None
    session_uuid = uuid.UUID(session_id) if session_id else None
    incident_uuid = uuid.UUID(incident_id) if incident_id else None
    order_id = None
    session = None

    if not session_uuid and not incident_uuid and not x_device_code:
        raise HTTPException(status_code=401, detail="Missing device identity")

    if incident_uuid:
        incident = (
            await db.execute(select(AlertIncident).where(AlertIncident.id == incident_uuid))
        ).scalar_one_or_none()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        order_id = incident.order_id
        session_uuid = incident.session_id

    if session_uuid:
        session = (
            await db.execute(select(MonitoringSession).where(MonitoringSession.id == session_uuid))
        ).scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        order_id = order_id or session.order_id
        dev = (
            await db.execute(select(EdgeDevice).where(EdgeDevice.id == session.edge_device_id))
        ).scalar_one_or_none()
        if not dev:
            raise HTTPException(status_code=403, detail="Invalid device")
    else:
        dev = (
            await db.execute(select(EdgeDevice).where(EdgeDevice.device_code == x_device_code))
        ).scalar_one_or_none()
        if not dev:
            raise HTTPException(status_code=403, detail="Invalid device code")

    raw = await file.read()
    object_key = f"media/{uuid.uuid4().hex}-{file.filename}"
    digest = sha256_hex(raw)
    auth_body = json.dumps(
        {
            "content_type": file.content_type,
            "filename": file.filename,
            "incident_id": str(incident_uuid) if incident_uuid else None,
            "media_type": media_type,
            "session_id": str(session_uuid) if session_uuid else None,
            "sha256": digest,
            "size_bytes": len(raw),
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    await authenticate_device_request(
        dev,
        body=auth_body,
        x_device_code=x_device_code,
        x_device_timestamp=x_device_timestamp,
        x_device_nonce=x_device_nonce,
        x_device_signature=x_device_signature,
    )
    try:
        stored = write_object(object_key, raw, content_type=file.content_type)
    except StorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    media = MediaAsset(
        order_id=order_id,
        session_id=session_uuid,
        incident_id=incident_uuid,
        media_type=media_type,
        storage_provider=stored["storage_provider"],
        bucket_name=stored["bucket_name"],
        object_key=stored["object_key"],
        content_type=file.content_type,
        size_bytes=stored["size_bytes"],
        sha256=stored["sha256"],
        retention_class="24h",
        expires_at=expires_at,
    )
    db.add(media)
    await db.commit()
    return {
        "media_id": str(media.id),
        "storage_provider": media.storage_provider,
        "bucket_name": media.bucket_name,
        "object_key": media.object_key,
        "sha256": media.sha256,
    }


@router.get("/{media_id}", response_model=MediaMetadataOut)
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
    if media.storage_provider == "local":
        path = storage_path(media.object_key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return {"object_key": media.object_key, "path": str(path), "sha256": media.sha256}
    try:
        url = object_download_url(media.bucket_name, media.object_key, media.content_type)
    except StorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "object_key": media.object_key,
        "storage_provider": media.storage_provider,
        "bucket_name": media.bucket_name,
        "download_url": url,
        "sha256": media.sha256,
    }

@router.get(
    "/{media_id}/download",
    response_class=Response,
    responses={
        200: {"content": {"application/octet-stream": {}}, "description": "Local media file"},
        302: {"description": "Redirect to a presigned object-store URL"},
    },
)
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
    if media.storage_provider == "local":
        path = storage_path(media.object_key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(
            path,
            media_type=media.content_type or "application/octet-stream",
            filename=path.name,
        )
    try:
        return RedirectResponse(
            object_download_url(media.bucket_name, media.object_key, media.content_type),
            status_code=302,
        )
    except StorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
