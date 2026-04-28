from __future__ import annotations

import asyncio
import uuid

from app.core import cache


def invalidate_report_caches(user_id: uuid.UUID | None) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        cache.invalidate("report_summary:global")
        cache.invalidate("report_trends:global:")
        if user_id:
            cache.invalidate(f"report_summary:user:{user_id}")
            cache.invalidate("report_trends:user:")
        return
    loop.create_task(ainvalidate_report_caches(user_id))


async def ainvalidate_report_caches(user_id: uuid.UUID | None) -> None:
    await cache.ainvalidate("report_summary:global")
    await cache.ainvalidate("report_trends:global:")
    if user_id:
        await cache.ainvalidate(f"report_summary:user:{user_id}")
        await cache.ainvalidate("report_trends:user:")
