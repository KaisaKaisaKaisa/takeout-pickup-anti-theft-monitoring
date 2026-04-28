from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

class OkOut(BaseModel):
    ok: bool = True

class ErrorOut(BaseModel):
    ok: bool = False
    detail: Any | None = None
    error: str | None = None
    request_id: str | None = None

class OrderCreate(BaseModel):
    provider: str = "manual"
    provider_order_id: str | None = None
    merchant_name: str | None = None
    item_summary: str | None = None
    expected_pickup_minutes: int | None = None

class OrderOut(BaseModel):
    id: str
    provider: str
    status: str
    merchant_name: str | None = None
    item_summary: str | None = None
    delivered_at: datetime | None = None
    expected_pickup_by: datetime | None = None
    latest_session_id: str | None = None

class OrderListOut(BaseModel):
    orders: list[OrderOut]

class OrderArmOut(BaseModel):
    session_id: str
    deduped: bool = False

class EdgeEventIn(BaseModel):
    eventType: str
    severity: str = "info"
    eventTime: datetime
    metrics: dict = Field(default_factory=dict)

class SessionOut(BaseModel):
    id: str
    order_id: str
    device_id: str
    state: str
    armed_at: datetime
    pickup_deadline_at: datetime
    presence_status: str
    sensitivity_config: dict
    false_alarm_count: int

class SessionListOut(BaseModel):
    sessions: list[SessionOut]

class SensorEventOut(BaseModel):
    id: int
    session_id: str
    device_id: str
    event_type: str
    severity: str
    metrics: dict
    event_time: datetime

class SensorEventListOut(BaseModel):
    events: list[SensorEventOut]

class AlertOut(BaseModel):
    id: str
    order_id: str
    alert_type: str
    level: str
    status: str
    triggered_at: datetime

class AlertListOut(BaseModel):
    alerts: list[AlertOut]

class AlertMediaOut(BaseModel):
    id: str
    type: str
    size: int
    download_url: str

class AlertDetailOut(BaseModel):
    id: str
    order_id: str
    alert_type: str
    level: str
    status: str
    summary: str | None = None
    triggered_at: datetime
    media: list[AlertMediaOut] = Field(default_factory=list)

class MediaOut(BaseModel):
    id: str
    order_id: str | None = None
    session_id: str | None = None
    incident_id: str | None = None
    media_type: str
    size_bytes: int
    content_type: str | None = None
    created_at: datetime
    download_url: str

class MediaMetadataOut(BaseModel):
    object_key: str
    path: str | None = None
    storage_provider: str | None = None
    bucket_name: str | None = None
    download_url: str | None = None
    sha256: str | None = None

class MediaDownloadUrlOut(BaseModel):
    download_url: str

class RuleSetCreate(BaseModel):
    name: str
    description: str | None = None
    enabled: bool = True
    scope: str = "user"

class RuleSetOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    enabled: bool
    scope: str

class RuleCreate(BaseModel):
    name: str
    enabled: bool = True
    priority: int = 100
    event_type: str
    conditions: dict = Field(default_factory=dict)
    dsl_json: dict | None = None
    action: str = "alert"
    action_params: dict = Field(default_factory=dict)
    cooldown_sec: int = 120

class RuleOut(BaseModel):
    id: str
    rule_set_id: str
    name: str
    enabled: bool
    priority: int
    event_type: str
    conditions: dict
    dsl_json: dict | None = None
    action: str
    action_params: dict
    cooldown_sec: int

class RuleMatchLogOut(BaseModel):
    id: int
    rule_id: str
    rule_set_id: str
    rule_name: str | None = None
    rule_set_name: str | None = None
    order_id: str
    session_id: str
    event_id: int | None = None
    user_id: str
    event_type: str
    conditions: dict
    metrics: dict
    action: str
    suppressed: bool
    note: str | None = None
    matched_at: datetime

class DeviceRegister(BaseModel):
    name: str
    device_type: str = "dev"
    device_code: str | None = None

class DeviceOut(BaseModel):
    id: str
    name: str
    device_type: str
    status: str
    device_code: str | None = None

class DeviceListOut(BaseModel):
    devices: list[DeviceOut]

class DeviceDetailOut(BaseModel):
    id: str
    name: str
    device_type: str
    status: str
    config: dict[str, Any] = Field(default_factory=dict)
    raw_config: dict[str, Any] = Field(default_factory=dict)
    last_seen_at: datetime | None = None

class DeviceConfigOut(BaseModel):
    ok: bool = True
    config: dict[str, Any] = Field(default_factory=dict)
    raw_config: dict[str, Any] = Field(default_factory=dict)

class DeviceHealthOut(BaseModel):
    last_seen_at: datetime | None = None
    status: str
    heartbeat: dict[str, Any] = Field(default_factory=dict)

class PushSubscriptionIn(BaseModel):
    platform: str
    endpoint: str
    p256dh: str | None = None
    auth: str | None = None
    device_fingerprint: str | None = None

class RegisterIn(BaseModel):
    phone: str
    name: str | None = None
    password: str

class LoginIn(BaseModel):
    phone: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class WhitelistCreate(BaseModel):
    name: str
    relation: str | None = None
    method_type: str = "pickup_code"

class WhitelistOut(BaseModel):
    id: str
    name: str
    relation: str | None = None
    method_type: str
    enabled: bool

class PickupCodeOut(BaseModel):
    code: str
    expires_at: datetime

class VerifyPickupCodeIn(BaseModel):
    code: str

class GateVerifyIn(BaseModel):
    code: str
    gate_name: str | None = None

class GateVerifyOut(BaseModel):
    ok: bool = True
    order_id: str
    order_status: str
    merchant_name: str | None = None
    item_summary: str | None = None
    confirmation_id: str
    gate_name: str | None = None
    verified_at: datetime

class GateVerificationOut(BaseModel):
    order_id: str
    merchant_name: str | None = None
    item_summary: str | None = None
    confirm_method: str
    gate_name: str | None = None
    confirmed_at: datetime

class GateVerificationListOut(BaseModel):
    verifications: list[GateVerificationOut]

class EvidenceGenerateOut(BaseModel):
    status: str
    bundle_id: str

class EvidenceOut(BaseModel):
    id: str
    status: str
    zip_media_id: str | None = None
    generated_at: datetime | None = None
