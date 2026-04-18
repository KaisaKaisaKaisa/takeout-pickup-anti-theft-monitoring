import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user, is_admin_user
from app.services.report_service import (
    get_summary,
    get_trends,
    export_report_summary_csv,
    export_trends_csv,
    export_rule_matches_csv,
)
from app.core import cache

router = APIRouter()

def _parse_datetime(value: str | None, label: str) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            dt = datetime.strptime(raw, "%Y-%m-%d")
            return dt.replace(tzinfo=timezone.utc)
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc

@router.get("/summary")
async def report_summary(
    scope: str = Query("user", pattern="^(user|global)$"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    start_dt = _parse_datetime(start, "start")
    end_dt = _parse_datetime(end, "end")
    cache_key = f"report_summary:{scope}:{user.id if scope == 'user' else 'global'}:{start or ''}:{end or ''}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    if scope == "global":
        if not is_admin_user(user):
            raise HTTPException(status_code=403, detail="Admin only")
        data = await get_summary(db, user_id=None, start=start_dt, end=end_dt)
    else:
        data = await get_summary(db, user_id=user.id, start=start_dt, end=end_dt)
    cache.set(cache_key, data, ttl_sec=3)
    return data

@router.get("/summary/export")
async def export_report_summary(
    scope: str = Query("user", pattern="^(user|global)$"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    start_dt = _parse_datetime(start, "start")
    end_dt = _parse_datetime(end, "end")
    if scope == "global":
        if not is_admin_user(user):
            raise HTTPException(status_code=403, detail="Admin only")
        data = await export_report_summary_csv(db, user_id=None, start=start_dt, end=end_dt)
    else:
        data = await export_report_summary_csv(db, user_id=user.id, start=start_dt, end=end_dt)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=report-summary.csv"},
    )

@router.get("/trends")
async def report_trends(
    scope: str = Query("user", pattern="^(user|global)$"),
    days: int = Query(7, ge=1, le=30),
    interval: str = Query("day", pattern="^(day|week)$"),
    weeks: int | None = Query(None, ge=1, le=12),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    start_dt = _parse_datetime(start, "start")
    end_dt = _parse_datetime(end, "end")
    cache_key = f"report_trends:{scope}:{interval}:{days}:{weeks}:{start or ''}:{end or ''}:{user.id if scope == 'user' else 'global'}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    if scope == "global":
        if not is_admin_user(user):
            raise HTTPException(status_code=403, detail="Admin only")
        data = await get_trends(db, user_id=None, days=days, interval=interval, weeks=weeks, start=start_dt, end=end_dt)
    else:
        data = await get_trends(db, user_id=user.id, days=days, interval=interval, weeks=weeks, start=start_dt, end=end_dt)
    cache.set(cache_key, data, ttl_sec=3)
    return data

@router.get("/trends/export")
async def export_report_trends(
    scope: str = Query("user", pattern="^(user|global)$"),
    days: int = Query(7, ge=1, le=30),
    interval: str = Query("day", pattern="^(day|week)$"),
    weeks: int | None = Query(None, ge=1, le=12),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    start_dt = _parse_datetime(start, "start")
    end_dt = _parse_datetime(end, "end")
    if scope == "global":
        if not is_admin_user(user):
            raise HTTPException(status_code=403, detail="Admin only")
        data = await export_trends_csv(
            db,
            user_id=None,
            interval=interval,
            days=days,
            weeks=weeks,
            start=start_dt,
            end=end_dt,
        )
    else:
        data = await export_trends_csv(
            db,
            user_id=user.id,
            interval=interval,
            days=days,
            weeks=weeks,
            start=start_dt,
            end=end_dt,
        )
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=report-trends.csv"},
    )

@router.get("/rule-matches/export")
async def export_rule_matches(
    scope: str = Query("user", pattern="^(user|global)$"),
    limit: int = Query(200, ge=1, le=500),
    include_suppressed: bool = Query(False),
    event_type: str | None = Query(None),
    rule_set_id: str | None = Query(None),
    search: str | None = Query(None),
    range: str | None = Query(None, pattern="^(24h|7d|30d|all)$"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    start_dt = _parse_datetime(start, "start")
    end_dt = _parse_datetime(end, "end")
    rule_set_uuid = None
    if rule_set_id:
        try:
            rule_set_uuid = uuid.UUID(rule_set_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid rule_set_id") from exc
    if scope == "global":
        if not is_admin_user(user):
            raise HTTPException(status_code=403, detail="Admin only")
        data = await export_rule_matches_csv(
            db,
            user_id=None,
            limit=limit,
            include_suppressed=include_suppressed,
            event_type=event_type,
            rule_set_id=rule_set_uuid,
            search=search,
            range=range,
            start=start_dt,
            end=end_dt,
        )
    else:
        data = await export_rule_matches_csv(
            db,
            user_id=user.id,
            limit=limit,
            include_suppressed=include_suppressed,
            event_type=event_type,
            rule_set_id=rule_set_uuid,
            search=search,
            range=range,
            start=start_dt,
            end=end_dt,
        )
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=rule-matches.csv"},
    )
