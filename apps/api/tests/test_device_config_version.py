import importlib.util
import os
import sys
import types
import unittest
import uuid

app_core_config = types.ModuleType("app.core.config")
app_core_config.settings = types.SimpleNamespace(
    default_min_motion_score=5000,
    default_max_weight_drop=-200,
    default_alert_cooldown_sec=120,
)
sys.modules["app.core.config"] = app_core_config

app_models = types.ModuleType("app.models.entities")


class _EdgeDevice:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


app_models.EdgeDevice = _EdgeDevice
sys.modules["app.models.entities"] = app_models

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "config_service.py")


def load_module():
    spec = importlib.util.spec_from_file_location("config_service", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeviceConfigVersionTests(unittest.TestCase):
    def test_config_version_stable_for_runtime_fields(self):
        config_service = load_module()
        device = _EdgeDevice(
            id=uuid.uuid4(),
            device_code="dev-1",
            config_json={
                "sensitivity": {"min_motion_score": 123},
                "last_heartbeat": {"seq": 1},
            },
        )
        cfg1 = config_service.build_device_config(device)
        version1 = cfg1.get("config_version")
        self.assertTrue(version1)

        device.config_json["last_heartbeat"] = {"seq": 2}
        device.config_json["last_applied_version"] = "v1"
        device.config_json["last_applied_at"] = "2026-03-16T10:00:00Z"
        cfg2 = config_service.build_device_config(device)
        version2 = cfg2.get("config_version")
        self.assertEqual(version1, version2)


if __name__ == "__main__":
    unittest.main()
