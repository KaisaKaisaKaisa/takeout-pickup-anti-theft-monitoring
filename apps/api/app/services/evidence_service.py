from __future__ import annotations

import io
import json
import zipfile
import hashlib
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import AlertIncident, EvidenceBundle, MediaAsset, Order
from app.services.storage_service import write_bytes, storage_path

async def generate_evidence_bundle(db: AsyncSession, incident_id) -> EvidenceBundle:
    incident = (await db.execute(select(AlertIncident).where(AlertIncident.id == incident_id))).scalar_one()
    order = (await db.execute(select(Order).where(Order.id == incident.order_id))).scalar_one()
    bundle = EvidenceBundle(
        incident_id=incident.id,
        order_id=order.id,
        requested_by_user_id=order.user_id,
        status="generating",
        manifest_json={"requested_at": datetime.now(timezone.utc).isoformat()},
    )
    db.add(bundle)
    await db.flush()

    manifest = {
        "incident_id": str(incident.id),
        "order_id": str(order.id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    incident_json = {
        "id": str(incident.id),
        "order_id": str(incident.order_id),
        "session_id": str(incident.session_id),
        "alert_type": incident.alert_type,
        "level": incident.level,
        "status": incident.status,
        "summary": incident.summary,
        "triggered_at": incident.triggered_at.isoformat() if incident.triggered_at else None,
    }
    order_json = {
        "id": str(order.id),
        "provider": order.provider,
        "provider_order_id": order.provider_order_id,
        "merchant_name": order.merchant_name,
        "item_summary": order.item_summary,
        "status": order.status,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "expected_pickup_by": order.expected_pickup_by.isoformat() if order.expected_pickup_by else None,
    }

    buf = io.BytesIO()
    event_bytes = json.dumps(incident_json, ensure_ascii=False).encode("utf-8")
    order_bytes = json.dumps(order_json, ensure_ascii=False).encode("utf-8")
    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")

    hash_lines = [
        f"event.json {hashlib.sha256(event_bytes).hexdigest()}",
        f"order.json {hashlib.sha256(order_bytes).hexdigest()}",
        f"manifest.json {hashlib.sha256(manifest_bytes).hexdigest()}",
    ]
    hash_bytes = ("\n".join(hash_lines) + "\n").encode("utf-8")

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("event.json", event_bytes)
        zf.writestr("order.json", order_bytes)
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("hash.txt", hash_bytes)

        media_rows = (
            await db.execute(select(MediaAsset).where(MediaAsset.incident_id == incident.id))
        ).scalars().all()
        for media in media_rows:
            if media.storage_provider != "local":
                continue
            media_path = storage_path(media.object_key)
            if media_path.exists():
                zf.write(media_path, arcname=f"media/{media_path.name}")

    zip_bytes = buf.getvalue()
    sha256 = hashlib.sha256(zip_bytes).hexdigest()
    zip_key = f"evidence/{bundle.id}.zip"
    write_bytes(zip_key, zip_bytes)

    media = MediaAsset(
        order_id=order.id,
        session_id=incident.session_id,
        incident_id=incident.id,
        media_type="evidence_zip",
        storage_provider="local",
        bucket_name="local",
        object_key=zip_key,
        content_type="application/zip",
        size_bytes=len(zip_bytes),
        sha256=sha256,
        retention_class="evidence",
    )
    db.add(media)
    bundle.zip_media_id = media.id
    bundle.status = "ready"
    bundle.generated_at = datetime.now(timezone.utc)
    bundle.manifest_json = manifest
    return bundle
