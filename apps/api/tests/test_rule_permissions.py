import importlib.util
import os
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

MODULE_PATH = os.path.join(base_dir, "app", "services", "rule_permissions.py")


def load_module():
    spec = importlib.util.spec_from_file_location("rule_permissions", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RulePermissionTests(unittest.TestCase):
    def test_non_admin_cannot_edit_global(self):
        rule_permissions = load_module()
        user = {"id": "u1", "is_admin": False}
        ruleset = {"id": "rs1", "scope": "global", "owner_user_id": "admin"}
        self.assertFalse(rule_permissions.can_edit_rule_set(user, ruleset))

    def test_non_admin_can_edit_own(self):
        rule_permissions = load_module()
        user = {"id": "u1", "is_admin": False}
        ruleset = {"id": "rs1", "scope": "user", "owner_user_id": "u1"}
        self.assertTrue(rule_permissions.can_edit_rule_set(user, ruleset))


if __name__ == "__main__":
    unittest.main()
