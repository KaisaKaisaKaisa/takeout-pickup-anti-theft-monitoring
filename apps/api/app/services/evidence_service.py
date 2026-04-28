from __future__ import annotations

import io
import json
import zipfile
import hashlib
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import AlertIncident, EvidenceBundle, MediaAsset, Order
from app.services.storage_service import storage_path, write_object

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
        "files": [],
        "media": [],
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
    manifest["files"].extend(
        [
            {"path": "event.json", "sha256": hashlib.sha256(event_bytes).hexdigest(), "size_bytes": len(event_bytes)},
            {"path": "order.json", "sha256": hashlib.sha256(order_bytes).hexdigest(), "size_bytes": len(order_bytes)},
        ]
    )

    hash_lines = [
        f"event.json {manifest['files'][0]['sha256']}",
        f"order.json {manifest['files'][1]['sha256']}",
    ]

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("event.json", event_bytes)
        zf.writestr("order.json", order_bytes)

        media_rows = (
            await db.execute(select(MediaAsset).where(MediaAsset.incident_id == incident.id))
        ).scalars().all()
        for media in media_rows:
            media_entry = {
                "media_id": str(media.id),
                "storage_provider": media.storage_provider,
                "bucket_name": media.bucket_name,
                "object_key": media.object_key,
                "sha256": media.sha256,
                "size_bytes": media.size_bytes,
                "content_type": media.content_type,
            }
            manifest["media"].append(media_entry)
            media_path = storage_path(media.object_key)
            if media.storage_provider == "local" and media_path.exists():
                media_bytes = media_path.read_bytes()
                arcname = f"media/{media_path.name}"
                media_hash = hashlib.sha256(media_bytes).hexdigest()
                zf.writestr(arcname, media_bytes)
                manifest["files"].append({"path": arcname, "sha256": media_hash, "size_bytes": len(media_bytes)})
                hash_lines.append(f"{arcname} {media_hash}")

        manifest_bytes = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
        manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
        zf.writestr("manifest.json", manifest_bytes)
        hash_lines.append(f"manifest.json {manifest_hash}")
        zf.writestr("hash.txt", ("\n".join(hash_lines) + "\n").encode("utf-8"))

    zip_bytes = buf.getvalue()
    zip_key = f"evidence/{bundle.id}.zip"
    stored = write_object(zip_key, zip_bytes, content_type="application/zip")

    media = MediaAsset(
        order_id=order.id,
        session_id=incident.session_id,
        incident_id=incident.id,
        media_type="evidence_zip",
        storage_provider=stored["storage_provider"],
        bucket_name=stored["bucket_name"],
        object_key=stored["object_key"],
        content_type="application/zip",
        size_bytes=stored["size_bytes"],
        sha256=stored["sha256"],
        retention_class="evidence",
    )
    db.add(media)
    bundle.zip_media_id = media.id
    bundle.status = "ready"
    bundle.generated_at = datetime.now(timezone.utc)
    bundle.manifest_json = manifest
    return bundle
