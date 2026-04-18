import json
import os
import time
import requests

API_BASE = os.getenv("API_BASE", "http://localhost:18000/api/v1")
DEVICE_ID = os.getenv("DEVICE_ID", "")
DEVICE_CODE = os.getenv("DEVICE_CODE", "")
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.json")

def fetch_config() -> dict:
    res = requests.get(
        f"{API_BASE}/edge/devices/{DEVICE_ID}/config",
        headers={"X-Device-Code": DEVICE_CODE},
        timeout=5,
    )
    if res.status_code != 200:
        return {}
    return res.json().get("config", {}) or {}

def save_config(cfg: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f)

def main() -> None:
    while True:
        cfg = fetch_config()
        if cfg:
            save_config(cfg)
        time.sleep(10)

if __name__ == "__main__":
    main()
