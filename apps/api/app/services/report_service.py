from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import AlertIncident, Order, AuditLog, EdgeDevice, MonitoringSession, SensorEvent
from app.models.entities import RuleMatchLog

async def export_incidents_csv(db: AsyncSession, user_id=None) -> bytes:
    stmt = select(AlertIncident).order_by(AlertIncident.triggered_at.desc())
    if user_id:
        stmt = stmt.join(Order, AlertIncident.order_id == Order.id).where(Order.user_id == user_id)
    result = await db.execute(stmt)
    incidents = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["incident_id", "order_id", "alert_type", "level", "status", "triggered_at"])
    for inc in incidents:
        writer.writerow([inc.id, inc.order_id, inc.alert_type, inc.level, inc.status, inc.triggered_at])
    return output.getvalue().encode("utf-8")

async def export_report_summary_csv(
    db: AsyncSession,
    user_id=None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> bytes:
    summary = await get_summary(db, user_id=user_id, start=start, end=end)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["metric_group", "metric", "value"])
    for key, group in summary.items():
        if isinstance(group, dict):
            for metric, value in group.items():
                writer.writerow([key, metric, value])
        else:
            writer.writerow(["summary", key, group])
    return output.getvalue().encode("utf-8")

async def export_trends_csv(
    db: AsyncSession,
    user_id=None,
    interval: str = "day",
    days: int = 7,
    weeks: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> bytes:
    trends = await get_trends(
        db,
        user_id=user_id,
        interval=interval,
        days=days,
        weeks=weeks,
        start=start,
        end=end,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["series", "bucket", "count"])
    for series in ("orders", "alerts", "devices", "sessions", "events", "rule_matches"):
        for row in trends.get(series, []):
            bucket = row.get("day") or row.get("week")
            writer.writerow([series, bucket, row.get("count", 0)])
    return output.getvalue().encode("utf-8")

async def export_rule_matches_csv(
    db: AsyncSession,
    user_id=None,
    limit: int = 200,
    include_suppressed: bool = False,
    event_type: str | None = None,
    rule_set_id=None,
    search: str | None = None,
    range: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> bytes:
    stmt = select(RuleMatchLog).order_by(RuleMatchLog.matched_at.desc()).limit(limit)
    if user_id:
        stmt = stmt.where(RuleMatchLog.user_id == user_id)
    if not include_suppressed:
        stmt = stmt.where(RuleMatchLog.suppressed == False)
    if event_type:
        stmt = stmt.where(RuleMatchLog.event_type == event_type)
    if rule_set_id:
        stmt = stmt.where(RuleMatchLog.rule_set_id == rule_set_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            RuleMatchLog.order_id.cast(String).ilike(like)
            | RuleMatchLog.rule_id.cast(String).ilike(like)
            | RuleMatchLog.rule_set_id.cast(String).ilike(like)
        )
    if range and range != "all":
        now = datetime.now(timezone.utc)
        if range == "24h":
            since = now - timedelta(hours=24)
        elif range == "7d":
            since = now - timedelta(days=7)
        else:
            since = now - timedelta(days=30)
        stmt = stmt.where(RuleMatchLog.matched_at >= since)
    if start:
        stmt = stmt.where(RuleMatchLog.matched_at >= start)
    if end:
        stmt = stmt.where(RuleMatchLog.matched_at <= end)
    rows = (await db.execute(stmt)).scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "match_id",
        "rule_id",
        "rule_set_id",
        "order_id",
        "session_id",
        "event_id",
        "event_type",
        "suppressed",
        "note",
        "matched_at",
    ])
    for r in rows:
        writer.writerow([
            r.id,
            r.rule_id,
            r.rule_set_id,
            r.order_id,
            r.session_id,
            r.event_id,
            r.event_type,
            r.suppressed,
            r.note or "",
            r.matched_at,
        ])
    return output.getvalue().encode("utf-8")
async def export_orders_csv(db: AsyncSession, user_id=None) -> bytes:
    stmt = select(Order).order_by(Order.created_at.desc())
    if user_id:
        stmt = stmt.where(Order.user_id == user_id)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["order_id", "provider", "status", "delivered_at", "expected_pickup_by"])
    for o in orders:
        writer.writerow([o.id, o.provider, o.status, o.delivered_at, o.expected_pickup_by])
    return output.getvalue().encode("utf-8")

async def export_audit_csv(db: AsyncSession, user_id=None) -> bytes:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "action", "resource_type", "resource_id", "created_at"])
    for r in rows:
        writer.writerow([r.id, r.action, r.resource_type, r.resource_id, r.created_at])
    return output.getvalue().encode("utf-8")

async def get_summary(
    db: AsyncSession,
    user_id=None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> dict:
    orders_stmt = select(
        func.count(Order.id),
        func.count(case((Order.status == "created", 1))),
        func.count(case((Order.status == "delivered", 1))),
        func.count(case((Order.status == "picked_up", 1))),
    )
    if user_id:
        orders_stmt = orders_stmt.where(Order.user_id == user_id)
    if start:
        orders_stmt = orders_stmt.where(Order.created_at >= start)
    if end:
        orders_stmt = orders_stmt.where(Order.created_at <= end)
    orders_row = (await db.execute(orders_stmt)).one()

    alerts_stmt = select(
        func.count(AlertIncident.id),
        func.count(case((AlertIncident.status == "open", 1))),
        func.count(case((AlertIncident.status == "acknowledged", 1))),
        func.count(case((AlertIncident.status == "resolved", 1))),
        func.count(case((AlertIncident.status == "false_positive", 1))),
    )
    if user_id:
        alerts_stmt = alerts_stmt.join(Order, AlertIncident.order_id == Order.id).where(Order.user_id == user_id)
    if start:
        alerts_stmt = alerts_stmt.where(AlertIncident.triggered_at >= start)
    if end:
        alerts_stmt = alerts_stmt.where(AlertIncident.triggered_at <= end)
    alerts_row = (await db.execute(alerts_stmt)).one()

    devices_stmt = select(
        func.count(EdgeDevice.id),
        func.count(case((EdgeDevice.status == "online", 1))),
        func.count(case((EdgeDevice.status == "offline", 1))),
    )
    if user_id:
        devices_stmt = devices_stmt.where(EdgeDevice.owner_user_id == user_id)
    if start:
        devices_stmt = devices_stmt.where(EdgeDevice.created_at >= start)
    if end:
        devices_stmt = devices_stmt.where(EdgeDevice.created_at <= end)
    devices_row = (await db.execute(devices_stmt)).one()

    sessions_stmt = select(
        func.count(MonitoringSession.id),
        func.count(case((MonitoringSession.state == "armed", 1))),
        func.count(case((MonitoringSession.state == "alerted", 1))),
        func.count(case((MonitoringSession.state == "confirmed", 1))),
    )
    if user_id:
        sessions_stmt = sessions_stmt.join(Order, MonitoringSession.order_id == Order.id).where(Order.user_id == user_id)
    if start:
        sessions_stmt = sessions_stmt.where(MonitoringSession.armed_at >= start)
    if end:
        sessions_stmt = sessions_stmt.where(MonitoringSession.armed_at <= end)
    sessions_row = (await db.execute(sessions_stmt)).one()

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    events_stmt = (
        select(func.count(SensorEvent.id))
        .select_from(SensorEvent)
        .where(SensorEvent.event_time >= since)
    )
    if user_id:
        events_stmt = (
            events_stmt.join(MonitoringSession, SensorEvent.session_id == MonitoringSession.id)
            .join(Order, MonitoringSession.order_id == Order.id)
            .where(Order.user_id == user_id)
        )
    if start:
        events_stmt = events_stmt.where(SensorEvent.event_time >= start)
    if end:
        events_stmt = events_stmt.where(SensorEvent.event_time <= end)
    events_count = (await db.execute(events_stmt)).scalar_one()

    rules_stmt = select(
        func.count(RuleMatchLog.id),
        func.count(case((RuleMatchLog.suppressed == True, 1))),
    )
    if user_id:
        rules_stmt = rules_stmt.where(RuleMatchLog.user_id == user_id)
    if start:
        rules_stmt = rules_stmt.where(RuleMatchLog.matched_at >= start)
    if end:
        rules_stmt = rules_stmt.where(RuleMatchLog.matched_at <= end)
    rules_row = (await db.execute(rules_stmt)).one()

    return {
        "orders": {
            "total": orders_row[0],
            "created": orders_row[1],
            "delivered": orders_row[2],
            "picked_up": orders_row[3],
        },
        "alerts": {
            "total": alerts_row[0],
            "open": alerts_row[1],
            "acknowledged": alerts_row[2],
            "resolved": alerts_row[3],
            "false_positive": alerts_row[4],
        },
        "devices": {
            "total": devices_row[0],
            "online": devices_row[1],
            "offline": devices_row[2],
        },
        "sessions": {
            "total": sessions_row[0],
            "armed": sessions_row[1],
            "alerted": sessions_row[2],
            "confirmed": sessions_row[3],
        },
        "events_last_24h": events_count,
        "rule_matches": {
            "total": rules_row[0],
            "suppressed": rules_row[1],
        },
    }

async def get_trends(
    db: AsyncSession,
    user_id=None,
    days: int = 7,
    interval: str = "day",
    weeks: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> dict:
    interval = interval if interval in {"day", "week"} else "day"
    if start and end:
        since = start
        until = end
        trunc = "week" if interval == "week" else "day"
        label = "week" if interval == "week" else "day"
    else:
        until = None
        if interval == "week":
            if weeks is None:
                weeks = max(1, min((days + 6) // 7, 12))
            since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
            trunc = "week"
            label = "week"
        else:
            days = max(1, min(days, 30))
            since = datetime.now(timezone.utc) - timedelta(days=days)
            trunc = "day"
            label = "day"

    orders_stmt = select(
        func.date_trunc(trunc, Order.created_at).label("bucket"),
        func.count(Order.id),
    ).where(Order.created_at >= since).group_by("bucket").order_by("bucket")
    if until:
        orders_stmt = orders_stmt.where(Order.created_at <= until)
    if user_id:
        orders_stmt = orders_stmt.where(Order.user_id == user_id)
    orders_rows = (await db.execute(orders_stmt)).all()

    alerts_stmt = select(
        func.date_trunc(trunc, AlertIncident.triggered_at).label("bucket"),
        func.count(AlertIncident.id),
    ).where(AlertIncident.triggered_at >= since).group_by("bucket").order_by("bucket")
    if until:
        alerts_stmt = alerts_stmt.where(AlertIncident.triggered_at <= until)
    if user_id:
        alerts_stmt = alerts_stmt.join(Order, AlertIncident.order_id == Order.id).where(Order.user_id == user_id)
    alerts_rows = (await db.execute(alerts_stmt)).all()

    devices_stmt = select(
        func.date_trunc(trunc, EdgeDevice.created_at).label("bucket"),
        func.count(EdgeDevice.id),
    ).where(EdgeDevice.created_at >= since).group_by("bucket").order_by("bucket")
    if until:
        devices_stmt = devices_stmt.where(EdgeDevice.created_at <= until)
    if user_id:
        devices_stmt = devices_stmt.where(EdgeDevice.owner_user_id == user_id)
    devices_rows = (await db.execute(devices_stmt)).all()

    sessions_stmt = select(
        func.date_trunc(trunc, MonitoringSession.armed_at).label("bucket"),
        func.count(MonitoringSession.id),
    ).where(MonitoringSession.armed_at >= since).group_by("bucket").order_by("bucket")
    if until:
        sessions_stmt = sessions_stmt.where(MonitoringSession.armed_at <= until)
    if user_id:
        sessions_stmt = sessions_stmt.join(Order, MonitoringSession.order_id == Order.id).where(Order.user_id == user_id)
    sessions_rows = (await db.execute(sessions_stmt)).all()

    events_stmt = select(
        func.date_trunc(trunc, SensorEvent.event_time).label("bucket"),
        func.count(SensorEvent.id),
    ).where(SensorEvent.event_time >= since).group_by("bucket").order_by("bucket")
    if until:
        events_stmt = events_stmt.where(SensorEvent.event_time <= until)
    if user_id:
        events_stmt = (
            events_stmt.join(MonitoringSession, SensorEvent.session_id == MonitoringSession.id)
            .join(Order, MonitoringSession.order_id == Order.id)
            .where(Order.user_id == user_id)
        )
    events_rows = (await db.execute(events_stmt)).all()

    rules_stmt = select(
        func.date_trunc(trunc, RuleMatchLog.matched_at).label("bucket"),
        func.count(RuleMatchLog.id),
    ).where(RuleMatchLog.matched_at >= since).group_by("bucket").order_by("bucket")
    if until:
        rules_stmt = rules_stmt.where(RuleMatchLog.matched_at <= until)
    if user_id:
        rules_stmt = rules_stmt.where(RuleMatchLog.user_id == user_id)
    rules_rows = (await db.execute(rules_stmt)).all()

    def normalize(rows):
        return [{label: r[0].date().isoformat(), "count": int(r[1])} for r in rows]

    return {
        "interval": interval,
        "orders": normalize(orders_rows),
        "alerts": normalize(alerts_rows),
        "devices": normalize(devices_rows),
        "sessions": normalize(sessions_rows),
        "events": normalize(events_rows),
        "rule_matches": normalize(rules_rows),
    }
