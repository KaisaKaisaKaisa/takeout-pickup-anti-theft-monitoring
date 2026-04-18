import importlib.util
import os
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "services", "rule_dsl.py")

def load_module():
    spec = importlib.util.spec_from_file_location("rule_dsl", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class RuleDslTests(unittest.TestCase):
    def test_validate_dsl_rejects_missing_rules(self):
        module = load_module()
        with self.assertRaises(ValueError):
            module.validate_dsl({"op": "and"})

    def test_dsl_to_conditions_simple(self):
        module = load_module()
        dsl = {"op": "and", "rules": [{"field": "motion_score", "op": "gte", "value": 10}]}
        conditions = module.dsl_to_conditions(dsl)
        self.assertEqual(conditions, {"motion_score": {"gte": 10}})

    def test_dsl_to_conditions_or(self):
        module = load_module()
        dsl = {
            "op": "or",
            "rules": [
                {"field": "motion_score", "op": "gte", "value": 10},
                {"field": "weight_delta", "op": "lt", "value": -5},
            ],
        }
        conditions = module.dsl_to_conditions(dsl)
        self.assertIn("$or", conditions)
        self.assertEqual(len(conditions["$or"]), 2)

if __name__ == "__main__":
    unittest.main()
