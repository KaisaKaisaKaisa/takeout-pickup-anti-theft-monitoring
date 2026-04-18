# Rule DSL Meta API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a metadata endpoint for the rule DSL with supported operators and example payloads.

**Architecture:** Add a GET route under `rules` that returns a static payload for editor use; add a unit test for response structure.

**Tech Stack:** FastAPI, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/routers/rules.py` (add `/dsl/meta` route)
- Create: `apps/api/tests/test_rule_dsl_meta_api.py` (unit test)

---

## Chunk 1: Tests

### Task 1: Add failing test

**Files:**
- Create: `apps/api/tests/test_rule_dsl_meta_api.py`

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

class RuleDslMetaApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_meta_has_operators_and_examples(self):
        module = load_module()
        result = await module.get_dsl_meta()
        self.assertIn("operators", result)
        self.assertIn("examples", result)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_meta_api.py -v`  
Expected: FAIL (route missing)

---

## Chunk 2: Implement Route

### Task 2: Add `/dsl/meta` route

**Files:**
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Implement route**
```python
@router.get("/dsl/meta")
async def get_dsl_meta():
    return {
        "operators": {
            "boolean": ["and", "or"],
            "compare": ["gt", "gte", "lt", "lte", "eq", "neq"],
        },
        "examples": [
            {
                "dsl_json": {
                    "op": "and",
                    "rules": [
                        {"field": "motion_score", "op": "gte", "value": 1200},
                        {"field": "weight_delta", "op": "lt", "value": -50},
                    ],
                }
            }
        ],
    }
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_meta_api.py -v`  
Expected: PASS

---

## Chunk 3: Final Verification

- [ ] **Step 1: Run all meta tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_dsl_meta_api.py -v`  
Expected: PASS

