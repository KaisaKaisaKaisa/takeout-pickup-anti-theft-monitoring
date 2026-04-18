from datetime import datetime
from pydantic import BaseModel, Field

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
