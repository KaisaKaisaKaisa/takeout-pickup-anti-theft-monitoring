from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/takeout_guard",
        validation_alias="DB_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    object_store: str = Field(default="minio", validation_alias="OBJECT_STORE")
    environment: str = Field(default="local", validation_alias="ENVIRONMENT")
    local_media_root: str = Field(default="storage", validation_alias="LOCAL_MEDIA_ROOT")
    vapid_public_key: str = Field(default="", validation_alias="VAPID_PUBLIC_KEY")
    vapid_private_key: str = Field(default="", validation_alias="VAPID_PRIVATE_KEY")
    vapid_email: str = Field(default="mailto:dev@example.com", validation_alias="VAPID_EMAIL")
    jwt_secret: str = Field(default="dev-secret", validation_alias="JWT_SECRET")
    device_offline_sec: int = Field(default=60, validation_alias="DEVICE_OFFLINE_SEC")
    provider_webhook_secret: str = Field(default="", validation_alias="PROVIDER_WEBHOOK_SECRET")
    provider_webhook_secrets: str = Field(default="", validation_alias="PROVIDER_WEBHOOK_SECRETS")
    provider_webhook_ttl_sec: int = Field(default=300, validation_alias="PROVIDER_WEBHOOK_TTL_SEC")
    admin_phones: str = Field(default="", validation_alias="ADMIN_PHONES")
    default_min_motion_score: int = Field(default=5000, validation_alias="DEFAULT_MIN_MOTION_SCORE")
    default_max_weight_drop: int = Field(default=-200, validation_alias="DEFAULT_MAX_WEIGHT_DROP")
    default_alert_cooldown_sec: int = Field(default=120, validation_alias="DEFAULT_ALERT_COOLDOWN_SEC")
    run_background_tasks: bool = Field(default=True, validation_alias="RUN_BACKGROUND_TASKS")

    class Config:
        env_file = ".env"

settings = Settings()
