import importlib.util
import os
import sys
import types
import unittest
import uuid
from unittest.mock import AsyncMock

from fastapi import HTTPException

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)

MODULE_PATH = os.path.join(base_dir, "app", "services", "device_security.py")


def load_device_security():
    spec = importlib.util.spec_from_file_location("device_security_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeviceSecurityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.device_security = load_device_security()
        self.device = types.SimpleNamespace(id=uuid.uuid4(), device_code="device-secret")

    async def test_valid_hmac_signature_is_accepted_and_nonce_is_stored(self):
        body = b'{"eventType":"motion"}'
        timestamp = "1760000000"
        nonce = "nonce-1"
        signature = self.device_security.build_device_signature(self.device.device_code, body, timestamp, nonce)

        original_verify = self.device_security.verify_device_signature
        self.device_security.verify_device_signature = lambda *args, **kwargs: (True, "")
        try:
            with unittest.mock.patch.object(self.device_security.cache, "aget", AsyncMock(return_value=None)):
                with unittest.mock.patch.object(self.device_security.cache, "aset", AsyncMock()) as aset:
                    await self.device_security.authenticate_device_request(
                        self.device,
                        body=body,
                        x_device_timestamp=timestamp,
                        x_device_nonce=nonce,
                        x_device_signature=signature,
                    )
                    aset.assert_awaited_once()
        finally:
            self.device_security.verify_device_signature = original_verify

    async def test_nonce_replay_is_rejected(self):
        original_verify = self.device_security.verify_device_signature
        self.device_security.verify_device_signature = lambda *args, **kwargs: (True, "")
        try:
            with unittest.mock.patch.object(self.device_security.cache, "aget", AsyncMock(return_value={"ok": True})):
                with self.assertRaises(HTTPException) as ctx:
                    await self.device_security.authenticate_device_request(
                        self.device,
                        body=b"{}",
                        x_device_timestamp="1760000000",
                        x_device_nonce="replayed",
                        x_device_signature="sig",
                    )
        finally:
            self.device_security.verify_device_signature = original_verify
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_legacy_device_code_remains_allowed_by_default(self):
        await self.device_security.authenticate_device_request(self.device, x_device_code="device-secret")

    def test_signature_verifier_rejects_expired_timestamp(self):
        ok, reason = self.device_security.verify_device_signature(
            "secret",
            b"{}",
            "100",
            "n",
            "bad",
            now_ts=1000,
            ttl_sec=300,
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "Expired device signature")


if __name__ == "__main__":
    unittest.main()
