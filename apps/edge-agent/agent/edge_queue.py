import json
import os
import time
import requests

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
DEVICE_CODE = os.getenv("DEVICE_CODE", "")
QUEUE_PATH = os.getenv("QUEUE_PATH", "queue.jsonl")

def enqueue(payload: dict) -> None:
    with open(QUEUE_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")

def queue_size() -> int:
    if not os.path.exists(QUEUE_PATH):
        return 0
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        return len(f.readlines())

def flush_queue() -> None:
    if not os.path.exists(QUEUE_PATH):
        return
    lines = []
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
    if not lines:
        return
    remaining = []
    for line in lines:
        try:
            item = json.loads(line.strip())
        except Exception:
            continue
        ok = post_event(item)
        if not ok:
            remaining.append(line)
    with open(QUEUE_PATH, "w", encoding="utf-8") as f:
        f.writelines(remaining)

def post_event(payload: dict) -> bool:
    session_id = payload.get("session_id")
    event = payload.get("event")
    if not session_id or not event:
        return False
    try:
        res = requests.post(
            f"{API_BASE}/edge/sessions/{session_id}/events",
            json=event,
            headers={"X-Device-Code": DEVICE_CODE},
            timeout=5,
        )
        return res.status_code == 200
    except Exception:
        return False

def send_or_queue(session_id: str, event: dict) -> None:
    payload = {"session_id": session_id, "event": event, "ts": time.time()}
    if not post_event(payload):
        enqueue(payload)
