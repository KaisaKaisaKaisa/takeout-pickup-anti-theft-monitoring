from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.entities import AuditLog
from app.services.report_service import export_audit_csv
from fastapi.responses import Response

router = APIRouter()

@router.get("")
async def list_audit(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "created_at": r.created_at,
            "meta": r.meta_json,
        }
        for r in rows
    ]

@router.get("/export/csv")
async def export_audit(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    data = await export_audit_csv(db, user.id)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit.csv"},
    )
