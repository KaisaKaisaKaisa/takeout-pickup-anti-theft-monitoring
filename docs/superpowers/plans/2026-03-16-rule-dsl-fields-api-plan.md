# Rule DSL Fields API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a metadata endpoint listing available DSL fields for the rule editor.

**Architecture:** Add a static GET route under `rules` returning a curated list of fields; add a unit test for response structure.

**Tech Stack:** FastAPI, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/routers/rules.py` (add `/dsl/fields` route)
- Create: `apps/api/tests/test_rule_dsl_fields_api.py` (unit test)

---

## Chunk 1: Tests

### Task 1: Add failing test

**Files:**
- Create: `apps/api/tests/test_rule_dsl_fields_api.py`

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

class RuleDslFieldsApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_fields_payload_present(self):
        module = load_module()
        result = await module.get_dsl_fields()
        self.assertIn("fields", result)
        self.assertTrue(len(result["fields"]) >= 1)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_fields_api.py -v`  
Expected: FAIL (route missing)

---

## Chunk 2: Implement Route

### Task 2: Add `/dsl/fields` route

**Files:**
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Implement route**
```python
@router.get("/dsl/fields")
async def get_dsl_fields():
    return {
        "fields": [
            {"key": "motion_score", "type": "number", "label": "Motion Score", "unit": "score", "example": 1200},
            {"key": "weight_delta", "type": "number", "label": "Weight Delta", "unit": "g", "example": -50},
            {"key": "motion", "type": "number", "label": "Motion", "unit": "score", "example": 0.5},
            {"key": "presence", "type": "boolean", "label": "Presence Detected", "example": True},
            {"key": "noise_db", "type": "number", "label": "Noise Level", "unit": "dB", "example": 62},
        ]
    }
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_fields_api.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all fields tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_fields_api.py -v`  
Expected: PASS

