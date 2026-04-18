import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock

app_core_ws = types.ModuleType("app.core.ws")
app_core_ws.broadcast_event = AsyncMock()
sys.modules["app.core.ws"] = app_core_ws

app_core_cache = types.ModuleType("app.core.cache_invalidation")
app_core_cache.invalidate_report_caches = lambda *args, **kwargs: None
sys.modules["app.core.cache_invalidation"] = app_core_cache

app_services_ws_payloads = types.ModuleType("app.services.ws_payloads")
app_services_ws_payloads.build_alert_payload = lambda alert: {"id": getattr(alert, "id", None)}
app_services_ws_payloads.build_event_payload = lambda entity_type, payload: {"entity": payload}
sys.modules["app.services.ws_payloads"] = app_services_ws_payloads

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

app_core = types.ModuleType("app.core")
app_core.ws = app_core_ws
sys.modules["app.core"] = app_core

app_services = types.ModuleType("app.services")
sys.modules["app.services"] = app_services

app_module = types.ModuleType("app")
app_module.core = app_core
app_module.services = app_services
sys.modules["app"] = app_module

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "alert_service.py")

def load_module():
    sys.modules["app.core.ws"] = app_core_ws
    sys.modules["app.core.cache_invalidation"] = app_core_cache
    sys.modules["app.services.ws_payloads"] = app_services_ws_payloads
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.core"] = app_core
    sys.modules["app.services"] = app_services
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("alert_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class AlertServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_emit_alert_event_includes_is_update(self):
        module = load_module()
        alert = types.SimpleNamespace(id="a1", is_update=True)
        await module.emit_alert_event(alert, "alert.triggered", user_id=None)
        args, _ = app_core_ws.broadcast_event.await_args
        self.assertEqual(args[0], "alert.triggered")
        payload = args[1]
        self.assertIn("is_update", payload)
        self.assertTrue(payload["is_update"])

    async def test_apply_alert_status_updates_and_broadcasts(self):
        module = load_module()
        alert = types.SimpleNamespace(id="a1", status="open", is_update=False)
        db = types.SimpleNamespace(commit=AsyncMock())
        await module.apply_alert_status(
            db=db,
            alert=alert,
            status="resolved",
            user_id="u1",
            audit={"user_id": "u1", "action": "alert.resolve"},
        )
        self.assertEqual(alert.status, "resolved")
        self.assertTrue(app_core_ws.broadcast_event.called)
        self.assertTrue(db.commit.called)

if __name__ == "__main__":
    unittest.main()
