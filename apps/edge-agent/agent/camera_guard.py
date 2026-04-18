import os
import time
import requests
import cv2
from edge_queue import flush_queue

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
SESSION_ID = os.getenv("SESSION_ID", "")
INCIDENT_ID = os.getenv("INCIDENT_ID", "")
MEDIA_TYPE = os.getenv("MEDIA_TYPE", "snapshot")
DEVICE_CODE = os.getenv("DEVICE_CODE", "")

def capture_snapshot() -> bytes:
    cap = cv2.VideoCapture(0)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return b""
    ret, buf = cv2.imencode(".jpg", frame)
    if not ret:
        return b""
    return buf.tobytes()

def upload_snapshot(data: bytes) -> None:
    if not data:
        return
    files = {"file": ("snapshot.jpg", data, "image/jpeg")}
    payload = {
        "media_type": MEDIA_TYPE,
        "session_id": SESSION_ID,
        "incident_id": INCIDENT_ID,
    }
    requests.post(
        f"{API_BASE}/media/upload",
        files=files,
        data=payload,
        headers={"X-Device-Code": DEVICE_CODE},
        timeout=10,
    )

def main() -> None:
    while True:
        snap = capture_snapshot()
        upload_snapshot(snap)
        flush_queue()
        time.sleep(10)

if __name__ == "__main__":
    main()
