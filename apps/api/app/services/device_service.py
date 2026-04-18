import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import EdgeDevice

DEV_CODE_PREFIX = "dev-device-"

async def get_or_create_dev_device(db: AsyncSession, owner_user_id: uuid.UUID) -> EdgeDevice:
    code = f"{DEV_CODE_PREFIX}{owner_user_id.hex[:6]}"
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.device_code == code))
    device = result.scalar_one_or_none()
    if device:
        return device
    device = EdgeDevice(
        id=uuid.uuid4(),
        owner_user_id=owner_user_id,
        device_code=code,
        name="Dev Device",
        device_type="dev",
        status="online",
        config_json={},
    )
    db.add(device)
    await db.flush()
    return device
