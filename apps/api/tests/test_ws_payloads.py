import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

services_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "services"))
sys.path.append(services_dir)

import ws_payloads


class WsPayloadTests(unittest.TestCase):
    def test_device_payload_has_core_fields(self):
        device = SimpleNamespace(
            id=uuid.uuid4(),
            owner_user_id=uuid.uuid4(),
            device_code="dev-1",
            name="Edge-1",
            device_type="camera",
            status="online",
            config_json={"sensitivity": {"min_motion_score": 0.6}},
            last_seen_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        payload = ws_payloads.build_device_payload(device)
        self.assertEqual(payload["id"], str(device.id))
        self.assertEqual(payload["device_code"], "dev-1")
        self.assertEqual(payload["status"], "online")
        self.assertIn("config", payload)
        self.assertIn("last_seen_at", payload)

    def test_rule_match_payload_has_core_fields(self):
        match = SimpleNamespace(
            id=42,
            rule_id=uuid.uuid4(),
            rule_set_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            session_id=uuid.uuid4(),
            event_type="motion",
            action="alert",
            suppressed=False,
            note=None,
            matched_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        payload = ws_payloads.build_rule_match_payload(match, summary="demo")
        self.assertEqual(payload["id"], 42)
        self.assertEqual(payload["rule_id"], str(match.rule_id))
        self.assertEqual(payload["order_id"], str(match.order_id))
        self.assertEqual(payload["event_type"], "motion")
        self.assertEqual(payload["summary"], "demo")

    def test_rule_match_payload_includes_matched_at(self):
        match = SimpleNamespace(
            id=7,
            rule_id=uuid.uuid4(),
            rule_set_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            session_id=uuid.uuid4(),
            event_type="motion",
            action="alert",
            suppressed=False,
            note=None,
            matched_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
        )
        payload = ws_payloads.build_rule_match_payload(match)
        self.assertTrue(payload["matched_at"].startswith("2026-03-14"))

    def test_build_order_payload_min_fields(self):
        order = SimpleNamespace(
            id=uuid.uuid4(),
            provider="meituan",
            status="delivered",
            merchant_name="Demo",
            item_summary="Noodles",
            delivered_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
            expected_pickup_by=None,
            latest_session_id=None,
            updated_at=datetime(2026, 3, 15, tzinfo=timezone.utc),
        )
        payload = ws_payloads.build_order_payload(order)
        self.assertEqual(payload["id"], str(order.id))
        self.assertEqual(payload["status"], "delivered")
        self.assertEqual(payload["summary"], "Noodles")
        self.assertTrue(payload["updated_at"].startswith("2026-03-15"))

    def test_build_alert_payload_min_fields(self):
        alert = SimpleNamespace(
            id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            alert_type="suspicious_pickup",
            level="critical",
            status="open",
            summary="event=motion",
            triggered_at=datetime(2026, 3, 14, tzinfo=timezone.utc),
            rule_id=uuid.uuid4(),
            rule_set_id=uuid.uuid4(),
        )
        payload = ws_payloads.build_alert_payload(alert)
        self.assertEqual(payload["id"], str(alert.id))
        self.assertEqual(payload["status"], "open")
        self.assertEqual(payload["summary"], "event=motion")
        self.assertTrue(payload["triggered_at"].startswith("2026-03-14"))
        self.assertEqual(payload["rule_id"], str(alert.rule_id))
        self.assertEqual(payload["rule_set_id"], str(alert.rule_set_id))

    def test_build_alert_payload_without_rule_meta(self):
        alert = SimpleNamespace(
            id=uuid.uuid4(),
            order_id=None,
            alert_type="device_offline",
            level="warning",
            status="open",
            summary="device offline",
            triggered_at=None,
        )
        payload = ws_payloads.build_alert_payload(alert)
        self.assertIsNone(payload["rule_id"])
        self.assertIsNone(payload["rule_set_id"])

    def test_build_event_payload_min_fields(self):
        entity = {"id": "1", "status": "ok", "summary": "demo", "updated_at": None}
        payload = ws_payloads.build_event_payload("device", entity, {"extra": 1})
        self.assertEqual(payload["entity_type"], "device")
        self.assertEqual(payload["entity"]["id"], "1")
        self.assertEqual(payload["version"], "v1")

if __name__ == "__main__":
    unittest.main()
