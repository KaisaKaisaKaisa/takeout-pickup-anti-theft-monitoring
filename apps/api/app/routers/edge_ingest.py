from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.schemas import EdgeEventIn
from app.services import edge_application
from app.services.edge_application import (
    DeviceAuthHeaders,
    DeviceNotFoundError,
    InvalidDeviceCodeError,
    InvalidDeviceIdError,
    InvalidSessionIdError,
    SessionNotFoundError,
)

router = APIRouter()


def _auth_headers(
    x_device_code: str | None,
    x_device_timestamp: str | None,
    x_device_nonce: str | None,
    x_device_signature: str | None,
) -> DeviceAuthHeaders:
    return DeviceAuthHeaders(
        x_device_code=x_device_code,
        x_device_timestamp=x_device_timestamp,
        x_device_nonce=x_device_nonce,
        x_device_signature=x_device_signature,
    )


@router.post("/devices/{device_id}/heartbeat")
async def heartbeat(
    device_id: str,
    payload: dict | None = None,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
    x_device_timestamp: str | None = Header(default=None),
    x_device_nonce: str | None = Header(default=None),
    x_device_signature: str | None = Header(default=None),
):
    try:
        return await edge_application.heartbeat(
            db=db,
            device_id=device_id,
            payload=payload,
            headers=_auth_headers(
                x_device_code,
                x_device_timestamp,
                x_device_nonce,
                x_device_signature,
            ),
        )
    except InvalidDeviceIdError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/devices/{device_id}/config")
async def get_device_config(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
    x_device_timestamp: str | None = Header(default=None),
    x_device_nonce: str | None = Header(default=None),
    x_device_signature: str | None = Header(default=None),
):
    try:
        return await edge_application.get_device_config(
            db=db,
            device_id=device_id,
            headers=_auth_headers(
                x_device_code,
                x_device_timestamp,
                x_device_nonce,
                x_device_signature,
            ),
        )
    except InvalidDeviceIdError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/events")
async def ingest_event(
    session_id: str,
    event: EdgeEventIn,
    db: AsyncSession = Depends(get_db),
    x_device_code: str | None = Header(default=None),
    x_device_timestamp: str | None = Header(default=None),
    x_device_nonce: str | None = Header(default=None),
    x_device_signature: str | None = Header(default=None),
):
    try:
        result = await edge_application.ingest_event(
            db=db,
            session_id=session_id,
            event=event,
            headers=_auth_headers(
                x_device_code,
                x_device_timestamp,
                x_device_nonce,
                x_device_signature,
            ),
        )
    except InvalidSessionIdError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidDeviceCodeError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"ok": result.ok, "alert_id": result.alert_id}
