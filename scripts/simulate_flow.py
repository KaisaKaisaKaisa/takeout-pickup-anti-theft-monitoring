import json
import requests

API = "http://localhost:18000/api/v1"
PHONE = "demo-user"
PASSWORD = "demo-pass"

def login() -> str:
    res = requests.post(
        f"{API}/auth/login",
        json={"phone": PHONE, "password": PASSWORD},
        timeout=5,
    )
    if res.status_code != 200:
        res = requests.post(
            f"{API}/auth/register",
            json={"phone": PHONE, "password": PASSWORD, "name": "Demo"},
            timeout=5,
        )
    return res.json()["access_token"]

def main() -> None:
    token = login()
    headers = {"Authorization": f"Bearer {token}"}

    device = requests.post(
        f"{API}/devices/register",
        json={"name": "Edge-01", "device_type": "dev"},
        headers=headers,
        timeout=5,
    ).json()
    device_code = device.get("device_code")

    order = requests.post(
        f"{API}/orders/manual-import",
        json={"provider": "manual", "merchant_name": "Demo Shop", "item_summary": "Rice + Tea"},
        headers=headers,
        timeout=5,
    ).json()
    order_id = order["id"]

    requests.post(f"{API}/integrations/mock/delivered/{order_id}", headers=headers, timeout=5)
    session = requests.post(f"{API}/orders/{order_id}/arm", headers=headers, timeout=5).json()
    session_id = session["session_id"]

    event_payload = {
        "eventType": "object_missing",
        "severity": "critical",
        "eventTime": "2026-03-12T00:00:00Z",
        "metrics": {"motionScore": 0.95, "roiId": "rack-a-01"},
    }
    requests.post(
        f"{API}/edge/sessions/{session_id}/events",
        json=event_payload,
        headers={"X-Device-Code": device_code},
        timeout=5,
    )

    alerts = requests.get(f"{API}/alerts", headers=headers, timeout=5).json()
    print(json.dumps(alerts, indent=2))

if __name__ == "__main__":
    main()
