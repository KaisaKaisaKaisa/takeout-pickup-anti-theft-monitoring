import ast
import os
import unittest


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GATE_APPLICATION = os.path.join(BASE_DIR, "app", "services", "gate_application.py")


class GateRepositoryBoundaryTests(unittest.TestCase):
    def setUp(self):
        with open(GATE_APPLICATION, "r", encoding="utf-8") as handle:
            self.source = handle.read()
        self.tree = ast.parse(self.source)

    def test_gate_application_delegates_persistence_to_repository(self):
        imports_repository = any(
            isinstance(node, ast.ImportFrom)
            and node.module == "app.repositories"
            and any(alias.name == "gate_repository" for alias in node.names)
            for node in self.tree.body
        )
        self.assertTrue(imports_repository, "gate_application should import app.repositories.gate_repository")

        forbidden_names = {"select"}
        forbidden_attrs = {"where", "join", "order_by", "limit", "scalar_one", "scalar_one_or_none"}
        seen_names = {
            call.func.id
            for call in ast.walk(self.tree)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
        }
        seen_attrs = {
            call.func.attr
            for call in ast.walk(self.tree)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
        }
        self.assertFalse(
            forbidden_names & seen_names,
            f"gate_application should not build SQL queries directly: {forbidden_names & seen_names}",
        )
        self.assertFalse(
            forbidden_attrs & seen_attrs,
            f"gate_application should not parse SQLAlchemy results directly: {forbidden_attrs & seen_attrs}",
        )


if __name__ == "__main__":
    unittest.main()
