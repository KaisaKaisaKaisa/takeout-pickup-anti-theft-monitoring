# Rule DSL Storage & Validation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual-rule DSL with validation and conversion to existing `conditions`, keeping rules backward compatible.

**Architecture:** Introduce `rule_dsl` service for validation + conversion, extend Rule model and schemas with `dsl_json`, and update rule create/update endpoints to accept DSL and derive `conditions`.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/models/entities.py` (add `Rule.dsl_json`)
- Modify: `apps/api/app/schemas/schemas.py` (add `dsl_json` to RuleCreate/RuleOut)
- Create: `apps/api/app/services/rule_dsl.py` (validate/convert DSL)
- Modify: `apps/api/app/services/alert_engine.py` (support `$or` in `_match_conditions`)
- Modify: `apps/api/app/routers/rules.py` (use DSL if provided)
- Create: `apps/api/tests/test_rule_dsl.py` (unit tests for validation/conversion)

---

## Chunk 1: DSL Service + Tests

### Task 1: Add failing tests for DSL

**Files:**
- Create: `apps/api/tests/test_rule_dsl.py`

- [ ] **Step 1: Write the failing tests**

```python
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
        dsl = {"op": "or", "rules": [
            {"field": "motion_score", "op": "gte", "value": 10},
            {"field": "weight_delta", "op": "lt", "value": -5},
        ]}
        conditions = module.dsl_to_conditions(dsl)
        self.assertIn("$or", conditions)
        self.assertEqual(len(conditions["$or"]), 2)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl.py -v`  
Expected: FAIL (module missing)

---

### Task 2: Implement DSL service

**Files:**
- Create: `apps/api/app/services/rule_dsl.py`

- [ ] **Step 1: Implement validation + conversion**

```python
ALLOWED_OPS = {"and", "or"}
ALLOWED_COMP = {"gt", "gte", "lt", "lte", "eq", "neq"}

def validate_dsl(dsl: dict) -> None:
    if not isinstance(dsl, dict):
        raise ValueError("dsl must be object")
    op = dsl.get("op")
    rules = dsl.get("rules")
    if op not in ALLOWED_OPS:
        raise ValueError("invalid op")
    if not isinstance(rules, list) or not rules:
        raise ValueError("rules must be non-empty list")
    for rule in rules:
        if "op" in rule and "rules" in rule:
            validate_dsl(rule)
            continue
        if rule.get("op") not in ALLOWED_COMP:
            raise ValueError("invalid comparator")
        if "field" not in rule:
            raise ValueError("missing field")

def dsl_to_conditions(dsl: dict) -> dict:
    validate_dsl(dsl)
    op = dsl["op"]
    rules = dsl["rules"]
    if op == "or":
        return {"$or": [dsl_to_conditions({"op": "and", "rules": [r]}) for r in rules]}
    conditions = {}
    for rule in rules:
        if "op" in rule and "rules" in rule:
            child = dsl_to_conditions(rule)
            if "$or" in child:
                conditions.setdefault("$or", []).extend(child["$or"])
            else:
                conditions.update(child)
            continue
        field = rule["field"]
        comp = rule["op"]
        value = rule.get("value")
        conditions.setdefault(field, {})
        if comp == "eq":
            conditions[field] = value
        elif comp == "neq":
            conditions[field] = {"neq": value}
        else:
            conditions[field][comp] = value
    return conditions
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl.py -v`  
Expected: PASS

---

## Chunk 2: Wire DSL into Models and Routes

### Task 3: Extend Rule model + schemas

**Files:**
- Modify: `apps/api/app/models/entities.py`
- Modify: `apps/api/app/schemas/schemas.py`

- [ ] **Step 1: Add `dsl_json` to Rule model**
```python
dsl_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 2: Add `dsl_json` to RuleCreate / RuleOut**
```python
dsl_json: dict | None = None
```

- [ ] **Step 3: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl.py -v`  
Expected: PASS

---

### Task 4: Update rule create/update and matching

**Files:**
- Modify: `apps/api/app/routers/rules.py`
- Modify: `apps/api/app/services/alert_engine.py`

- [ ] **Step 1: In `create_rule`**
  - If `payload.dsl_json` provided: validate + convert to `conditions`.
  - Store both `dsl_json` and `conditions`.

- [ ] **Step 2: In `update_rule`**
  - If `payload.dsl_json` provided: validate + convert to `conditions`.
  - Persist to model.

- [ ] **Step 3: Extend `_match_conditions` to support `$or`**
```python
if "$or" in conditions:
    return any(_match_conditions(metrics, cond) for cond in conditions["$or"])
```

- [ ] **Step 4: Run tests**

Run:
- `py -3.12 -m unittest apps/api/tests/test_rule_dsl.py -v`
- `py -3.12 -m unittest apps/api/tests/test_alert_dedupe.py -v`

Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all DSL tests**

Run:
- `py -3.12 -m unittest apps/api/tests/test_rule_dsl.py -v`

Expected: PASS

---

## Notes
- This repo has no migrations. Manual DB changes required to add `dsl_json`.
