import os
import time
from edge_queue import flush_queue, queue_size
import requests
from datetime import datetime, timezone

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
DEVICE_ID = os.getenv("DEVICE_ID", "device-id")
DEVICE_CODE = os.getenv("DEVICE_CODE", "")
SESSION_ID = os.getenv("SESSION_ID", "session-id")
SEND_TEST_EVENT = os.getenv("SEND_TEST_EVENT", "0") == "1"

def heartbeat():
    payload = {"queue_size": queue_size()}
    try:
        requests.post(
            f"{API_BASE}/edge/devices/{DEVICE_ID}/heartbeat",
            headers={"X-Device-Code": DEVICE_CODE},
            json=payload,
            timeout=5,
        )
    except Exception:
        pass

def send_test_event():
    payload = {
        "eventType": "object_missing",
        "severity": "critical",
        "eventTime": datetime.now(timezone.utc).isoformat(),
        "metrics": {"motionScore": 0.91, "roiId": "rack-a-01"},
    }
    try:
        requests.post(
            f"{API_BASE}/edge/sessions/{SESSION_ID}/events",
            json=payload,
            headers={"X-Device-Code": DEVICE_CODE},
            timeout=5,
        )
    except Exception:
        pass

def main():
    while True:
        heartbeat()
        if SEND_TEST_EVENT:
            send_test_event()
        flush_queue()
        time.sleep(10)

if __name__ == "__main__":
    main()
