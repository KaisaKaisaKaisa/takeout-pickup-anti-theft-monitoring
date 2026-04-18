import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import get_current_user, is_admin_user
from app.models.entities import EdgeDevice
from app.services.audit_service import log_action
from app.services.config_service import apply_device_preset, build_device_config, merge_device_config
from app.services.ws_payloads import build_device_payload, build_event_payload
from app.schemas.schemas import DeviceRegister, DeviceOut
from app.core.cache_invalidation import invalidate_report_caches

router = APIRouter()


def _parse_device_id(device_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid device_id") from exc

@router.post("/register", response_model=DeviceOut)
async def register_device(
    payload: DeviceRegister,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    device = EdgeDevice(
        id=uuid.uuid4(),
        owner_user_id=user.id,
        device_code=payload.device_code or f"dev-{uuid.uuid4().hex[:8]}",
        name=payload.name,
        device_type=payload.device_type,
        status="online",
        config_json={},
    )
    db.add(device)
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    device_payload = build_device_payload(device)
    await ws_hub.broadcast_event(
        "device.registered",
        {
            "device_id": str(device.id),
            "device": device_payload,
            **build_event_payload("device", device_payload),
        },
    )
    return DeviceOut(
        id=str(device.id),
        name=device.name,
        device_type=device.device_type,
        status=device.status,
        device_code=device.device_code,
    )

@router.get("")
async def list_devices(
    all: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if all and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin only")
    stmt = select(EdgeDevice)
    if not all:
        stmt = stmt.where(EdgeDevice.owner_user_id == user.id)
    result = await db.execute(stmt)
    devices = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "device_type": d.device_type,
            "status": d.status,
            "device_code": d.device_code,
        }
        for d in devices
    ]

@router.get("/{device_id}")
async def get_device(device_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": str(device.id),
        "name": device.name,
        "device_type": device.device_type,
        "status": device.status,
        "config": build_device_config(device),
        "raw_config": device.config_json or {},
        "last_seen_at": device.last_seen_at,
    }

@router.patch("/{device_id}")
async def update_device(device_id: str, payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    device.name = payload.get("name", device.name)
    device.status = payload.get("status", device.status)
    device.config_json = payload.get("config", device.config_json)
    await log_action(db, user.id, "device.update", "device", str(device.id))
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    device_payload = build_device_payload(device)
    await ws_hub.broadcast_event(
        "device.updated",
        {
            "device_id": str(device.id),
            "device": device_payload,
            **build_event_payload("device", device_payload),
        },
    )
    return {"ok": True}

@router.patch("/{device_id}/config")
async def update_device_config(
    device_id: str,
    payload: dict,
    replace: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    device.config_json = merge_device_config(device.config_json, payload, replace=replace)
    await log_action(db, user.id, "device.config.update", "device", str(device.id))
    await db.commit()
    invalidate_report_caches(user.id)
    from app.core import ws as ws_hub
    device_payload = build_device_payload(device)
    await ws_hub.broadcast_event(
        "device.config",
        {
            "device_id": str(device.id),
            "device": device_payload,
            **build_event_payload("device", device_payload),
        },
    )
    return {
        "ok": True,
        "config": build_device_config(device),
        "raw_config": device.config_json or {},
    }

@router.post("/{device_id}/apply-preset")
async def apply_preset(
    device_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    preset = payload.get("preset")
    if not preset:
        raise HTTPException(status_code=400, detail="Missing preset")
    try:
        apply_device_preset(device, preset)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unknown preset")
    await log_action(db, user.id, "device.preset.apply", "device", str(device.id))
    await db.commit()
    invalidate_report_caches(user.id)
    return {"ok": True, "preset": preset}

@router.get("/{device_id}/health")
async def device_health(device_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    parsed_device_id = _parse_device_id(device_id)
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == parsed_device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.owner_user_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "last_seen_at": device.last_seen_at,
        "status": device.status,
        "heartbeat": (device.config_json or {}).get("last_heartbeat", {}),
    }
