from __future__ import annotations

from datetime import datetime, timedelta


def is_within_cooldown(last_at: datetime | None, cooldown_sec: int, now: datetime) -> bool:
    if not last_at or cooldown_sec <= 0:
        return False
    return last_at >= (now - timedelta(seconds=cooldown_sec))
