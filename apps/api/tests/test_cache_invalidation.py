import importlib
import os
import sys
import unittest
import uuid
import types
from unittest.mock import call, patch

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

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)


def load_module():
    for name in ["app.core.cache_invalidation", "app.core.cache", "app.core", "app"]:
        sys.modules.pop(name, None)
    return importlib.import_module("app.core.cache_invalidation")


class CacheInvalidationTests(unittest.TestCase):
    def test_invalidate_report_caches_user(self):
        cache_invalidation = load_module()
        user_id = uuid.uuid4()
        with patch("app.core.cache_invalidation.cache.invalidate") as invalidate:
            cache_invalidation.invalidate_report_caches(user_id)
        invalidate.assert_has_calls(
            [
                call("report_summary:global"),
                call("report_trends:global:"),
                call(f"report_summary:user:{user_id}"),
                call("report_trends:user:"),
            ],
            any_order=False,
        )

    def test_invalidate_report_caches_global_only(self):
        cache_invalidation = load_module()
        with patch("app.core.cache_invalidation.cache.invalidate") as invalidate:
            cache_invalidation.invalidate_report_caches(None)
        invalidate.assert_has_calls(
            [
                call("report_summary:global"),
                call("report_trends:global:"),
            ],
            any_order=False,
        )


if __name__ == "__main__":
    unittest.main()
