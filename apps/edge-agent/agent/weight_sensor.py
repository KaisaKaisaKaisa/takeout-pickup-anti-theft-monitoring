import os
import time
import random
from datetime import datetime, timezone
from edge_queue import send_or_queue, flush_queue

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
SESSION_ID = os.getenv("SESSION_ID", "")
DEFAULT_DROP = float(os.getenv("WEIGHT_DROP", "300"))
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.json")

def load_drop_threshold() -> float:
    try:
        import json
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        return abs(float(cfg.get("sensitivity", {}).get("max_weight_drop", -DEFAULT_DROP)))
    except Exception:
        return DEFAULT_DROP

def send_event(delta: float) -> None:
    payload = {
        "eventType": "weight_drop",
        "severity": "critical",
        "eventTime": datetime.now(timezone.utc).isoformat(),
        "metrics": {"weightDeltaGram": delta},
    }
    send_or_queue(SESSION_ID, payload)

def main() -> None:
    baseline = 1000.0
    while True:
        # Placeholder: random fluctuation or drop
        current = baseline + random.uniform(-20, 20)
        drop_threshold = load_drop_threshold()
        if random.random() < 0.05:
            current -= drop_threshold + 50
        delta = current - baseline
        if delta < -drop_threshold:
            send_event(delta)
        flush_queue()
        time.sleep(1)

if __name__ == "__main__":
    main()
