import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock
from fastapi import HTTPException

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache._calls = 0

def _invalidate_report_caches_stub(*_args, **_kwargs):
    app_core_cache._calls += 1

app_core_cache.invalidate_report_caches = _invalidate_report_caches_stub
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_core_security = types.ModuleType("app.core.security")
app_core_security.get_current_user = lambda: None
app_core_security.is_admin_user = lambda *_: False
sys.modules["app.core.security"] = app_core_security

app_core_db = types.ModuleType("app.core.db")
async def _get_db():
    yield None
app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_ws = types.ModuleType("app.core.ws")
app_core_ws.broadcast_event = AsyncMock()
sys.modules["app.core.ws"] = app_core_ws

app_core = types.ModuleType("app.core")
app_core.ws = app_core_ws
sys.modules["app.core"] = app_core

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_device_payload = lambda *_: {}
app_services_ws.build_event_payload = lambda *_: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

app_services_config = types.ModuleType("app.services.config_service")
app_services_config.apply_device_preset = lambda *_: None
app_services_config.merge_device_config = lambda cfg, payload, replace=False: payload
app_services_config.build_device_config = lambda device: {
    "device_id": str(getattr(device, "id", "")),
    "sensitivity": {
        "min_motion_score": ((getattr(device, "config_json", {}) or {}).get("sensitivity") or {}).get("min_motion_score", 5000),
        "max_weight_drop": ((getattr(device, "config_json", {}) or {}).get("sensitivity") or {}).get("max_weight_drop", -300),
    },
    "config_version": "v-test",
}
sys.modules["app.services.config_service"] = app_services_config

app_schemas = types.ModuleType("app.schemas.schemas")
try:
    from pydantic import BaseModel
except Exception:
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

class _DeviceOut(BaseModel):
    id: str | None = None
    name: str | None = None
    device_type: str | None = None
    status: str | None = None
    device_code: str | None = None

class _DeviceRegister(BaseModel):
    device_code: str | None = None
    name: str | None = None
    device_type: str | None = None

app_schemas.DeviceOut = _DeviceOut
app_schemas.DeviceRegister = _DeviceRegister
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
sys.modules["app.models.entities"] = app_models

sqlalchemy = types.ModuleType("sqlalchemy")
class _SelectStub:
    def where(self, *_args, **_kwargs):
        return self
sqlalchemy.select = lambda *_args, **_kwargs: _SelectStub()
sys.modules["sqlalchemy"] = sqlalchemy

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext

sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_asyncio.AsyncSession = object
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio

app_services = types.ModuleType("app.services")
sys.modules["app.services"] = app_services

app_module = types.ModuleType("app")
app_module.core = app_core
app_module.services = app_services
sys.modules["app"] = app_module

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "devices.py")

def load_module():
    sys.modules["app.core.cache_invalidation"] = app_core_cache
    sys.modules["app.core.security"] = app_core_security
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.ws"] = app_core_ws
    sys.modules["app.core"] = app_core
    sys.modules["app.services.ws_payloads"] = app_services_ws
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.services.config_service"] = app_services_config
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["app.models.entities"] = app_models
    sys.modules["sqlalchemy"] = sqlalchemy
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    sys.modules["app.services"] = app_services
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("devices_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class ReportCacheInvalidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_device_invalidates_report_cache(self):
        module = load_module()
        db = types.SimpleNamespace(add=lambda *_: None, commit=AsyncMock())
        user = types.SimpleNamespace(id="u1")
        payload = types.SimpleNamespace(device_code=None, name="d1", device_type="cam")
        await module.register_device(payload=payload, db=db, user=user)
        self.assertEqual(app_core_cache._calls, 1)

    async def test_get_device_returns_effective_config(self):
        module = load_module()
        device = _EdgeDevice(
            id="dev-1",
            owner_user_id="u1",
            name="Cam 1",
            device_type="cam",
            status="online",
            config_json={"sensitivity": {"min_motion_score": 6200, "max_weight_drop": -260}},
            last_seen_at=None,
        )

        class _Result:
            def scalar_one_or_none(self):
                return device

        class _DB:
            async def execute(self, *_args, **_kwargs):
                return _Result()

        result = await module.get_device(device_id="00000000-0000-0000-0000-000000000001", db=_DB(), user=types.SimpleNamespace(id="u1"))
        self.assertEqual(result["config"]["config_version"], "v-test")
        self.assertEqual(result["config"]["sensitivity"]["min_motion_score"], 6200)

    async def test_update_device_config_returns_effective_config(self):
        module = load_module()
        device = _EdgeDevice(
            id="dev-2",
            owner_user_id="u1",
            name="Cam 2",
            device_type="cam",
            status="online",
            config_json={"sensitivity": {"min_motion_score": 5000, "max_weight_drop": -300}},
            last_seen_at=None,
        )

        class _Result:
            def scalar_one_or_none(self):
                return device

        class _DB:
            commit = AsyncMock()
            async def execute(self, *_args, **_kwargs):
                return _Result()

        result = await module.update_device_config(
            device_id="00000000-0000-0000-0000-000000000002",
            payload={"sensitivity": {"min_motion_score": 7100, "max_weight_drop": -240}},
            replace=False,
            db=_DB(),
            user=types.SimpleNamespace(id="u1"),
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["config"]["config_version"], "v-test")
        self.assertEqual(result["config"]["sensitivity"]["min_motion_score"], 7100)

    async def test_list_devices_all_requires_admin(self):
        module = load_module()

        class _Scalars:
            def all(self):
                return []

        class _Result:
            def scalars(self):
                return _Scalars()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                return _Result()

        with self.assertRaises(HTTPException) as ctx:
            await module.list_devices(
                all=True,
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Admin only")

    async def test_get_device_forbidden_for_other_user(self):
        module = load_module()
        device = _EdgeDevice(
            id="dev-3",
            owner_user_id="owner-a",
            name="Cam 3",
            device_type="cam",
            status="online",
            config_json={},
            last_seen_at=None,
        )

        class _Result:
            def scalar_one_or_none(self):
                return device

        class _DB:
            async def execute(self, *_args, **_kwargs):
                return _Result()

        with self.assertRaises(HTTPException) as ctx:
            await module.get_device(
                device_id="00000000-0000-0000-0000-000000000003",
                db=_DB(),
                user=types.SimpleNamespace(id="user-b"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_get_device_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.get_device(
                device_id="not-a-uuid",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_update_device_config_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.update_device_config(
                device_id="bad-device-id",
                payload={"sensitivity": {"min_motion_score": 1}},
                replace=False,
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_update_device_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.update_device(
                device_id="bad-device-id",
                payload={"name": "rename"},
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_device_health_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.device_health(
                device_id="bad-device-id",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

    async def test_apply_preset_rejects_invalid_device_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid device id")

        with self.assertRaises(HTTPException) as ctx:
            await module.apply_preset(
                device_id="bad-device-id",
                payload={"preset": "balanced"},
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid device_id")

if __name__ == "__main__":
    unittest.main()
