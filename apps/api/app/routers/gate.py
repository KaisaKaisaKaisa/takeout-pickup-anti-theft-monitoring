from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user
from app.schemas.schemas import (
    ErrorOut,
    GateVerificationListOut,
    GateVerificationOut,
    GateVerifyIn,
    GateVerifyOut,
    PickupCodeOut,
)
from app.services import gate_application
from app.services.gate_application import (
    OrderForbiddenError,
    OrderNotFoundError,
    PickupCodeExpiredError,
    PickupCodeNotFoundError,
    PickupCodeUsedError,
)

router = APIRouter()

ERROR_RESPONSES = {
    400: {"model": ErrorOut},
    403: {"model": ErrorOut},
    404: {"model": ErrorOut},
}


@router.post("/orders/{order_id}/pickup-code", response_model=PickupCodeOut, responses=ERROR_RESPONSES)
async def issue_pickup_code(
    order_id: str,
    ttl_minutes: int = Query(30, ge=1, le=240),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        pickup = await gate_application.issue_pickup_code(
            db,
            user.id,
            order_id,
            ttl_minutes=ttl_minutes,
        )
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return PickupCodeOut(code=pickup.code, expires_at=pickup.expires_at)


@router.post("/verify-code", response_model=GateVerifyOut, responses=ERROR_RESPONSES)
async def verify_code(
    payload: GateVerifyIn,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        result = await gate_application.verify_gate_code(
            db,
            code=payload.code,
            operator_user_id=user.id,
            gate_name=payload.gate_name,
        )
    except PickupCodeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PickupCodeUsedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PickupCodeExpiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GateVerifyOut(
        ok=result.ok,
        order_id=str(result.order.id),
        order_status=result.order.status,
        merchant_name=result.order.merchant_name,
        item_summary=result.order.item_summary,
        confirmation_id=result.confirmation_id,
        gate_name=result.gate_name,
        verified_at=result.verified_at,
    )


@router.get("/recent-verifications", response_model=GateVerificationListOut)
async def recent_verifications(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    records = await gate_application.recent_verifications(db, user.id, limit=limit)
    return GateVerificationListOut(
        verifications=[
            GateVerificationOut(
                order_id=str(record.order.id),
                merchant_name=record.order.merchant_name,
                item_summary=record.order.item_summary,
                confirm_method=record.confirmation.confirm_method,
                gate_name=record.gate_name,
                confirmed_at=record.confirmation.confirmed_at,
            )
            for record in records
        ]
    )
