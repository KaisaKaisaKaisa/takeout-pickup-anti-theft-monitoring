import hashlib
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)
MODULE_PATH = os.path.join(base_dir, "app", "services", "storage_service.py")


def load_storage_service():
    spec = importlib.util.spec_from_file_location("storage_service_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StorageServiceTests(unittest.TestCase):
    def setUp(self):
        self.storage_service = load_storage_service()
        self.previous_settings = self.storage_service.settings

    def tearDown(self):
        self.storage_service.settings = self.previous_settings

    def test_local_write_object_records_hash_and_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.storage_service.settings = types.SimpleNamespace(
                object_store="local",
                local_media_root=tmp,
                object_store_bucket="bucket",
                object_store_endpoint_url="",
                object_store_access_key="",
                object_store_secret_key="",
                object_store_region="us-east-1",
                object_store_presign_ttl_sec=300,
            )

            stored = self.storage_service.write_object("media/sample.bin", b"abc", "application/octet-stream")

            self.assertEqual(stored["storage_provider"], "local")
            self.assertEqual(stored["bucket_name"], "local")
            self.assertEqual(stored["size_bytes"], 3)
            self.assertEqual(stored["sha256"], hashlib.sha256(b"abc").hexdigest())
            self.assertTrue(self.storage_service.storage_path("media/sample.bin").exists())

    def test_minio_write_requires_boto3_and_credentials(self):
        self.storage_service.settings = types.SimpleNamespace(
            object_store="minio",
            local_media_root="storage",
            object_store_bucket="bucket",
            object_store_endpoint_url="http://minio:9000",
            object_store_access_key="",
            object_store_secret_key="",
            object_store_region="us-east-1",
            object_store_presign_ttl_sec=300,
        )

        with self.assertRaises(self.storage_service.StorageUnavailable):
            self.storage_service.write_object("media/sample.bin", b"abc")

    def test_s3_presigned_url_uses_configured_bucket(self):
        self.storage_service.settings = types.SimpleNamespace(
            object_store="minio",
            local_media_root="storage",
            object_store_bucket="bucket",
            object_store_endpoint_url="http://minio:9000",
            object_store_access_key="key",
            object_store_secret_key="secret",
            object_store_region="us-east-1",
            object_store_presign_ttl_sec=120,
        )
        client = Mock()
        client.generate_presigned_url.return_value = "http://signed"

        with patch.object(self.storage_service, "boto3") as boto3_mock, patch.object(self.storage_service, "BotoConfig", Mock()):
            boto3_mock.client.return_value = client
            url = self.storage_service.object_download_url("bucket", "media/a.jpg", "image/jpeg")

        self.assertEqual(url, "http://signed")
        client.generate_presigned_url.assert_called_once()
        call = client.generate_presigned_url.call_args
        self.assertEqual(call.args[0], "get_object")
        self.assertEqual(call.kwargs["Params"]["Bucket"], "bucket")
        self.assertEqual(call.kwargs["Params"]["Key"], "media/a.jpg")
        self.assertEqual(call.kwargs["ExpiresIn"], 120)

    def test_probe_storage_reports_local_backend(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.storage_service.settings = types.SimpleNamespace(
                object_store="local",
                local_media_root=tmp,
                object_store_bucket="bucket",
                object_store_endpoint_url="",
                object_store_access_key="",
                object_store_secret_key="",
                object_store_region="us-east-1",
                object_store_presign_ttl_sec=300,
            )

            payload = self.storage_service.probe_storage()

        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["backend"], "local")

    def test_probe_storage_checks_object_store_bucket(self):
        self.storage_service.settings = types.SimpleNamespace(
            object_store="minio",
            local_media_root="storage",
            object_store_bucket="bucket",
            object_store_endpoint_url="http://minio:9000",
            object_store_access_key="key",
            object_store_secret_key="secret",
            object_store_region="us-east-1",
            object_store_presign_ttl_sec=120,
        )
        client = Mock()

        with patch.object(self.storage_service, "_s3_client", return_value=client):
            payload = self.storage_service.probe_storage()

        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["backend"], "minio")
        self.assertEqual(payload["bucket"], "bucket")
        client.head_bucket.assert_called_once_with(Bucket="bucket")


if __name__ == "__main__":
    unittest.main()
