import importlib.util
import os
import sys
import types
import unittest

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

MODULE_PATH = os.path.join(base_dir, "app", "services", "webhook_security.py")


def load_module():
    spec = importlib.util.spec_from_file_location("webhook_security", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WebhookProviderSecretTests(unittest.TestCase):
    def test_provider_secret_prefers_mapping(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw='{"meituan":"s1","eleme":"s2"}',
            fallback="fb",
        )
        self.assertEqual(secret, "s1")

    def test_provider_secret_fallback(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw="{}",
            fallback="fb",
        )
        self.assertEqual(secret, "fb")

    def test_provider_secret_none(self):
        webhook_security = load_module()
        secret = webhook_security.get_provider_secret(
            "meituan",
            mapping_raw="{}",
            fallback="",
        )
        self.assertIsNone(secret)


if __name__ == "__main__":
    unittest.main()
