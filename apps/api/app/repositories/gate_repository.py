from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Order, PickupCode, PickupConfirmation, WhitelistProfile


@dataclass(frozen=True)
class GateVerificationRow:
    confirmation: PickupConfirmation
    order: Order


async def get_order(db: AsyncSession, order_id) -> Order | None:
    return (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()


async def get_pickup_code(db: AsyncSession, code: str) -> PickupCode | None:
    return (await db.execute(select(PickupCode).where(PickupCode.code == code))).scalar_one_or_none()


async def get_active_pickup_code(
    db: AsyncSession,
    *,
    order_id,
    now: datetime,
) -> PickupCode | None:
    return (
        await db.execute(
            select(PickupCode)
            .where(PickupCode.order_id == order_id)
            .where(PickupCode.used_at.is_(None))
            .where(PickupCode.expires_at > now)
            .order_by(PickupCode.created_at.desc())
        )
    ).scalar_one_or_none()


async def get_gate_profile(db: AsyncSession, user_id) -> WhitelistProfile | None:
    return (
        await db.execute(
            select(WhitelistProfile)
            .where(WhitelistProfile.user_id == user_id)
            .where(WhitelistProfile.method_type == "gate_code")
            .order_by(WhitelistProfile.created_at.desc())
        )
    ).scalar_one_or_none()


async def list_recent_verifications(
    db: AsyncSession,
    *,
    operator_user_id,
    limit: int,
) -> Sequence[GateVerificationRow]:
    rows = (
        await db.execute(
            select(PickupConfirmation, Order)
            .join(Order, PickupConfirmation.order_id == Order.id)
            .where(PickupConfirmation.confirmed_by_user_id == operator_user_id)
            .where(PickupConfirmation.confirm_method == "gate_entry")
            .order_by(PickupConfirmation.confirmed_at.desc())
            .limit(limit)
        )
    ).all()
    return [GateVerificationRow(confirmation=confirmation, order=order) for confirmation, order in rows]
