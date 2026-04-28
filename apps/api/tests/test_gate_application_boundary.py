import ast
import os
import unittest


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GATE_ROUTER = os.path.join(BASE_DIR, "app", "routers", "gate.py")


class GateApplicationBoundaryTests(unittest.TestCase):
    def setUp(self):
        with open(GATE_ROUTER, "r", encoding="utf-8") as handle:
            self.source = handle.read()
        self.tree = ast.parse(self.source)

    def _function_node(self, name: str) -> ast.AsyncFunctionDef:
        for node in self.tree.body:
            if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
                return node
        self.fail(f"{name} route was not found")

    def assert_delegates_to_gate_application(self, route_name: str, service_call: str):
        node = self._function_node(route_name)
        calls = [
            call
            for call in ast.walk(node)
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "gate_application"
        ]
        self.assertTrue(
            any(call.func.attr == service_call for call in calls),
            f"{route_name} should delegate to gate_application.{service_call}",
        )

    def assert_route_has_no_persistence_logic(self, route_name: str):
        node = self._function_node(route_name)
        forbidden_calls = {"execute", "commit", "add", "select", "join", "where", "order_by", "limit"}
        seen = {
            call.func.attr
            for call in ast.walk(node)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
        }
        seen.update(
            call.func.id
            for call in ast.walk(node)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
        )
        self.assertFalse(
            forbidden_calls & seen,
            f"{route_name} should not perform persistence logic directly: {forbidden_calls & seen}",
        )

    def test_gate_routes_delegate_to_application_service(self):
        expected = {
            "issue_pickup_code": "issue_pickup_code",
            "verify_code": "verify_gate_code",
            "recent_verifications": "recent_verifications",
        }
        for route_name, service_call in expected.items():
            with self.subTest(route=route_name):
                self.assert_delegates_to_gate_application(route_name, service_call)
                self.assert_route_has_no_persistence_logic(route_name)


if __name__ == "__main__":
    unittest.main()
