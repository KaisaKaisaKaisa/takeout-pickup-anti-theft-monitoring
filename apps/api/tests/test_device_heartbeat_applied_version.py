import importlib.util
import os
import sys
import types
import unittest
import uuid
from fastapi import HTTPException
from unittest.mock import AsyncMock

app_core_db = types.ModuleType("app.core.db")


async def _get_db():
    yield None


app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *_: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_core_ws = types.ModuleType("app.core.ws")
app_core_ws.broadcast_event = AsyncMock()
sys.modules["app.core.ws"] = app_core_ws

app_core = types.ModuleType("app.core")
app_core.ws = app_core_ws
sys.modules["app.core"] = app_core

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine.evaluate_sensor_event = AsyncMock(return_value=None)
sys.modules["app.services.alert_engine"] = app_services_alert_engine

app_services_push = types.ModuleType("app.services.push_service")
app_services_push.send_alert_push = AsyncMock()
sys.modules["app.services.push_service"] = app_services_push

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_device_payload = lambda *_: {}
app_services_ws.build_event_payload = lambda *_: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_services_config = types.ModuleType("app.services.config_service")
app_services_config.build_device_config = lambda *_: {}
sys.modules["app.services.config_service"] = app_services_config

app_services_alert_service = types.ModuleType("app.services.alert_service")
app_services_alert_service.emit_alert_event = AsyncMock()
sys.modules["app.services.alert_service"] = app_services_alert_service

app_schemas = types.ModuleType("app.schemas.schemas")

try:
    from pydantic import BaseModel
except Exception:
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class _EdgeEventIn(BaseModel):
    eventType: str | None = None
    severity: str | None = None
    metrics: dict | None = None
    eventTime: str | None = None


app_schemas.EdgeEventIn = _EdgeEventIn
sys.modules["app.schemas.schemas"] = app_schemas

app_models = types.ModuleType("app.models.entities")


class _EdgeDevice:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    class _Col:
        def __eq__(self, *_args, **_kwargs):
            return True

    id = _Col()


app_models.EdgeDevice = _EdgeDevice
app_models.MonitoringSession = object
app_models.SensorEvent = object
app_models.Order = object
sys.modules["app.models.entities"] = app_models

sqlalchemy_module = types.ModuleType("sqlalchemy")


class _SelectStub:
    def where(self, *_args, **_kwargs):
        return self


def _select_stub(*_args, **_kwargs):
    return _SelectStub()


sqlalchemy_module.select = _select_stub
sys.modules["sqlalchemy"] = sqlalchemy_module

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext

sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_asyncio.AsyncSession = object
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "edge_ingest.py")


def load_module():
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.cache_invalidation"] = app_core_cache
    sys.modules["app.core.ws"] = app_core_ws
    sys.modules["app.core"] = app_core
    sys.modules["app.services.alert_engine"] = app_services_alert_engine
    sys.modules["app.services.push_service"] = app_services_push
    sys.modules["app.services.ws_payloads"] = app_services_ws
    sys.modules["app.services.config_service"] = app_services_config
    sys.modules["app.services.alert_service"] = app_services_alert_service
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["app.models.entities"] = app_models
    sys.modules["sqlalchemy"] = sqlalchemy_module
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    spec = importlib.util.spec_from_file_location("edge_ingest", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Result:
    def __init__(self, device):
        self._device = device

    def scalar_one_or_none(self):
        return self._device


class _DB:
    def __init__(self, device):
        self.device = device
        self.commit = AsyncMock()

    async def execute(self, *_args, **_kwargs):
        return _Result(self.device)


class HeartbeatAppliedVersionTests(unittest.IsolatedAsyncioTestCase):
    async def test_applied_version_recorded(self):
        module = load_module()
        device = _EdgeDevice(
            id=uuid.uuid4(),
            device_code="dev-1",
            status="offline",
            last_seen_at=None,
            config_json={},
            owner_user_id="u1",
        )
        db = _DB(device)
        payload = {"applied_config_version": "v1"}
        await module.heartbeat(device_id=str(device.id), payload=payload, db=db, x_device_code="dev-1")
        self.assertEqual(device.config_json.get("last_applied_version"), "v1")
        self.assertIn("last_applied_at", device.config_json)

    async def test_get_device_config_rejects_invalid_device_code(self):
        module = load_module()
        device = _EdgeDevice(
            id=uuid.uuid4(),
            device_code="dev-1",
            status="online",
            last_seen_at=None,
            config_json={},
            owner_user_id="u1",
        )
        db = _DB(device)
        with self.assertRaises(HTTPException) as ctx:
            await module.get_device_config(
                device_id=str(device.id),
                db=db,
                x_device_code="wrong-code",
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Invalid device code")

    async def test_get_device_config_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.get_device_config(
                device_id="bad-device-id",
                db=_DB(),
                x_device_code="dev-1",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_heartbeat_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.heartbeat(
                device_id="bad-device-id",
                payload={"applied_config_version": "v1"},
                db=_DB(),
                x_device_code="dev-1",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_ingest_event_rejects_invalid_session_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid session id")

        with self.assertRaises(HTTPException) as ctx:
            await module.ingest_event(
                session_id="bad-session-id",
                event=types.SimpleNamespace(
                    eventType="motion",
                    severity="high",
                    metrics={"motion_score": 1800},
                    eventTime="2026-03-17T10:00:00Z",
                ),
                db=_DB(),
                x_device_code="dev-1",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid session_id")


if __name__ == "__main__":
    unittest.main()
