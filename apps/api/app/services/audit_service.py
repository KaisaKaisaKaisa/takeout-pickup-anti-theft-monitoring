import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import AuditLog

async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    meta: dict | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        meta_json=meta or {},
    )
    db.add(entry)
