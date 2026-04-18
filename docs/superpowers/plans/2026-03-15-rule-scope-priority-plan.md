# Rule Scope & Priority Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure rule evaluation respects scope with user-first priority on ties and enforce read-only global rules for non-admins.

**Architecture:** Update rule selection ordering in `alert_engine` to prioritize user rules over global rules at equal priority. Add permission guardrails and tests to validate ordering and restricted edits.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `unittest`.

---

## File Structure

- Modify: `apps/api/app/services/alert_engine.py` (rule ordering)
- Modify: `apps/api/app/routers/rules.py` (optional: ensure read-only global behavior is enforced)
- Create: `apps/api/tests/test_rule_priority.py` (ordering test)
- Create: `apps/api/tests/test_rule_permissions.py` (global rule edit restriction test)

---

## Chunk 1: Rule Ordering Priority (User > Global on Tie)

### Task 1: Add rule ordering test

**Files:**
- Create: `apps/api/tests/test_rule_priority.py`

- [ ] **Step 1: Write the failing test**

```python
import unittest

from app.services.rule_priority import order_rules


class RulePriorityTests(unittest.TestCase):
    def test_user_rules_before_global_on_tie(self):
        rules = [
            {"id": "g1", "priority": 10, "scope": "global"},
            {"id": "u1", "priority": 10, "scope": "user"},
        ]
        ordered = order_rules(rules)
        self.assertEqual([r["id"] for r in ordered], ["u1", "g1"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_priority.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.rule_priority'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/app/services/rule_priority.py`:

```python
from __future__ import annotations

def _scope_rank(scope: str | None) -> int:
    return 0 if scope == "user" else 1


def order_rules(rules: list[dict]) -> list[dict]:
    return sorted(rules, key=lambda r: (r.get("priority", 0), _scope_rank(r.get("scope"))))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_priority.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/rule_priority.py apps/api/tests/test_rule_priority.py
git commit -m "feat: add rule ordering helper"
```

### Task 2: Wire ordering into alert engine

**Files:**
- Modify: `apps/api/app/services/alert_engine.py`

- [ ] **Step 1: Update rule ordering**

Change rules query to apply scope ordering. Example snippet:

```python
from sqlalchemy import case
from app.services.rule_priority import _scope_rank

scope_order = case((RuleSet.scope == "user", 0), else_=1)
rules = (
    await db.execute(
        select(Rule, RuleSet.scope)
        .join(RuleSet, Rule.rule_set_id == RuleSet.id)
        .where(Rule.rule_set_id.in_(rule_set_ids))
        .where(Rule.enabled == True)
        .order_by(Rule.priority.asc(), scope_order.asc(), Rule.created_at.desc())
    )
).all()

for rule, scope in rules:
    rule_scope = scope
```

- [ ] **Step 2: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_priority.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/services/alert_engine.py
git commit -m "feat: prioritize user rules over global on tie"
```

---

## Chunk 2: Global Rule Read-Only for Non-Admins

### Task 3: Add permission tests

**Files:**
- Create: `apps/api/tests/test_rule_permissions.py`

- [ ] **Step 1: Write the failing test**

```python
import unittest

from app.services.rule_permissions import can_edit_rule_set


class RulePermissionTests(unittest.TestCase):
    def test_non_admin_cannot_edit_global(self):
        user = {"id": "u1", "is_admin": False}
        ruleset = {"id": "rs1", "scope": "global", "owner_user_id": "admin"}
        self.assertFalse(can_edit_rule_set(user, ruleset))

    def test_non_admin_can_edit_own(self):
        user = {"id": "u1", "is_admin": False}
        ruleset = {"id": "rs1", "scope": "user", "owner_user_id": "u1"}
        self.assertTrue(can_edit_rule_set(user, ruleset))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_permissions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.rule_permissions'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/app/services/rule_permissions.py`:

```python
from __future__ import annotations

def can_edit_rule_set(user: dict, ruleset: dict) -> bool:
    if user.get("is_admin"):
        return True
    if ruleset.get("scope") == "global":
        return False
    return ruleset.get("owner_user_id") == user.get("id")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_permissions.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/rule_permissions.py apps/api/tests/test_rule_permissions.py
git commit -m "feat: add rule set permission helper"
```

### Task 4: Use permission helper in rules router

**Files:**
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Replace inline checks with helper**

```python
from app.services.rule_permissions import can_edit_rule_set

... if not can_edit_rule_set({"id": str(user.id), "is_admin": is_admin_user(user)}, {"owner_user_id": str(rule_set.owner_user_id), "scope": rule_set.scope}):
    raise HTTPException(status_code=403, detail="Forbidden")
```

- [ ] **Step 2: Run tests**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_permissions.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/routers/rules.py
git commit -m "chore: centralize rule set edit permission"
```

---

## Chunk 3: Documentation Update

### Task 5: Update docs for rule scope behavior

**Files:**
- Modify: `docs/spec.md`

- [ ] **Step 1: Update rule scope section**
Add note:
- Global rule sets are visible to all users but read-only for non-admins.
- Effective evaluation order: `priority ASC`, user rules before global rules on ties.

- [ ] **Step 2: Commit**

```bash
git add docs/spec.md
git commit -m "docs: clarify rule scope and priority"
```

---

## Verification

- [ ] `py -3.12 -m unittest apps/api/tests/test_rule_priority.py -v`
- [ ] `py -3.12 -m unittest apps/api/tests/test_rule_permissions.py -v`
