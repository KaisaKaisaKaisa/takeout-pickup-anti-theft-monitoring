from __future__ import annotations

from pathlib import Path
from app.core.config import settings

def ensure_storage_dir() -> Path:
    root = Path(settings.local_media_root)
    root.mkdir(parents=True, exist_ok=True)
    return root

def write_bytes(rel_path: str, data: bytes) -> Path:
    root = ensure_storage_dir()
    full = root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(data)
    return full

def storage_path(rel_path: str) -> Path:
    return ensure_storage_dir() / rel_path
