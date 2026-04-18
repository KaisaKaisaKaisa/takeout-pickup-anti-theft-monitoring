from fastapi import APIRouter
from app.core.config import settings
from app.services.config_service import DEVICE_PRESETS

router = APIRouter()

@router.get("/config")
async def get_config():
    return {
        "vapidPublicKey": settings.vapid_public_key,
        "devicePresets": list(DEVICE_PRESETS.keys()),
    }
