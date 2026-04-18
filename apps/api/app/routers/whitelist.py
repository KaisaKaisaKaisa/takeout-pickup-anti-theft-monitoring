import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.entities import WhitelistProfile, PickupCode, Order, PickupConfirmation, MonitoringSession
from app.schemas.schemas import WhitelistCreate, WhitelistOut, PickupCodeOut, VerifyPickupCodeIn
from app.core.security import get_current_user
from app.services.audit_service import log_action
from app.services.order_state import apply_order_status, InvalidStatusTransition
from app.services.session_service import find_latest_session, create_confirmed_session

router = APIRouter()

@router.get("", response_model=list[WhitelistOut])
async def list_whitelist(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(WhitelistProfile).where(WhitelistProfile.user_id == user.id))
    profiles = result.scalars().all()
    return [
        WhitelistOut(
            id=str(p.id),
            name=p.name,
            relation=p.relation,
            method_type=p.method_type,
            enabled=p.enabled,
        )
        for p in profiles
    ]

@router.post("", response_model=WhitelistOut)
async def create_whitelist(
    payload: WhitelistCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    profile = WhitelistProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        relation=payload.relation,
        method_type=payload.method_type,
        enabled=True,
    )
    db.add(profile)
    await log_action(db, user.id, "whitelist.created", "whitelist", str(profile.id))
    await db.commit()
    return WhitelistOut(
        id=str(profile.id),
        name=profile.name,
        relation=profile.relation,
        method_type=profile.method_type,
        enabled=profile.enabled,
    )

@router.post("/{profile_id}/issue-code", response_model=PickupCodeOut)
async def issue_code(
    profile_id: str,
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    profile_uuid = uuid.UUID(profile_id)
    order_uuid = uuid.UUID(order_id)

    profile = (
        await db.execute(select(WhitelistProfile).where(WhitelistProfile.id == profile_uuid))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    order = (
        await db.execute(select(Order).where(Order.id == order_uuid))
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    code = uuid.uuid4().hex[:6].upper()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    pickup = PickupCode(
        id=uuid.uuid4(),
        user_id=order.user_id,
        whitelist_profile_id=profile.id,
        order_id=order.id,
        code=code,
        expires_at=expires_at,
    )
    db.add(pickup)
    await log_action(db, user.id, "pickup.code_issued", "order", str(order.id))
    await db.commit()
    return PickupCodeOut(code=code, expires_at=expires_at)

@router.post("/verify-code")
async def verify_code(payload: VerifyPickupCodeIn, db: AsyncSession = Depends(get_db)):
    code_row = (
        await db.execute(select(PickupCode).where(PickupCode.code == payload.code))
    ).scalar_one_or_none()
    if not code_row:
        raise HTTPException(status_code=404, detail="Invalid code")
    if code_row.used_at:
        raise HTTPException(status_code=400, detail="Code already used")
    if code_row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")

    order = (
        await db.execute(select(Order).where(Order.id == code_row.order_id))
    ).scalar_one()
    try:
        await apply_order_status(db, order, "picked_up", source="pickup_code", raw_payload={})
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    sessions = (
        await db.execute(select(MonitoringSession).where(MonitoringSession.order_id == order.id))
    ).scalars().all()
    for s in sessions:
        s.state = "confirmed"

    latest = await find_latest_session(db, order.id)
    session_id = latest.id if latest else None
    if session_id is None:
        from app.services.device_service import get_or_create_dev_device
        device = await get_or_create_dev_device(db, order.user_id)
        session = await create_confirmed_session(db, order, device, confirmed_at=datetime.now(timezone.utc))
        session_id = session.id

    confirmation = PickupConfirmation(
        id=uuid.uuid4(),
        order_id=order.id,
        session_id=session_id,
        confirmed_by_user_id=None,
        whitelist_profile_id=code_row.whitelist_profile_id,
        confirm_method="pickup_code",
        note="confirmed by code",
    )
    db.add(confirmation)

    code_row.used_at = datetime.now(timezone.utc)
    await log_action(db, None, "pickup.code_verified", "order", str(order.id), {"code": payload.code})
    await db.commit()
    return {"ok": True, "order_id": str(order.id)}
