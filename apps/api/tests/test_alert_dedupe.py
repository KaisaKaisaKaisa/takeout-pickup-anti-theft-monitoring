import importlib.util
import os
import sys
import types
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine._upsert_alert = lambda *args, **kwargs: None
sys.modules["app.services.alert_engine"] = app_services_alert_engine

try:
    import pydantic  # noqa: F401
    import pydantic_settings  # noqa: F401
except Exception:
    pydantic = types.ModuleType("pydantic")

    def Field(default=None, **kwargs):
        return default

    pydantic.Field = Field
    sys.modules["pydantic"] = pydantic

    pydantic_settings = types.ModuleType("pydantic_settings")

    class BaseSettings:
        def __init__(self, **kwargs):
            for key, value in self.__class__.__dict__.items():
                if key.startswith("_") or key == "Config":
                    continue
                setattr(self, key, value)
            for key, value in kwargs.items():
                setattr(self, key, value)

    pydantic_settings.BaseSettings = BaseSettings
    sys.modules["pydantic_settings"] = pydantic_settings

sqlalchemy = types.ModuleType("sqlalchemy")

class _SelectStub:
    def where(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

def _noop(*args, **kwargs):
    return None

def _select_stub(*args, **kwargs):
    return _SelectStub()

sqlalchemy.select = _select_stub
sqlalchemy.case = _noop
sqlalchemy.func = types.SimpleNamespace()
sqlalchemy.String = _noop
sqlalchemy.Text = _noop
sqlalchemy.Boolean = _noop
sqlalchemy.Integer = _noop
sqlalchemy.BigInteger = _noop
sqlalchemy.ForeignKey = _noop
sqlalchemy.JSON = _noop
sqlalchemy.DateTime = _noop
sys.modules["sqlalchemy"] = sqlalchemy

sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")

class _MappedStub:
    def __class_getitem__(cls, item):
        return cls

sqlalchemy_orm.Mapped = _MappedStub
sqlalchemy_orm.mapped_column = _noop

class _DeclarativeBaseStub:
    pass

sqlalchemy_orm.DeclarativeBase = _DeclarativeBaseStub
sys.modules["sqlalchemy.orm"] = sqlalchemy_orm

sqlalchemy_dialects = types.ModuleType("sqlalchemy.dialects")
sqlalchemy_dialects_postgresql = types.ModuleType("sqlalchemy.dialects.postgresql")
sqlalchemy_dialects_postgresql.UUID = _noop
sqlalchemy_dialects.postgresql = sqlalchemy_dialects_postgresql
sys.modules["sqlalchemy.dialects"] = sqlalchemy_dialects
sys.modules["sqlalchemy.dialects.postgresql"] = sqlalchemy_dialects_postgresql

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sqlalchemy_ext_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")

class _AsyncSessionStub:
    pass

sqlalchemy_ext_asyncio.AsyncSession = _AsyncSessionStub
sqlalchemy_ext.asyncio = sqlalchemy_ext_asyncio
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

entities = types.ModuleType("app.models.entities")

class _ColumnStub:
    def __eq__(self, other):
        return True

    def desc(self):
        return self

class _AlertIncidentStub:
    session_id = _ColumnStub()
    alert_type = _ColumnStub()
    status = _ColumnStub()
    rule_id = _ColumnStub()
    triggered_at = _ColumnStub()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

entities.AlertIncident = _AlertIncidentStub
for name in [
    "MonitoringSession",
    "SensorEvent",
    "RuleSet",
    "Rule",
    "Order",
    "RuleMatchLog",
]:
    setattr(entities, name, type(name, (), {}))
entities.Base = type("Base", (), {})
sys.modules["app.models.entities"] = entities
app_models = types.ModuleType("app.models")
app_models.entities = entities
app_models.__path__ = []
sys.modules["app.models"] = app_models

app_core_ws = types.ModuleType("app.core.ws")

async def _noop_ws(*args, **kwargs):
    return None

app_core_ws.broadcast_event = _noop_ws
sys.modules["app.core.ws"] = app_core_ws
app_core = types.ModuleType("app.core")
app_core.ws = app_core_ws
app_core.__path__ = []
sys.modules["app.core"] = app_core

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *args, **kwargs: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_rule_utils = types.ModuleType("app.services.rule_engine_utils")
app_services_rule_utils.is_within_cooldown = lambda *args, **kwargs: False
sys.modules["app.services.rule_engine_utils"] = app_services_rule_utils

app_services_ws_payloads = types.ModuleType("app.services.ws_payloads")
app_services_ws_payloads.build_rule_match_payload = lambda *args, **kwargs: {}
app_services_ws_payloads.build_event_payload = lambda *args, **kwargs: {}
sys.modules["app.services.ws_payloads"] = app_services_ws_payloads

app_services = types.ModuleType("app.services")
app_services.rule_engine_utils = app_services_rule_utils
app_services.ws_payloads = app_services_ws_payloads
app_services.alert_engine = app_services_alert_engine
app_services.__path__ = []
sys.modules["app.services"] = app_services

app_core_config = types.ModuleType("app.core.config")

class _Settings:
    default_alert_cooldown_sec = 60
    default_min_motion_score = 0.0
    default_max_weight_drop = 1000000.0

app_core_config.settings = _Settings()
sys.modules["app.core.config"] = app_core_config

app_module = types.ModuleType("app")
app_module.models = app_models
app_module.core = app_core
app_module.services = app_services
app_module.__path__ = []
sys.modules["app"] = app_module

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "alert_engine.py")

def load_module():
    sys.modules["app.services.alert_engine"] = app_services_alert_engine
    sys.modules["sqlalchemy"] = sqlalchemy
    sys.modules["sqlalchemy.orm"] = sqlalchemy_orm
    sys.modules["sqlalchemy.dialects"] = sqlalchemy_dialects
    sys.modules["sqlalchemy.dialects.postgresql"] = sqlalchemy_dialects_postgresql
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio
    sys.modules["app.models.entities"] = entities
    sys.modules["app.models"] = app_models
    sys.modules["app.core.ws"] = app_core_ws
    sys.modules["app.core"] = app_core
    sys.modules["app.core.cache_invalidation"] = app_core_cache
    sys.modules["app.services.rule_engine_utils"] = app_services_rule_utils
    sys.modules["app.services.ws_payloads"] = app_services_ws_payloads
    sys.modules["app.services"] = app_services
    sys.modules["app.core.config"] = app_core_config
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("alert_engine", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class AlertDedupeTests(unittest.IsolatedAsyncioTestCase):
    async def test_dedupe_updates_open_alert_within_cooldown(self):
        engine = load_module()
        now = datetime.now(timezone.utc)
        existing = types.SimpleNamespace(
            id="a1",
            status="open",
            triggered_at=now - timedelta(seconds=30),
            summary="old",
        )
        db = types.SimpleNamespace()
        db.execute = AsyncMock(return_value=types.SimpleNamespace(scalar_one_or_none=lambda: existing))
        db.add = lambda *args, **kwargs: None
        db.flush = AsyncMock()
        result = await engine._upsert_alert(
            db=db,
            session_id="s1",
            order_id="o1",
            alert_type="rule_triggered",
            level="warning",
            summary="new",
            rule_id=None,
            rule_set_id=None,
            cooldown_sec=60,
            now=now,
        )
        self.assertEqual(result["action"], "updated")
        self.assertEqual(existing.summary, "new")
        self.assertEqual(existing.triggered_at, now)
        self.assertIs(getattr(existing, "is_update", None), True)

    async def test_dedupe_creates_new_alert_outside_cooldown(self):
        engine = load_module()
        now = datetime.now(timezone.utc)
        existing = types.SimpleNamespace(
            id="a1",
            status="open",
            triggered_at=now - timedelta(seconds=120),
            summary="old",
        )
        db = types.SimpleNamespace()
        db.execute = AsyncMock(return_value=types.SimpleNamespace(scalar_one_or_none=lambda: existing))
        db.add = lambda *args, **kwargs: None
        db.flush = AsyncMock()
        result = await engine._upsert_alert(
            db=db,
            session_id="s1",
            order_id="o1",
            alert_type="rule_triggered",
            level="warning",
            summary="new",
            rule_id=None,
            rule_set_id=None,
            cooldown_sec=60,
            now=now,
        )
        self.assertEqual(result["action"], "created")
        self.assertEqual(existing.status, "resolved")
        self.assertIs(getattr(result["alert"], "is_update", None), False)

if __name__ == "__main__":
    unittest.main()
