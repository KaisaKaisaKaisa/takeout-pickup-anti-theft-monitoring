import importlib.util
import os
import sys
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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

def _noop(*args, **kwargs):
    return None

class _SelectStub:
    def order_by(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def where(self, *_args, **_kwargs):
        return self

sqlalchemy.select = lambda *_args, **_kwargs: _SelectStub()
sqlalchemy.func = types.SimpleNamespace()
sqlalchemy.case = _noop
sqlalchemy.String = _noop
sqlalchemy.Text = _noop
sqlalchemy.Boolean = _noop
sqlalchemy.Integer = _noop
sqlalchemy.BigInteger = _noop
sqlalchemy.ForeignKey = _noop
sqlalchemy.JSON = _noop
sqlalchemy.DateTime = _noop
sys.modules["sqlalchemy"] = sqlalchemy
sys.modules.pop("app.models.entities", None)
sys.modules.pop("app.models", None)

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

sqlalchemy_schema = types.ModuleType("sqlalchemy.schema")
sys.modules["sqlalchemy.schema"] = sqlalchemy_schema

sqlalchemy_engine = types.ModuleType("sqlalchemy.engine")
sqlalchemy_engine.Row = _noop
sys.modules["sqlalchemy.engine"] = sqlalchemy_engine

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sqlalchemy_ext_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_ext_asyncio.AsyncSession = object
sqlalchemy_ext.asyncio = sqlalchemy_ext_asyncio
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

entities = types.ModuleType("app.models.entities")

class _AttrStub:
    def desc(self):
        return self

    def __ge__(self, *_args, **_kwargs):
        return True

    def __le__(self, *_args, **_kwargs):
        return True

class _RuleMatchLogStub:
    matched_at = _AttrStub()
    suppressed = _AttrStub()
    event_type = _AttrStub()
    rule_set_id = _AttrStub()
    order_id = _AttrStub()
    rule_id = _AttrStub()
    user_id = _AttrStub()

for name in [
    "User",
    "AlertIncident",
    "Order",
    "OrderStatusEvent",
    "AuditLog",
    "EdgeDevice",
    "MonitoringSession",
    "SensorEvent",
    "RuleSet",
    "Rule",
]:
    setattr(entities, name, type(name, (), {}))
entities.RuleMatchLog = _RuleMatchLogStub
entities.Base = type("Base", (), {})
sys.modules["app.models.entities"] = entities

app_models = types.ModuleType("app.models")
app_models.entities = entities
sys.modules["app.models"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

MODULE_PATH = os.path.join(base_dir, "app", "services", "report_service.py")


def load_module():
    sys.modules["sqlalchemy"] = sqlalchemy
    sys.modules["sqlalchemy.orm"] = sqlalchemy_orm
    sys.modules["sqlalchemy.dialects"] = sqlalchemy_dialects
    sys.modules["sqlalchemy.dialects.postgresql"] = sqlalchemy_dialects_postgresql
    sys.modules["sqlalchemy.schema"] = sqlalchemy_schema
    sys.modules["sqlalchemy.engine"] = sqlalchemy_engine
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio
    sys.modules["app.models.entities"] = entities
    sys.modules["app.models"] = app_models
    spec = importlib.util.spec_from_file_location("report_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ExportRangeTests(unittest.IsolatedAsyncioTestCase):
    async def test_export_summary_range_filters(self):
        report_service = load_module()
        fake = {
            "orders": {"total": 1},
            "alerts": {"total": 0},
            "devices": {"total": 0},
            "sessions": {"total": 0},
            "events_last_24h": 0,
            "rule_matches": {"total": 0, "suppressed": 0},
        }
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 2, tzinfo=timezone.utc)
        with patch.object(report_service, "get_summary", new=AsyncMock(return_value=fake)):
            data = await report_service.export_report_summary_csv(db=None, start=start, end=end)
        self.assertIn("rule_matches", data.decode("utf-8"))

    async def test_export_trends_range_filters(self):
        report_service = load_module()
        fake = {
            "interval": "day",
            "orders": [{"day": "2026-03-15", "count": 1}],
            "alerts": [],
            "events": [],
            "rule_matches": [{"day": "2026-03-15", "count": 2}],
        }
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 8, tzinfo=timezone.utc)
        with patch.object(report_service, "get_trends", new=AsyncMock(return_value=fake)):
            data = await report_service.export_trends_csv(db=None, interval="day", start=start, end=end)
        self.assertIn("rule_matches", data.decode("utf-8"))

    async def test_export_rule_matches_range_filters(self):
        report_service = load_module()
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 2, tzinfo=timezone.utc)
        class _Result:
            def scalars(self):
                return self

            def all(self):
                return []

        class _DB:
            async def execute(self, *_args, **_kwargs):
                return _Result()

        data = await report_service.export_rule_matches_csv(db=_DB(), limit=10, start=start, end=end)
        self.assertIn("match_id", data.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
