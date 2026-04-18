import importlib.util
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
import types

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

sqlalchemy.select = _noop
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
sqlalchemy_ext_asyncio.AsyncSession = object
sqlalchemy_ext.asyncio = sqlalchemy_ext_asyncio
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_ext_asyncio

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

MODULE_PATH = os.path.join(base_dir, "app", "services", "rule_engine_utils.py")


def load_module():
    spec = importlib.util.spec_from_file_location("rule_engine_utils", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RuleEngineUtilsTests(unittest.TestCase):
    def test_is_within_cooldown(self):
        rule_engine_utils = load_module()
        now = datetime.now(timezone.utc)
        last = now - timedelta(seconds=30)
        self.assertTrue(rule_engine_utils.is_within_cooldown(last, cooldown_sec=60, now=now))
        self.assertFalse(rule_engine_utils.is_within_cooldown(last, cooldown_sec=10, now=now))


if __name__ == "__main__":
    unittest.main()
