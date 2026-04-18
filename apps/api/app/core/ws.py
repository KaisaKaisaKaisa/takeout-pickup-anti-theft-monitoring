from __future__ import annotations

from typing import Set
import json
from datetime import datetime, timezone
from fastapi import WebSocket

_connections: Set[WebSocket] = set()
_subscriptions: dict[WebSocket, set[str]] = {}

async def register(ws: WebSocket) -> None:
    _connections.add(ws)
    _subscriptions[ws] = {"*"}

async def unregister(ws: WebSocket) -> None:
    _connections.discard(ws)
    _subscriptions.pop(ws, None)

def update_subscription(ws: WebSocket, topics: list[str] | None) -> None:
    if not topics:
        _subscriptions[ws] = {"*"}
        return
    cleaned = {str(t).strip() for t in topics if str(t).strip()}
    _subscriptions[ws] = cleaned or {"*"}

def _to_payload(message) -> str:
    if isinstance(message, str):
        return message
    try:
        return json.dumps(message, ensure_ascii=False)
    except Exception:
        return str(message)

def _matches(event_type: str | None, topics: set[str]) -> bool:
    if not event_type or "*" in topics:
        return True
    for topic in topics:
        if event_type == topic or event_type.startswith(f"{topic}."):
            return True
    return False

async def broadcast(message, event_type: str | None = None) -> None:
    dead = []
    payload = _to_payload(message)
    for ws in _connections:
        try:
            topics = _subscriptions.get(ws, {"*"})
            if not _matches(event_type, topics):
                continue
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections.discard(ws)
        _subscriptions.pop(ws, None)

async def broadcast_event(event_type: str, payload: dict | None = None) -> None:
    message = {
        "type": event_type,
        "payload": payload or {},
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await broadcast(message, event_type=event_type)
