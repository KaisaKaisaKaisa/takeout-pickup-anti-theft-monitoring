import importlib.util
import os
import sys
import unittest
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

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

from app.core import cache

MODULE_PATH = os.path.join(base_dir, "app", "services", "webhook_security.py")


def load_module():
    spec = importlib.util.spec_from_file_location("webhook_security", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WebhookSecurityTests(unittest.TestCase):
    def setUp(self):
        cache.invalidate("webhook_nonce:")
        cache.invalidate("webhook_idem:")
        self.assertTrue(os.path.exists(MODULE_PATH))

    def test_normalize_status(self):
        webhook_security = load_module()
        self.assertEqual(webhook_security.normalize_status("delivered"), "delivered")
        self.assertEqual(webhook_security.normalize_status("Arrived"), "delivered")
        self.assertEqual(webhook_security.normalize_status("pickedup"), "picked_up")
        self.assertEqual(webhook_security.normalize_status("CREATED"), "created")
        self.assertIsNone(webhook_security.normalize_status("unknown"))

    def test_nonce_replay(self):
        webhook_security = load_module()
        self.assertTrue(webhook_security.check_and_store_nonce("meituan", "abc", ttl_sec=10))
        self.assertFalse(webhook_security.check_and_store_nonce("meituan", "abc", ttl_sec=10))

    def test_idempotency_key(self):
        webhook_security = load_module()
        payload = {
            "provider_order_id": "p1",
            "status": "delivered",
            "event_time": "2026-03-15T10:00:00Z",
        }
        key1 = webhook_security.build_idempotency_key("meituan", payload, event_id=None, raw_body=None)
        key2 = webhook_security.build_idempotency_key("meituan", payload, event_id=None, raw_body=None)
        self.assertEqual(key1, key2)

    def test_idempotency_replay(self):
        webhook_security = load_module()
        payload = {
            "provider_order_id": "p1",
            "status": "delivered",
            "event_time": "2026-03-15T10:00:00Z",
        }
        key = webhook_security.build_idempotency_key("meituan", payload, event_id="evt-1", raw_body=None)
        self.assertTrue(webhook_security.check_and_store_idempotency(key, ttl_sec=10))
        self.assertFalse(webhook_security.check_and_store_idempotency(key, ttl_sec=10))


if __name__ == "__main__":
    unittest.main()
