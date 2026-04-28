from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace
from typing import Any

try:
    from app.core.config import settings
except Exception:
    settings = SimpleNamespace(
        object_store="local",
        object_store_bucket="takeout-guard-evidence",
        object_store_endpoint_url="",
        object_store_access_key="",
        object_store_secret_key="",
        object_store_region="us-east-1",
        object_store_presign_ttl_sec=300,
        local_media_root="storage",
    )

try:
    import boto3
    from botocore.client import Config as BotoConfig
except Exception:
    boto3 = None
    BotoConfig = None


class StorageUnavailable(RuntimeError):
    pass


def storage_provider() -> str:
    provider = (settings.object_store or "local").lower()
    if provider in {"minio", "s3"}:
        return provider
    return "local"


def ensure_storage_dir() -> Path:
    root = Path(settings.local_media_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _s3_client() -> Any:
    if boto3 is None or BotoConfig is None:
        raise StorageUnavailable("boto3 is required for S3/MinIO object storage")
    if not settings.object_store_access_key or not settings.object_store_secret_key:
        raise StorageUnavailable("object store credentials are not configured")
    kwargs: dict[str, Any] = {
        "service_name": "s3",
        "region_name": settings.object_store_region,
        "aws_access_key_id": settings.object_store_access_key,
        "aws_secret_access_key": settings.object_store_secret_key,
        "config": BotoConfig(signature_version="s3v4"),
    }
    if settings.object_store_endpoint_url:
        kwargs["endpoint_url"] = settings.object_store_endpoint_url
    return boto3.client(**kwargs)


def write_object(rel_path: str, data: bytes, content_type: str | None = None) -> dict[str, Any]:
    provider = storage_provider()
    digest = sha256_hex(data)
    if provider == "local":
        full = write_bytes(rel_path, data)
        return {
            "storage_provider": "local",
            "bucket_name": "local",
            "object_key": rel_path,
            "size_bytes": len(data),
            "sha256": digest,
            "path": str(full),
        }

    bucket = settings.object_store_bucket
    client = _s3_client()
    extra_args = {"ContentType": content_type} if content_type else None
    put_kwargs: dict[str, Any] = {"Bucket": bucket, "Key": rel_path, "Body": data}
    if extra_args:
        put_kwargs["ContentType"] = extra_args["ContentType"]
    client.put_object(**put_kwargs)
    return {
        "storage_provider": provider,
        "bucket_name": bucket,
        "object_key": rel_path,
        "size_bytes": len(data),
        "sha256": digest,
    }


def write_bytes(rel_path: str, data: bytes) -> Path:
    root = ensure_storage_dir()
    full = root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(data)
    return full

def storage_path(rel_path: str) -> Path:
    return ensure_storage_dir() / rel_path


def object_download_url(bucket_name: str | None, object_key: str, content_type: str | None = None) -> str:
    provider = storage_provider()
    if provider == "local" or bucket_name == "local":
        return ""
    client = _s3_client()
    params: dict[str, Any] = {"Bucket": bucket_name or settings.object_store_bucket, "Key": object_key}
    if content_type:
        params["ResponseContentType"] = content_type
    return client.generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=settings.object_store_presign_ttl_sec,
    )


def probe_storage() -> dict[str, Any]:
    provider = storage_provider()
    if provider == "local":
        try:
            root = ensure_storage_dir()
            return {"ok": True, "backend": "local", "path": str(root)}
        except Exception as exc:
            return {"ok": False, "backend": "local", "error": type(exc).__name__}
    try:
        bucket = settings.object_store_bucket
        _s3_client().head_bucket(Bucket=bucket)
        return {"ok": True, "backend": provider, "bucket": bucket}
    except Exception as exc:
        return {
            "ok": False,
            "backend": provider,
            "bucket": getattr(settings, "object_store_bucket", ""),
            "error": type(exc).__name__,
        }
