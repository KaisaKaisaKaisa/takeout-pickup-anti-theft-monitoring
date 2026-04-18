from __future__ import annotations

import uuid

from app.core import cache


def invalidate_report_caches(user_id: uuid.UUID | None) -> None:
    cache.invalidate("report_summary:global")
    cache.invalidate("report_trends:global:")
    if user_id:
        cache.invalidate(f"report_summary:user:{user_id}")
        cache.invalidate("report_trends:user:")
