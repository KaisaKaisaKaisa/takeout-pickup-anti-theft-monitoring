import importlib.util
import io
import json
import logging
import os
import sys
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)
MODULE_PATH = os.path.join(base_dir, "app", "core", "logging_config.py")


def load_logging_config():
    spec = importlib.util.spec_from_file_location("logging_config_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LoggingConfigTests(unittest.TestCase):
    def test_json_formatter_emits_structured_fields_and_extra_context(self):
        module = load_logging_config()
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(module.JsonFormatter())
        logger = logging.getLogger("takeout_guard.test.logging")
        logger.handlers = [handler]
        logger.setLevel(logging.INFO)
        logger.propagate = False

        logger.info(
            "request completed",
            extra={
                "request_id": "req-1",
                "path": "/readyz",
                "method": "GET",
                "status_code": 200,
                "duration_ms": 12.3,
            },
        )

        payload = json.loads(stream.getvalue())
        self.assertEqual(payload["level"], "INFO")
        self.assertEqual(payload["logger"], "takeout_guard.test.logging")
        self.assertEqual(payload["message"], "request completed")
        self.assertEqual(payload["request_id"], "req-1")
        self.assertEqual(payload["path"], "/readyz")
        self.assertEqual(payload["method"], "GET")
        self.assertEqual(payload["status_code"], 200)
        self.assertEqual(payload["duration_ms"], 12.3)
        self.assertIn("timestamp", payload)

    def test_configure_logging_installs_json_formatter_on_root(self):
        module = load_logging_config()
        original_handlers = logging.getLogger().handlers[:]
        try:
            module.configure_logging()
            root = logging.getLogger()
            self.assertTrue(root.handlers)
            self.assertIsInstance(root.handlers[0].formatter, module.JsonFormatter)
        finally:
            logging.getLogger().handlers = original_handlers


if __name__ == "__main__":
    unittest.main()
