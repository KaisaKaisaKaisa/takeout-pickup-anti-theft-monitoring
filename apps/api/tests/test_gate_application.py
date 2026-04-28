from datetime import datetime, timedelta, timezone
import os
import sys
from types import SimpleNamespace
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(BASE_DIR)

from app.services import gate_application


class FakeScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


class FakeDb:
    def __init__(self, code_row, order, latest_session=None):
        self.code_row = code_row
        self.order = order
        self.latest_session = latest_session
        self.added = []
        self.committed = False

    async def execute(self, statement):
        text = str(statement)
        if "pickup_codes" in text:
            return FakeScalarResult(self.code_row)
        if "orders" in text:
            return FakeScalarResult(self.order)
        if "monitoring_sessions" in text:
            return FakeScalarResult(self.latest_session)
        return FakeScalarResult(None)

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.committed = True


class GateApplicationTests(unittest.IsolatedAsyncioTestCase):
    async def test_verify_gate_code_records_entry_without_marking_picked_up(self):
        code_row = SimpleNamespace(
            id="code-1",
            code="ABC123",
            order_id="order-1",
            whitelist_profile_id="profile-1",
            used_at=None,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        order = SimpleNamespace(
            id="order-1",
            provider="manual",
            provider_order_id="p-1",
            merchant_name="桂航米粉",
            item_summary="卤菜粉",
            status="delivered",
        )
        session = SimpleNamespace(id="session-1")
        db = FakeDb(code_row, order, session)

        result = await gate_application.verify_gate_code(
            db,
            code="ABC123",
            operator_user_id="operator-1",
            gate_name="北校区东门取餐点",
        )

        self.assertTrue(result.ok)
        self.assertEqual(result.order.status, "delivered")
        self.assertIsNotNone(code_row.used_at)
        self.assertTrue(db.committed)
        confirmations = [item for item in db.added if item.__class__.__name__ == "PickupConfirmation"]
        self.assertEqual(len(confirmations), 1)
        self.assertEqual(confirmations[0].confirm_method, "gate_entry")
        self.assertEqual(confirmations[0].note, "gate=北校区东门取餐点")


if __name__ == "__main__":
    unittest.main()
