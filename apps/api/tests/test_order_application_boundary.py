import ast
import os
import unittest


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ORDERS_ROUTER = os.path.join(BASE_DIR, "app", "routers", "orders.py")


class OrderApplicationBoundaryTests(unittest.TestCase):
    def setUp(self):
        with open(ORDERS_ROUTER, "r", encoding="utf-8") as handle:
            self.source = handle.read()
        self.tree = ast.parse(self.source)

    def _function_node(self, name: str) -> ast.AsyncFunctionDef:
        for node in self.tree.body:
            if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
                return node
        self.fail(f"{name} route was not found")

    def assert_delegates_to_order_application(self, route_name: str, service_call: str):
        node = self._function_node(route_name)
        calls = [
            call
            for call in ast.walk(node)
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "order_application"
        ]
        self.assertTrue(
            any(call.func.attr == service_call for call in calls),
            f"{route_name} should delegate to order_application.{service_call}",
        )

    def assert_route_has_no_side_effect_calls(self, route_name: str):
        node = self._function_node(route_name)
        forbidden_attrs = {"commit", "broadcast_event", "invalidate_report_caches", "log_action"}
        seen = {
            call.func.attr
            for call in ast.walk(node)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
        }
        self.assertFalse(
            forbidden_attrs & seen,
            f"{route_name} should not directly perform side effects: {forbidden_attrs & seen}",
        )

    def test_order_mutation_routes_delegate_to_application_service(self):
        expected = {
            "manual_import": "manual_import",
            "confirm_pickup": "confirm_pickup",
            "arm_order": "arm_order",
        }
        for route_name, service_call in expected.items():
            with self.subTest(route=route_name):
                self.assert_delegates_to_order_application(route_name, service_call)
                self.assert_route_has_no_side_effect_calls(route_name)


if __name__ == "__main__":
    unittest.main()
