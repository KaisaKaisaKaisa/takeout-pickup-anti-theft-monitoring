import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock

from fastapi import HTTPException

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "alerts.py")

app_core_db = types.ModuleType("app.core.db")


async def _get_db():
    yield None


app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_security = types.ModuleType("app.core.security")
app_core_security.get_current_user = lambda: None
sys.modules["app.core.security"] = app_core_security

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *_args, **_kwargs: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_report = types.ModuleType("app.services.report_service")
app_services_report.export_incidents_csv = AsyncMock(return_value=b"")
sys.modules["app.services.report_service"] = app_services_report

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

app_services_ws = types.ModuleType("app.services.ws_payloads")
app_services_ws.build_alert_payload = lambda *_args, **_kwargs: {}
app_services_ws.build_event_payload = lambda *_args, **_kwargs: {}
sys.modules["app.services.ws_payloads"] = app_services_ws

app_services_alert = types.ModuleType("app.services.alert_service")
app_services_alert.apply_alert_status = AsyncMock()
sys.modules["app.services.alert_service"] = app_services_alert

app_models = types.ModuleType("app.models.entities")


class _Col:
    def __eq__(self, *_args, **_kwargs):
        return True

    def desc(self):
        return self


class _AlertIncident:
    id = _Col()
    order_id = _Col()
    session_id = _Col()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _MonitoringSession:
    id = _Col()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _Order:
    id = _Col()
    user_id = _Col()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _MediaAsset:
    incident_id = _Col()


app_models.AlertIncident = _AlertIncident
app_models.MonitoringSession = _MonitoringSession
app_models.Order = _Order
app_models.MediaAsset = _MediaAsset
sys.modules["app.models.entities"] = app_models

app_schemas = types.ModuleType("app.schemas.schemas")
try:
    from pydantic import BaseModel
except Exception:
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class _AlertOut(BaseModel):
    id: str | None = None
    order_id: str | None = None
    alert_type: str | None = None
    level: str | None = None
    status: str | None = None
    triggered_at: object | None = None


class _AlertListOut(BaseModel):
    alerts: list | None = None


app_schemas.AlertOut = _AlertOut
app_schemas.AlertListOut = _AlertListOut
sys.modules["app.schemas.schemas"] = app_schemas

sqlalchemy_module = types.ModuleType("sqlalchemy")


class _SelectStub:
    def join(self, *_args, **_kwargs):
        return self

    def where(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self


sqlalchemy_module.select = lambda *_args, **_kwargs: _SelectStub()
sys.modules["sqlalchemy"] = sqlalchemy_module

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext

sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_asyncio.AsyncSession = object
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio

app_module = types.ModuleType("app")
app_module.core = types.SimpleNamespace(
    db=app_core_db,
    security=app_core_security,
    cache_invalidation=app_core_cache,
)
app_module.models = types.SimpleNamespace(entities=app_models)
app_module.schemas = types.SimpleNamespace(schemas=app_schemas)
app_module.services = types.SimpleNamespace(
    report_service=app_services_report,
    audit_service=app_services_audit,
    ws_payloads=app_services_ws,
    alert_service=app_services_alert,
)
sys.modules["app"] = app_module


def load_module():
    sys.modules.pop("alerts_router", None)
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.security"] = app_core_security
    sys.modules["app.core.cache_invalidation"] = app_core_cache
    sys.modules["app.services.report_service"] = app_services_report
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.services.ws_payloads"] = app_services_ws
    sys.modules["app.services.alert_service"] = app_services_alert
    sys.modules["app.models.entities"] = app_models
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["sqlalchemy"] = sqlalchemy_module
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("alerts_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _ScalarResult:
    def __init__(self, item):
        self._item = item

    def scalar_one_or_none(self):
        return self._item


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _ResultWithScalars:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _ScalarsResult(self._rows)


class _SequencedDB:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    async def execute(self, *_args, **_kwargs):
        self.calls += 1
        if not self._responses:
            raise AssertionError("unexpected execute call")
        response = self._responses.pop(0)
        if isinstance(response, list):
            return _ResultWithScalars(response)
        return _ScalarResult(response)


class AlertRouterPermissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_alert_detail_rejects_invalid_incident_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid incident id")

        with self.assertRaises(HTTPException) as ctx:
            await module.get_alert_detail(
                incident_id="not-a-uuid",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid incident_id")

    async def test_ack_alert_rejects_invalid_incident_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid incident id")

        with self.assertRaises(HTTPException) as ctx:
            await module.ack_alert(
                incident_id="not-a-uuid",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid incident_id")

    async def test_resolve_alert_rejects_invalid_incident_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid incident id")

        with self.assertRaises(HTTPException) as ctx:
            await module.resolve_alert(
                incident_id="not-a-uuid",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid incident_id")

    async def test_false_positive_rejects_invalid_incident_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid incident id")

        with self.assertRaises(HTTPException) as ctx:
            await module.false_positive(
                incident_id="not-a-uuid",
                db=_DB(),
                user=types.SimpleNamespace(id="u1"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid incident_id")

    async def test_get_alert_detail_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _AlertIncident(id="alert-1", order_id="order-1"),
                _Order(id="order-1", user_id="owner-a"),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.get_alert_detail(
                incident_id="00000000-0000-0000-0000-000000000001",
                db=db,
                user=types.SimpleNamespace(id="user-b"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_ack_alert_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _AlertIncident(id="alert-2", order_id="order-2"),
                _Order(id="order-2", user_id="owner-a"),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.ack_alert(
                incident_id="00000000-0000-0000-0000-000000000002",
                db=db,
                user=types.SimpleNamespace(id="user-b"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_resolve_alert_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _AlertIncident(id="alert-3", order_id="order-3"),
                _Order(id="order-3", user_id="owner-a"),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.resolve_alert(
                incident_id="00000000-0000-0000-0000-000000000003",
                db=db,
                user=types.SimpleNamespace(id="user-b"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_false_positive_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _AlertIncident(id="alert-4", order_id="order-4", session_id="session-4"),
                _Order(id="order-4", user_id="owner-a"),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.false_positive(
                incident_id="00000000-0000-0000-0000-000000000004",
                db=db,
                user=types.SimpleNamespace(id="user-b"),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")


if __name__ == "__main__":
    unittest.main()
