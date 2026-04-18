# Rule DSL Validate API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a validation endpoint for rule DSL that returns converted `conditions` without persisting a rule.

**Architecture:** Add a small POST route under `rules` that calls `validate_dsl` + `dsl_to_conditions` and returns the result or 400 on errors.

**Tech Stack:** FastAPI, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/routers/rules.py` (add `/dsl/validate` route)
- Create: `apps/api/tests/test_rule_dsl_validate_api.py` (unit test)

---

## Chunk 1: Tests

### Task 1: Add failing test

**Files:**
- Create: `apps/api/tests/test_rule_dsl_validate_api.py`

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

class RuleDslValidateApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_validate_dsl_returns_conditions(self):
        module = load_module()
        payload = {"dsl_json": {"op": "and", "rules": [{"field": "motion_score", "op": "gte", "value": 5}]}}
        result = await module.validate_dsl_route(payload)
        self.assertEqual(result["ok"], True)
        self.assertEqual(result["conditions"], {"motion_score": {"gte": 5}})

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_validate_api.py -v`  
Expected: FAIL (route missing)

---

## Chunk 2: Implement Route

### Task 2: Add `/dsl/validate` route

**Files:**
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Implement route**
```python
@router.post("/dsl/validate")
async def validate_dsl_route(payload: dict):
    dsl_json = payload.get("dsl_json")
    if not dsl_json:
        raise HTTPException(status_code=400, detail="Missing dsl_json")
    try:
        validate_dsl(dsl_json)
        conditions = dsl_to_conditions(dsl_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "conditions": conditions}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_validate_api.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all DSL tests**

Run:
- `py -3.12 -m unittest apps/api/tests/test_rule_dsl_validate_api.py -v`

Expected: PASS

