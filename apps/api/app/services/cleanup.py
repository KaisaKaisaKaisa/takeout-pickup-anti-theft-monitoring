import asyncio
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import select, delete
from app.core.db import SessionLocal
from app.models.entities import MediaAsset
from app.services.storage_service import storage_path

async def cleanup_media() -> None:
    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(MediaAsset).where(
                MediaAsset.retention_class == "24h",
                MediaAsset.expires_at.is_not(None),
                MediaAsset.expires_at < now,
            )
        )
        medias = result.scalars().all()
        for media in medias:
            path = storage_path(media.object_key)
            if path.exists():
                try:
                    path.unlink()
                except Exception:
                    pass
        if medias:
            ids = [m.id for m in medias]
            await db.execute(delete(MediaAsset).where(MediaAsset.id.in_(ids)))
            await db.commit()

async def run_cleanup_loop() -> None:
    while True:
        await cleanup_media()
        await asyncio.sleep(300)
