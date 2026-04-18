import os
import time
from datetime import datetime, timezone
from edge_queue import send_or_queue, flush_queue
import cv2

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
SESSION_ID = os.getenv("SESSION_ID", "")
DEFAULT_THRESH = float(os.getenv("MOTION_THRESH", "5000"))
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.json")

def load_threshold() -> float:
    try:
        import json
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        return float(cfg.get("sensitivity", {}).get("min_motion_score", DEFAULT_THRESH))
    except Exception:
        return DEFAULT_THRESH

def send_event(score: float) -> None:
    payload = {
        "eventType": "object_missing",
        "severity": "warning",
        "eventTime": datetime.now(timezone.utc).isoformat(),
        "metrics": {"motionScore": score, "roiId": "rack-a-01"},
    }
    send_or_queue(SESSION_ID, payload)

def main() -> None:
    cap = cv2.VideoCapture(0)
    bg = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=32, detectShadows=False)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    last_send = 0.0

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.2)
            continue
        mask = bg.apply(frame)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        area = max([cv2.contourArea(c) for c in contours], default=0)
        thresh = load_threshold()
        if area > thresh and time.time() - last_send > 5:
            send_event(area)
            last_send = time.time()
        flush_queue()
        time.sleep(0.1)

if __name__ == "__main__":
    main()
