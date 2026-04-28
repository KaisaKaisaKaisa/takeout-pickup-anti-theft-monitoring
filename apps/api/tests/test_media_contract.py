import importlib.util
import os
import sys
import types
import unittest
from fastapi import HTTPException
from starlette.responses import RedirectResponse
from unittest.mock import AsyncMock, patch


base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)
MODULE_PATH = os.path.join(base_dir, "app", "routers", "media.py")


def _purge_stubbed_modules() -> None:
    prefixes = ("app", "sqlalchemy")
    for name in list(sys.modules):
        if name in prefixes or name.startswith(tuple(f"{prefix}." for prefix in prefixes)):
            sys.modules.pop(name, None)


def load_media_router():
    _purge_stubbed_modules()
    sys.modules.pop("media_router_contract", None)
    spec = importlib.util.spec_from_file_location("media_router_contract", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _ScalarResult:
    def __init__(self, item):
        self._item = item

    def scalar_one_or_none(self):
        return self._item


class _SequencedDB:
    def __init__(self, responses):
        self._responses = list(responses)
        self.added = []
        self.committed = False

    async def execute(self, *_args, **_kwargs):
        if not self._responses:
            raise AssertionError("unexpected execute call")
        return _ScalarResult(self._responses.pop(0))

    def add(self, item):
        self.added.append(item)

    async def commit(self):
        self.committed = True


class _Upload:
    filename = "proof.jpg"
    content_type = "image/jpeg"

    def __init__(self, data: bytes):
        self._data = data

    async def read(self):
        return self._data


class MediaContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_object_store_download_redirects_to_presigned_url(self):
        module = load_media_router()
        media = types.SimpleNamespace(
            id="00000000-0000-0000-0000-000000000010",
            order_id=None,
            storage_provider="minio",
            bucket_name="takeout-guard-evidence",
            object_key="media/a.jpg",
            content_type="image/jpeg",
        )
        db = _SequencedDB([media])

        with patch.object(module, "object_download_url", return_value="http://minio-signed/a.jpg"):
            result = await module.download_media(
                media_id="00000000-0000-0000-0000-000000000010",
                db=db,
                user=types.SimpleNamespace(id="u1"),
            )

        self.assertIsInstance(result, RedirectResponse)
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result.headers["location"], "http://minio-signed/a.jpg")

    async def test_upload_media_authenticates_session_device_with_hmac_headers(self):
        module = load_media_router()
        session_id = "00000000-0000-0000-0000-000000000020"
        device_id = "00000000-0000-0000-0000-000000000030"
        order_id = "00000000-0000-0000-0000-000000000040"
        session = types.SimpleNamespace(
            id=session_id,
            edge_device_id=device_id,
            order_id=order_id,
        )
        device = types.SimpleNamespace(id=device_id, device_code="device-secret")
        db = _SequencedDB([session, device])

        with patch.object(module, "write_object", return_value={
            "storage_provider": "minio",
            "bucket_name": "takeout-guard-evidence",
            "object_key": "media/proof.jpg",
            "size_bytes": 5,
            "sha256": "sha256",
        }):
            with patch.object(module, "authenticate_device_request", AsyncMock()) as authenticate:
                result = await module.upload_media(
                    file=_Upload(b"proof"),
                    media_type="image",
                    session_id=session_id,
                    incident_id=None,
                    x_device_timestamp="1760000000",
                    x_device_nonce="nonce-1",
                    x_device_signature="sig",
                    db=db,
                )

        self.assertEqual(result["storage_provider"], "minio")
        self.assertEqual(result["sha256"], "sha256")
        self.assertTrue(db.committed)
        authenticate.assert_awaited_once()
        _, kwargs = authenticate.await_args
        self.assertEqual(kwargs["x_device_timestamp"], "1760000000")
        self.assertEqual(kwargs["x_device_nonce"], "nonce-1")
        self.assertEqual(kwargs["x_device_signature"], "sig")
        self.assertIn(b'"media_type":"image"', kwargs["body"])
        self.assertIn(b'"sha256"', kwargs["body"])
        self.assertIn(b'"filename":"proof.jpg"', kwargs["body"])
        self.assertNotIn(b"object_key", kwargs["body"])

    async def test_upload_media_rejects_missing_device_identity(self):
        module = load_media_router()

        with self.assertRaises(HTTPException) as ctx:
            await module.upload_media(
                file=_Upload(b"proof"),
                media_type="image",
                session_id=None,
                incident_id=None,
                db=_SequencedDB([]),
            )

        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
