from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.services.cleanup import run_cleanup_loop
from app.services.device_offline_checker import run_device_offline_loop
from app.services.timeout_checker import run_timeout_loop

logger = logging.getLogger(__name__)

BackgroundLoopFactory = Callable[[], Awaitable[None]]

BACKGROUND_TASK_FACTORIES: tuple[tuple[str, BackgroundLoopFactory], ...] = (
    ("timeout-loop", run_timeout_loop),
    ("cleanup-loop", run_cleanup_loop),
    ("device-offline-loop", run_device_offline_loop),
)


def start_background_tasks(enabled: bool) -> list[asyncio.Task]:
    if not enabled:
        return []
    tasks: list[asyncio.Task] = []
    for name, factory in BACKGROUND_TASK_FACTORIES:
        task = asyncio.create_task(factory(), name=f"takeout-guard:{name}")
        tasks.append(task)
    return tasks


def background_tasks_snapshot(tasks: list[asyncio.Task] | None, *, enabled: bool) -> dict:
    active = 0
    completed = 0
    failed: list[dict[str, str]] = []
    for task in tasks or []:
        if task.cancelled():
            continue
        if task.done():
            try:
                error = task.exception()
            except asyncio.CancelledError:
                continue
            if error is None:
                completed += 1
            else:
                failed.append({
                    "name": task.get_name(),
                    "error": type(error).__name__,
                })
            continue
        active += 1
    return {
        "enabled": enabled,
        "total": len(tasks or []),
        "active": active,
        "completed": completed,
        "failed": failed,
        "ok": len(failed) == 0,
    }


async def stop_background_tasks(tasks: list[asyncio.Task]) -> None:
    if not tasks:
        return
    for task in tasks:
        task.cancel()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for task, result in zip(tasks, results):
        if isinstance(result, BaseException) and not isinstance(result, asyncio.CancelledError):
            logger.warning("Background task stopped with error: %s", task.get_name(), exc_info=result)
