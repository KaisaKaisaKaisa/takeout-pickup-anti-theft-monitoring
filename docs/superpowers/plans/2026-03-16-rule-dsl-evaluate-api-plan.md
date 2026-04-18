# Rule DSL Evaluate API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an evaluation endpoint that checks whether metrics satisfy a rule DSL.

**Architecture:** Add a POST route under `rules` that validates DSL, converts to conditions, runs `_match_conditions`, and returns the match result. Add a unit test for match and non-match.

**Tech Stack:** FastAPI, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/routers/rules.py` (add `/dsl/evaluate` route)
- Create: `apps/api/tests/test_rule_dsl_evaluate_api.py` (unit test)

---

## Chunk 1: Tests

### Task 1: Add failing test

**Files:**
- Create: `apps/api/tests/test_rule_dsl_evaluate_api.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import os
import unittest

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "rules.py")

def load_module():
    spec = importlib.util.spec_from_file_location("rules_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class RuleDslEvaluateApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_evaluate_matches(self):
        module = load_module()
        payload = {
            "dsl_json": {"op": "and", "rules": [{"field": "motion_score", "op": "gte", "value": 5}]},
            "metrics": {"motion_score": 10},
        }
        result = await module.evaluate_dsl_route(payload)
        self.assertEqual(result["matched"], True)

    async def test_evaluate_no_match(self):
        module = load_module()
        payload = {
            "dsl_json": {"op": "and", "rules": [{"field": "motion_score", "op": "gte", "value": 5}]},
            "metrics": {"motion_score": 1},
        }
        result = await module.evaluate_dsl_route(payload)
        self.assertEqual(result["matched"], False)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_evaluate_api.py -v`  
Expected: FAIL (route missing)

---

## Chunk 2: Implement Route

### Task 2: Add `/dsl/evaluate` route

**Files:**
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Implement route**
```python
@router.post("/dsl/evaluate")
async def evaluate_dsl_route(payload: dict):
    dsl_json = payload.get("dsl_json")
    metrics = payload.get("metrics")
    if not dsl_json:
        raise HTTPException(status_code=400, detail="Missing dsl_json")
    if metrics is None:
        raise HTTPException(status_code=400, detail="Missing metrics")
    try:
        validate_dsl(dsl_json)
        conditions = dsl_to_conditions(dsl_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    matched = _match_conditions(metrics, conditions)
    return {"ok": True, "matched": bool(matched), "conditions": conditions}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_evaluate_api.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all evaluate tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_evaluate_api.py -v`  
Expected: PASS

