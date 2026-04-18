import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import EvidenceBundle, AlertIncident, MediaAsset, Order
from app.services.storage_service import storage_path
from app.services.evidence_service import generate_evidence_bundle

router = APIRouter()

@router.post("/{incident_id}/generate")
async def generate_evidence(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    incident_uuid = uuid.UUID(incident_id)
    incident_result = await db.execute(select(AlertIncident).where(AlertIncident.id == incident_uuid))
    incident = incident_result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    order_result = await db.execute(select(Order).where(Order.id == incident.order_id))
    order = order_result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    bundle = await generate_evidence_bundle(db, incident.id)
    await db.commit()
    return {"status": bundle.status, "bundle_id": str(bundle.id)}

@router.get("/{incident_id}")
async def get_evidence(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    incident_uuid = uuid.UUID(incident_id)
    bundle = (
        await db.execute(select(EvidenceBundle).where(EvidenceBundle.incident_id == incident_uuid))
    ).scalar_one_or_none()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    order_result = await db.execute(select(Order).where(Order.id == bundle.order_id))
    order = order_result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": str(bundle.id),
        "status": bundle.status,
        "zip_media_id": str(bundle.zip_media_id) if bundle.zip_media_id else None,
        "generated_at": bundle.generated_at,
    }

@router.get("/{incident_id}/download")
async def download_evidence(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    incident_uuid = uuid.UUID(incident_id)
    bundle = (
        await db.execute(select(EvidenceBundle).where(EvidenceBundle.incident_id == incident_uuid))
    ).scalar_one_or_none()
    if not bundle or not bundle.zip_media_id:
        raise HTTPException(status_code=404, detail="Bundle not ready")
    order_result = await db.execute(select(Order).where(Order.id == bundle.order_id))
    order = order_result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    media = (
        await db.execute(select(MediaAsset).where(MediaAsset.id == bundle.zip_media_id))
    ).scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    path = storage_path(media.object_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type=media.content_type or "application/zip",
        filename=path.name,
    )
