import os
import time
from datetime import datetime, timezone
import requests
from gpiozero import Button

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
SESSION_ID = os.getenv("SESSION_ID", "")
SENSOR_PIN = int(os.getenv("WEIGHT_SENSOR_PIN", "17"))
DEVICE_CODE = os.getenv("DEVICE_CODE", "")

sensor = Button(SENSOR_PIN, pull_up=True)

def send_drop_event() -> None:
    payload = {
        "eventType": "weight_drop",
        "severity": "critical",
        "eventTime": datetime.now(timezone.utc).isoformat(),
        "metrics": {"weightDeltaGram": -500},
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

def main() -> None:
    while True:
        if sensor.is_pressed:
            send_drop_event()
            time.sleep(2)
        time.sleep(0.1)

if __name__ == "__main__":
    main()
