import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, String
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user, is_admin_user
from app.models.entities import RuleSet, Rule, RuleMatchLog
from app.schemas.schemas import RuleSetCreate, RuleSetOut, RuleCreate, RuleOut, RuleMatchLogOut
from app.services.audit_service import log_action
from app.services.rule_permissions import can_edit_rule_set
from app.services.rule_dsl import validate_dsl, dsl_to_conditions
from app.services.alert_engine import _match_conditions

router = APIRouter()


def _parse_set_id(set_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(set_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid set_id") from exc


def _parse_rule_id(rule_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(rule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid rule_id") from exc

@router.post("/dsl/validate")
async def validate_dsl_route(payload: dict):
    dsl_json = payload.get("dsl_json")
    if not dsl_json:
        raise HTTPException(status_code=400, detail="Missing dsl_json")
    try:
        validate_dsl(dsl_json)
        conditions = dsl_to_conditions(dsl_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "conditions": conditions}

@router.post("/dsl/evaluate")
async def evaluate_dsl_route(payload: dict):
    dsl_json = payload.get("dsl_json")
    metrics = payload.get("metrics")
    if not dsl_json:
        raise HTTPException(status_code=400, detail="Missing dsl_json")
    if metrics is None:
        raise HTTPException(status_code=400, detail="Missing metrics")
    try:
        validate_dsl(dsl_json)
        conditions = dsl_to_conditions(dsl_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    matched = _match_conditions(metrics, conditions)
    return {"ok": True, "matched": bool(matched), "conditions": conditions}

@router.get("/dsl/meta")
async def get_dsl_meta():
    return {
        "operators": {
            "boolean": ["and", "or"],
            "compare": ["gt", "gte", "lt", "lte", "eq", "neq"],
        },
        "examples": [
            {
                "dsl_json": {
                    "op": "and",
                    "rules": [
                        {"field": "motion_score", "op": "gte", "value": 1200},
                        {"field": "weight_delta", "op": "lt", "value": -50},
                    ],
                }
            }
        ],
    }

@router.get("/dsl/fields")
async def get_dsl_fields():
    return {
        "fields": [
            {"key": "motion_score", "type": "number", "label": "Motion Score", "unit": "score", "example": 1200},
            {"key": "weight_delta", "type": "number", "label": "Weight Delta", "unit": "g", "example": -50},
            {"key": "motion", "type": "number", "label": "Motion", "unit": "score", "example": 0.5},
            {"key": "presence", "type": "boolean", "label": "Presence Detected", "example": True},
            {"key": "noise_db", "type": "number", "label": "Noise Level", "unit": "dB", "example": 62},
        ]
    }

@router.post("/sets", response_model=RuleSetOut)
async def create_rule_set(
    payload: RuleSetCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if payload.scope == "global" and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin only")
    rule_set = RuleSet(
        owner_user_id=user.id,
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
        scope=payload.scope,
    )
    db.add(rule_set)
    await db.flush()
    await log_action(db, user.id, "ruleset.create", "ruleset", str(rule_set.id))
    await db.commit()
    return RuleSetOut(
        id=str(rule_set.id),
        name=rule_set.name,
        description=rule_set.description,
        enabled=rule_set.enabled,
        scope=rule_set.scope,
    )

@router.get("/sets", response_model=list[RuleSetOut])
async def list_rule_sets(
    include_global: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if is_admin_user(user):
        stmt = select(RuleSet).order_by(RuleSet.created_at.desc())
    else:
        if include_global:
            stmt = (
                select(RuleSet)
                .where((RuleSet.owner_user_id == user.id) | (RuleSet.scope == "global"))
                .order_by(RuleSet.created_at.desc())
            )
        else:
            stmt = select(RuleSet).where(RuleSet.owner_user_id == user.id).order_by(RuleSet.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        RuleSetOut(
            id=str(r.id),
            name=r.name,
            description=r.description,
            enabled=r.enabled,
            scope=r.scope,
        )
        for r in rows
    ]

@router.get("/matches", response_model=list[RuleMatchLogOut])
async def list_rule_matches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=1000),
    include_suppressed: bool = Query(False),
    event_type: str | None = Query(None),
    rule_id: str | None = Query(None),
    rule_set_id: str | None = Query(None),
    search: str | None = Query(None),
    range: str | None = Query(None, pattern="^(24h|7d|30d|all)$"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    stmt = (
        select(RuleMatchLog, Rule.name, RuleSet.name)
        .join(Rule, Rule.id == RuleMatchLog.rule_id)
        .join(RuleSet, RuleSet.id == RuleMatchLog.rule_set_id)
        .order_by(RuleMatchLog.matched_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if not include_suppressed:
        stmt = stmt.where(RuleMatchLog.suppressed == False)
    if event_type:
        stmt = stmt.where(RuleMatchLog.event_type == event_type)
    if rule_id:
        try:
            parsed_rule_id = uuid.UUID(rule_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid rule_id") from exc
        stmt = stmt.where(RuleMatchLog.rule_id == parsed_rule_id)
    if rule_set_id:
        try:
            parsed_rule_set_id = uuid.UUID(rule_set_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid rule_set_id") from exc
        stmt = stmt.where(RuleMatchLog.rule_set_id == parsed_rule_set_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            RuleMatchLog.order_id.cast(String).ilike(like)
            | RuleMatchLog.rule_id.cast(String).ilike(like)
            | RuleMatchLog.rule_set_id.cast(String).ilike(like)
        )
    if start:
        try:
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid start") from exc
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        stmt = stmt.where(RuleMatchLog.matched_at >= start_dt)
    if end:
        try:
            end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid end") from exc
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        stmt = stmt.where(RuleMatchLog.matched_at <= end_dt)
    if range and range != "all":
        now = datetime.now(timezone.utc)
        if range == "24h":
            since = now - timedelta(hours=24)
        elif range == "7d":
            since = now - timedelta(days=7)
        else:
            since = now - timedelta(days=30)
        stmt = stmt.where(RuleMatchLog.matched_at >= since)
    if not is_admin_user(user):
        stmt = stmt.where(RuleMatchLog.user_id == user.id)
    rows = (await db.execute(stmt)).all()
    return [
        RuleMatchLogOut(
            id=r[0].id,
            rule_id=str(r[0].rule_id),
            rule_set_id=str(r[0].rule_set_id),
            rule_name=r[1],
            rule_set_name=r[2],
            order_id=str(r[0].order_id),
            session_id=str(r[0].session_id),
            event_id=r[0].event_id,
            user_id=str(r[0].user_id),
            event_type=r[0].event_type,
            conditions=r[0].conditions or {},
            metrics=r[0].metrics_json or {},
            action=r[0].action,
            suppressed=r[0].suppressed,
            note=r[0].note,
            matched_at=r[0].matched_at,
        )
        for r in rows
    ]

@router.patch("/sets/{set_id}", response_model=RuleSetOut)
async def update_rule_set(
    set_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_set_id = _parse_set_id(set_id)
    rule_set = (
        await db.execute(select(RuleSet).where(RuleSet.id == parsed_set_id))
    ).scalar_one_or_none()
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    if not can_edit_rule_set(
        {"id": str(user.id), "is_admin": is_admin_user(user)},
        {"owner_user_id": str(rule_set.owner_user_id), "scope": rule_set.scope},
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    rule_set.name = payload.get("name", rule_set.name)
    rule_set.description = payload.get("description", rule_set.description)
    if "enabled" in payload:
        rule_set.enabled = bool(payload.get("enabled"))
    await log_action(db, user.id, "ruleset.update", "ruleset", str(rule_set.id))
    await db.commit()
    return RuleSetOut(
        id=str(rule_set.id),
        name=rule_set.name,
        description=rule_set.description,
        enabled=rule_set.enabled,
        scope=rule_set.scope,
    )

@router.post("/sets/{set_id}/rules", response_model=RuleOut)
async def create_rule(
    set_id: str,
    payload: RuleCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_set_id = _parse_set_id(set_id)
    rule_set = (
        await db.execute(select(RuleSet).where(RuleSet.id == parsed_set_id))
    ).scalar_one_or_none()
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    if not can_edit_rule_set(
        {"id": str(user.id), "is_admin": is_admin_user(user)},
        {"owner_user_id": str(rule_set.owner_user_id), "scope": rule_set.scope},
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    conditions = payload.conditions
    dsl_json = payload.dsl_json
    if dsl_json:
        try:
            validate_dsl(dsl_json)
            conditions = dsl_to_conditions(dsl_json)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    rule = Rule(
        rule_set_id=rule_set.id,
        name=payload.name,
        enabled=payload.enabled,
        priority=payload.priority,
        event_type=payload.event_type,
        conditions=conditions,
        dsl_json=dsl_json,
        action=payload.action,
        action_params=payload.action_params,
        cooldown_sec=payload.cooldown_sec,
    )
    db.add(rule)
    await db.flush()
    await log_action(db, user.id, "rule.create", "rule", str(rule.id))
    await db.commit()
    return RuleOut(
        id=str(rule.id),
        rule_set_id=str(rule.rule_set_id),
        name=rule.name,
        enabled=rule.enabled,
        priority=rule.priority,
        event_type=rule.event_type,
        conditions=rule.conditions or {},
        dsl_json=rule.dsl_json,
        action=rule.action,
        action_params=rule.action_params or {},
        cooldown_sec=rule.cooldown_sec,
    )

@router.get("/sets/{set_id}/rules", response_model=list[RuleOut])
async def list_rules(
    set_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_set_id = _parse_set_id(set_id)
    rule_set = (
        await db.execute(select(RuleSet).where(RuleSet.id == parsed_set_id))
    ).scalar_one_or_none()
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    if rule_set.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.execute(select(Rule).where(Rule.rule_set_id == rule_set.id).order_by(Rule.priority.asc()))
    ).scalars().all()
    return [
        RuleOut(
            id=str(r.id),
            rule_set_id=str(r.rule_set_id),
            name=r.name,
            enabled=r.enabled,
            priority=r.priority,
            event_type=r.event_type,
            conditions=r.conditions or {},
            dsl_json=r.dsl_json,
            action=r.action,
            action_params=r.action_params or {},
            cooldown_sec=r.cooldown_sec,
        )
        for r in rows
    ]

@router.patch("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_rule_id = _parse_rule_id(rule_id)
    rule = (
        await db.execute(select(Rule).where(Rule.id == parsed_rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_set = (
        await db.execute(select(RuleSet).where(RuleSet.id == rule.rule_set_id))
    ).scalar_one_or_none()
    if not rule_set or not can_edit_rule_set(
        {"id": str(user.id), "is_admin": is_admin_user(user)},
        {"owner_user_id": str(rule_set.owner_user_id), "scope": rule_set.scope},
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    rule.name = payload.get("name", rule.name)
    if "enabled" in payload:
        rule.enabled = bool(payload.get("enabled"))
    if "priority" in payload:
        rule.priority = int(payload.get("priority"))
    if "event_type" in payload:
        rule.event_type = payload.get("event_type")
    if "conditions" in payload:
        rule.conditions = payload.get("conditions") or {}
    if "dsl_json" in payload:
        dsl_json = payload.get("dsl_json")
        if dsl_json:
            try:
                validate_dsl(dsl_json)
                rule.conditions = dsl_to_conditions(dsl_json)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        rule.dsl_json = dsl_json
    if "action" in payload:
        rule.action = payload.get("action")
    if "action_params" in payload:
        rule.action_params = payload.get("action_params") or {}
    if "cooldown_sec" in payload:
        rule.cooldown_sec = int(payload.get("cooldown_sec"))
    await log_action(db, user.id, "rule.update", "rule", str(rule.id))
    await db.commit()
    return RuleOut(
        id=str(rule.id),
        rule_set_id=str(rule.rule_set_id),
        name=rule.name,
        enabled=rule.enabled,
        priority=rule.priority,
        event_type=rule.event_type,
        conditions=rule.conditions or {},
        dsl_json=rule.dsl_json,
        action=rule.action,
        action_params=rule.action_params or {},
        cooldown_sec=rule.cooldown_sec,
    )

@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_rule_id = _parse_rule_id(rule_id)
    rule = (
        await db.execute(select(Rule).where(Rule.id == parsed_rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_set = (
        await db.execute(select(RuleSet).where(RuleSet.id == rule.rule_set_id))
    ).scalar_one_or_none()
    if not rule_set or not can_edit_rule_set(
        {"id": str(user.id), "is_admin": is_admin_user(user)},
        {"owner_user_id": str(rule_set.owner_user_id), "scope": rule_set.scope},
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.delete(rule)
    await log_action(db, user.id, "rule.delete", "rule", str(rule.id))
    await db.commit()
    return {"ok": True}
