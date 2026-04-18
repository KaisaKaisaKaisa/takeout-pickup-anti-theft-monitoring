import importlib.util
import os
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

MODULE_PATH = os.path.join(base_dir, "app", "services", "rule_priority.py")


def load_module():
    spec = importlib.util.spec_from_file_location("rule_priority", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RulePriorityTests(unittest.TestCase):
    def test_user_rules_before_global_on_tie(self):
        rule_priority = load_module()
        rules = [
            {"id": "g1", "priority": 10, "scope": "global"},
            {"id": "u1", "priority": 10, "scope": "user"},
        ]
        ordered = rule_priority.order_rules(rules)
        self.assertEqual([r["id"] for r in ordered], ["u1", "g1"])


if __name__ == "__main__":
    unittest.main()
