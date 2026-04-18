from datetime import datetime, timezone, timedelta
from sqlalchemy import select, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.entities import AlertIncident, MonitoringSession, SensorEvent, RuleSet, Rule, Order, RuleMatchLog
from app.core import ws as ws_hub
from app.core.cache_invalidation import invalidate_report_caches
from app.services.rule_engine_utils import is_within_cooldown
from app.services.ws_payloads import build_rule_match_payload, build_event_payload

SUSPICIOUS_EVENT_TYPES = {"object_missing", "weight_drop", "motion", "motion_detected"}

def _metric(metrics: dict, *keys: str, default: float = 0.0) -> float:
    for key in keys:
        if key in metrics:
            try:
                return float(metrics[key])
            except (TypeError, ValueError):
                return default
    return default

async def _upsert_alert(
    db: AsyncSession,
    session_id,
    order_id,
    alert_type: str,
    level: str,
    summary: str,
    rule_id=None,
    rule_set_id=None,
    cooldown_sec: float = 0,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    existing = (
        await db.execute(
            select(AlertIncident)
            .where(AlertIncident.session_id == session_id)
            .where(AlertIncident.alert_type == alert_type)
            .where(AlertIncident.status == "open")
            .where(AlertIncident.rule_id == rule_id)
            .order_by(AlertIncident.triggered_at.desc())
        )
    ).scalar_one_or_none()
    if existing:
        if cooldown_sec > 0:
            threshold = now - timedelta(seconds=cooldown_sec)
            if existing.triggered_at and existing.triggered_at >= threshold:
                existing.triggered_at = now
                existing.summary = summary
                existing.is_update = True
                return {"alert": existing, "action": "updated"}
        existing.status = "resolved"

    alert = AlertIncident(
        order_id=order_id,
        session_id=session_id,
        rule_id=rule_id,
        rule_set_id=rule_set_id,
        alert_type=alert_type,
        level=level,
        status="open",
        summary=summary,
        triggered_at=now,
    )
    alert.is_update = False
    db.add(alert)
    await db.flush()
    return {"alert": alert, "action": "created"}

async def evaluate_sensor_event(
    db: AsyncSession,
    session: MonitoringSession,
    event: SensorEvent,
) -> AlertIncident | None:
    if session.state not in {"armed", "alerted"}:
        return None

    rule_alert = await _evaluate_rules(db, session, event)
    if rule_alert:
        return rule_alert

    if event.event_type not in SUSPICIOUS_EVENT_TYPES:
        return None

    # Threshold checks (configurable)
    thresholds = session.sensitivity_config or {}
    cooldown_sec = float(thresholds.get("alert_cooldown_sec", settings.default_alert_cooldown_sec))
    if event.event_type in {"object_missing", "motion", "motion_detected"}:
        motion_score = _metric(event.metrics_json, "motionScore", "motion_score", "motion", default=0)
        min_motion = float(thresholds.get("min_motion_score", settings.default_min_motion_score))
        if motion_score < min_motion:
            return None
    if event.event_type == "weight_drop":
        delta = _metric(
            event.metrics_json,
            "weightDeltaGram",
            "weight_delta_gram",
            "weight_delta",
            "delta",
            default=0,
        )
        max_drop = float(thresholds.get("max_weight_drop", settings.default_max_weight_drop))
        if delta > max_drop:
            return None

    session.state = "alerted"
    result = await _upsert_alert(
        db=db,
        session_id=session.id,
        order_id=session.order_id,
        alert_type="suspicious_pickup",
        level="critical",
        summary=f"event={event.event_type}",
        rule_id=None,
        rule_set_id=None,
        cooldown_sec=cooldown_sec,
        now=datetime.now(timezone.utc),
    )
    alert = result["alert"]
    order = (
        await db.execute(select(Order).where(Order.id == session.order_id))
    ).scalar_one_or_none()
    if order:
        invalidate_report_caches(order.user_id)
    return alert

async def _evaluate_rules(
    db: AsyncSession,
    session: MonitoringSession,
    event: SensorEvent,
) -> AlertIncident | None:
    order = (
        await db.execute(select(Order).where(Order.id == session.order_id))
    ).scalar_one_or_none()
    if not order:
        return None
    user_id = order.user_id

    rule_sets = (
        await db.execute(
            select(RuleSet)
            .where(RuleSet.enabled == True)
            .order_by(RuleSet.created_at.desc())
        )
    ).scalars().all()
    if not rule_sets:
        return None

    # Apply global (admin) and user-scoped rule sets
    active_rule_sets = [
        rs for rs in rule_sets if rs.scope == "global" or rs.owner_user_id == user_id
    ]
    if not active_rule_sets:
        return None

    rule_set_ids = [rs.id for rs in active_rule_sets]
    scope_order = case((RuleSet.scope == "user", 0), else_=1)
    rows = (
        await db.execute(
            select(Rule, RuleSet.scope)
            .join(RuleSet, Rule.rule_set_id == RuleSet.id)
            .where(Rule.rule_set_id.in_(rule_set_ids))
            .where(Rule.enabled == True)
            .order_by(Rule.priority.asc(), scope_order.asc(), Rule.created_at.desc())
        )
    ).all()
    rules = [row[0] for row in rows]

    for rule in rules:
        if rule.event_type != event.event_type:
            continue
        if not _match_conditions(event.metrics_json or {}, rule.conditions or {}):
            continue
        suppressed = False
        note = None
        if rule.cooldown_sec > 0:
            recent_match = (
                await db.execute(
                    select(RuleMatchLog.matched_at)
                    .where(RuleMatchLog.rule_id == rule.id)
                    .where(RuleMatchLog.session_id == session.id)
                    .order_by(RuleMatchLog.matched_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if is_within_cooldown(recent_match, rule.cooldown_sec, datetime.now(timezone.utc)):
                suppressed = True
                note = "cooldown"

        match = RuleMatchLog(
            rule_id=rule.id,
            rule_set_id=rule.rule_set_id,
            order_id=session.order_id,
            session_id=session.id,
            event_id=event.id,
            user_id=user_id,
            event_type=event.event_type,
            conditions=rule.conditions or {},
            metrics_json=event.metrics_json or {},
            action=rule.action,
            suppressed=suppressed,
            note=note,
            matched_at=datetime.now(timezone.utc),
        )
        db.add(match)
        await db.flush()
        invalidate_report_caches(user_id)
        match_payload = build_rule_match_payload(match, summary=rule.name or rule.event_type)
        await ws_hub.broadcast_event(
            "rule.match",
            {
                "rule_id": str(rule.id),
                "rule_set_id": str(rule.rule_set_id),
                "order_id": str(session.order_id),
                "session_id": str(session.id),
                "event_type": event.event_type,
                "action": rule.action,
                "suppressed": suppressed,
                "note": note,
                "match": match_payload,
                **build_event_payload("rule_match", match_payload),
            },
        )
        if suppressed:
            continue
        if rule.action == "alert":
            session.state = "alerted"
            result = await _upsert_alert(
                db=db,
                session_id=session.id,
                order_id=session.order_id,
                alert_type="rule_triggered",
                level="warning",
                summary=f"rule={rule.name}",
                rule_id=rule.id,
                rule_set_id=rule.rule_set_id,
                cooldown_sec=float(rule.cooldown_sec or 0),
                now=datetime.now(timezone.utc),
            )
            return result["alert"]
        if rule.action == "suppress":
            return None
    return None

def _match_conditions(metrics: dict, conditions: dict) -> bool:
    if not conditions:
        return True
    if "$or" in conditions:
        return any(_match_conditions(metrics, cond) for cond in conditions.get("$or", []))
    for key, cond in conditions.items():
        value = _metric(metrics, key, default=0)
        if isinstance(cond, dict):
            if "gte" in cond and not value >= float(cond["gte"]):
                return False
            if "lte" in cond and not value <= float(cond["lte"]):
                return False
            if "gt" in cond and not value > float(cond["gt"]):
                return False
            if "lt" in cond and not value < float(cond["lt"]):
                return False
        else:
            try:
                if value != float(cond):
                    return False
            except (TypeError, ValueError):
                if value != cond:
                    return False
    return True
