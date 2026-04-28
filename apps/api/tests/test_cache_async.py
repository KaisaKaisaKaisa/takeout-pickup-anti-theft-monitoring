import importlib.util
import os
import sys
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)
MODULE_PATH = os.path.join(base_dir, "app", "core", "cache.py")


class AsyncCacheTests(unittest.IsolatedAsyncioTestCase):
    def load_cache(self):
        sys.modules.pop("app.core.cache", None)
        spec = importlib.util.spec_from_file_location("cache_test", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    async def test_async_memory_cache_roundtrip_and_invalidate(self):
        cache = self.load_cache()
        cache._redis = None
        await cache.aset("unit:key", {"value": 1}, ttl_sec=30)
        self.assertEqual(await cache.aget("unit:key"), {"value": 1})
        await cache.ainvalidate("unit:")
        self.assertIsNone(await cache.aget("unit:key"))

    async def test_probe_reports_memory_fallback_as_degraded_optional(self):
        cache = self.load_cache()
        cache._redis = None
        payload = await cache.probe_cache()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["backend"], "memory")
        self.assertTrue(payload["degraded"])
        self.assertTrue(payload["optional"])


if __name__ == "__main__":
    unittest.main()
