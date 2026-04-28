from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Order, PickupCode, PickupConfirmation, WhitelistProfile
from app.repositories import gate_repository
from app.services.audit_service import log_action
from app.services.device_service import get_or_create_dev_device
from app.services.session_service import create_confirmed_session, find_latest_session


class GateApplicationError(Exception):
    pass


class PickupCodeNotFoundError(GateApplicationError):
    pass


class PickupCodeUsedError(GateApplicationError):
    pass


class PickupCodeExpiredError(GateApplicationError):
    pass


class OrderNotFoundError(GateApplicationError):
    pass


class OrderForbiddenError(GateApplicationError):
    pass


@dataclass(frozen=True)
class GateVerifyResult:
    ok: bool
    order: Order
    confirmation_id: str
    gate_name: str | None = None
    verified_at: datetime | None = None


@dataclass(frozen=True)
class GateVerificationRecord:
    order: Order
    confirmation: PickupConfirmation
    gate_name: str | None = None


def parse_gate_name(note: str | None) -> str | None:
    if note and note.startswith("gate="):
        return note.replace("gate=", "", 1)
    return None


async def _gate_profile(db: AsyncSession, user_id) -> WhitelistProfile:
    profile = await gate_repository.get_gate_profile(db, user_id)
    if profile:
        return profile
    profile = WhitelistProfile(
        id=uuid.uuid4(),
        user_id=user_id,
        name="本人取餐码",
        relation="self",
        method_type="gate_code",
        enabled=True,
    )
    db.add(profile)
    return profile


async def issue_pickup_code(
    db: AsyncSession,
    user_id,
    order_id: str,
    *,
    ttl_minutes: int = 30,
) -> PickupCode:
    order = await gate_repository.get_order(db, uuid.UUID(order_id))
    if not order:
        raise OrderNotFoundError("Order not found")
    if order.user_id != user_id:
        raise OrderForbiddenError("Forbidden")

    now = datetime.now(timezone.utc)
    existing = await gate_repository.get_active_pickup_code(db, order_id=order.id, now=now)
    if existing:
        return existing

    profile = await _gate_profile(db, user_id)
    code = uuid.uuid4().hex[:6].upper()
    pickup = PickupCode(
        id=uuid.uuid4(),
        user_id=order.user_id,
        whitelist_profile_id=profile.id,
        order_id=order.id,
        code=code,
        expires_at=now + timedelta(minutes=ttl_minutes),
    )
    db.add(pickup)
    await log_action(db, user_id, "pickup.code_issued", "order", str(order.id), {"source": "gate"})
    await db.commit()
    return pickup


async def verify_gate_code(
    db: AsyncSession,
    *,
    code: str,
    operator_user_id,
    gate_name: str | None = None,
) -> GateVerifyResult:
    normalized_code = code.strip().upper()
    code_row = await gate_repository.get_pickup_code(db, normalized_code)
    if not code_row:
        raise PickupCodeNotFoundError("Invalid code")
    if code_row.used_at:
        raise PickupCodeUsedError("Code already used")
    now = datetime.now(timezone.utc)
    if code_row.expires_at < now:
        raise PickupCodeExpiredError("Code expired")

    order = await gate_repository.get_order(db, code_row.order_id)
    if order is None:
        raise OrderNotFoundError("Order not found")
    latest = await find_latest_session(db, order.id)
    if latest is None:
        device = await get_or_create_dev_device(db, order.user_id)
        latest = await create_confirmed_session(db, order, device, confirmed_at=now)
    confirmation = PickupConfirmation(
        id=uuid.uuid4(),
        order_id=order.id,
        session_id=latest.id if latest else None,
        confirmed_by_user_id=operator_user_id,
        whitelist_profile_id=code_row.whitelist_profile_id,
        confirm_method="gate_entry",
        note=f"gate={gate_name}" if gate_name else "gate=default",
    )
    db.add(confirmation)
    code_row.used_at = now
    await log_action(
        db,
        operator_user_id,
        "gate.code_verified",
        "order",
        str(order.id),
        {"code": normalized_code, "gate": gate_name},
    )
    await db.commit()
    return GateVerifyResult(
        ok=True,
        order=order,
        confirmation_id=str(confirmation.id),
        gate_name=gate_name,
        verified_at=now,
    )


async def recent_verifications(
    db: AsyncSession,
    operator_user_id,
    *,
    limit: int = 20,
) -> list[GateVerificationRecord]:
    rows = await gate_repository.list_recent_verifications(db, operator_user_id=operator_user_id, limit=limit)
    return [
        GateVerificationRecord(
            order=row.order,
            confirmation=row.confirmation,
            gate_name=parse_gate_name(row.confirmation.note),
        )
        for row in rows
    ]
