# Report Export + Rule Match Log + Frontend Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 报表导出支持时间范围筛选，规则命中日志支持过滤，前端新增筛选与导出反馈。

**Architecture:** 在 API 层增加 `start/end` 参数解析与过滤逻辑，扩展 report cache key；前端在报表与规则命中区域增加日期范围与规则集筛选，并在导出按钮加入下载状态提示。

**Tech Stack:** FastAPI, SQLAlchemy, Python unittest, Vanilla JS.

---

## Notes
- 当前目录不是 git 仓库，无法创建 worktree，也无法提交。若后续迁移到 git，可将每个任务末尾的 “Commit” 步骤恢复执行。

## File Map
- Modify: `apps/api/app/routers/reports.py`
- Modify: `apps/api/app/services/report_service.py`
- Modify: `apps/api/app/routers/rules.py`
- Modify: `apps/api/app/core/cache_invalidation.py` (if cache keys centralized)
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`
- Modify: `apps/pwa/src/styles.css`
- Create: `apps/api/tests/test_report_exports_range.py`
- Create: `apps/api/tests/test_rule_matches_filter.py`
- Create (optional): `apps/pwa/tests/report_filters.test.js`

---

## Chunk 1: Backend - Report Export Range

### Task 1: Export endpoints accept start/end

**Files:**
- Create: `apps/api/tests/test_report_exports_range.py`
- Modify: `apps/api/app/routers/reports.py`
- Modify: `apps/api/app/services/report_service.py`

- [ ] **Step 1: Write the failing test**

```python
import asyncio
import types
import unittest
from datetime import datetime, timezone

from app.services import report_service

class ExportRangeTests(unittest.IsolatedAsyncioTestCase):
    async def test_export_summary_range_filters(self):
        db = types.SimpleNamespace(execute=lambda *_: None)
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 2, tzinfo=timezone.utc)
        data = await report_service.export_report_summary_csv(db, user_id=None, start=start, end=end)
        self.assertIn("report_summary", data.decode("utf-8"))

    async def test_export_trends_range_filters(self):
        db = types.SimpleNamespace(execute=lambda *_: None)
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 8, tzinfo=timezone.utc)
        data = await report_service.export_trends_csv(db, user_id=None, interval="day", start=start, end=end)
        self.assertIn("rule_matches", data.decode("utf-8"))

    async def test_export_rule_matches_range_filters(self):
        db = types.SimpleNamespace(execute=lambda *_: None)
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        end = datetime(2026, 3, 2, tzinfo=timezone.utc)
        data = await report_service.export_rule_matches_csv(db, user_id=None, limit=10, start=start, end=end)
        self.assertIn("rule_matches", data.decode("utf-8"))

if __name__ == "__main__":
    asyncio.run(unittest.main())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_report_exports_range.py -v`  
Expected: FAIL with unexpected args or missing parameters.

- [ ] **Step 3: Write minimal implementation**

Update `apps/api/app/services/report_service.py`:
- `export_report_summary_csv(db, user_id=None, start=None, end=None)`
- `export_trends_csv(db, user_id=None, interval="day", days=7, weeks=4, start=None, end=None)`
- `export_rule_matches_csv(db, user_id=None, limit=200, start=None, end=None)`
- 在 SQL 查询中增加时间范围过滤（`created_at`/`matched_at`/`event_time` 统一策略）。

Update `apps/api/app/routers/reports.py`:
- 解析 `start/end` 参数（允许 `YYYY-MM-DD`）
- 传递给 service 层
- 缓存 key 追加 `start/end`

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_report_exports_range.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/api/app/routers/reports.py apps/api/app/services/report_service.py \
  apps/api/tests/test_report_exports_range.py
git commit -m "feat: add optional date range to report exports"
```

---

## Chunk 2: Backend - Rule Match Filters

### Task 2: Rule matches list supports start/end + rule_set_id

**Files:**
- Create: `apps/api/tests/test_rule_matches_filter.py`
- Modify: `apps/api/app/routers/rules.py`

- [ ] **Step 1: Write the failing test**

```python
import asyncio
import types
import unittest
import uuid
from datetime import datetime, timezone

from app.routers import rules as rules_router

class RuleMatchFilterTests(unittest.IsolatedAsyncioTestCase):
    async def test_rule_matches_filters(self):
        db = types.SimpleNamespace(execute=lambda *_: types.SimpleNamespace(all=lambda: []))
        user = types.SimpleNamespace(id=uuid.uuid4())
        start = datetime(2026, 3, 1, tzinfo=timezone.utc).isoformat()
        end = datetime(2026, 3, 2, tzinfo=timezone.utc).isoformat()
        result = await rules_router.list_rule_matches(
            db=db,
            user=user,
            q=None,
            limit=50,
            page=1,
            start=start,
            end=end,
            rule_set_id=str(uuid.uuid4()),
        )
        self.assertIn("items", result)

if __name__ == "__main__":
    asyncio.run(unittest.main())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_matches_filter.py -v`  
Expected: FAIL due to unexpected args.

- [ ] **Step 3: Write minimal implementation**

Update `apps/api/app/routers/rules.py`:
- `list_rule_matches` 增加参数 `start: str | None = None, end: str | None = None, rule_set_id: str | None = None`
- 解析 `start/end` 为 `datetime`（UTC），格式无效返回 400
- `rule_set_id` 过滤：`RuleMatchLog.rule_set_id == uuid.UUID(rule_set_id)`
- `start/end` 过滤：`RuleMatchLog.matched_at.between(start, end)`

- [ ] **Step 4: Run test to verify it passes**

Run: `py -3.12 -m unittest apps/api/tests/test_rule_matches_filter.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/api/app/routers/rules.py apps/api/tests/test_rule_matches_filter.py
git commit -m "feat: add filters to rule match list"
```

---

## Chunk 3: Frontend - Filters + Export Feedback

### Task 3: Report filters and export feedback UI

**Files:**
- Modify: `apps/pwa/src/index.html`
- Modify: `apps/pwa/src/app.js`
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: Update UI layout**

Add date range inputs in reports section and rule matches section.

- [ ] **Step 2: Wire state + query params**

In `app.js`:
- add `state.reportRange = { start: "", end: "" }`
- when start/end set, loadReports uses them
- export buttons include start/end
- rule matches load function includes start/end + rule_set_id

- [ ] **Step 3: Add export loading states**

Add a `setBusy(button, label)` helper to disable/enable and restore label.

- [ ] **Step 4: Optional frontend test**

Create `apps/pwa/tests/report_filters.test.js` to verify param build helper.

- [ ] **Step 5: Manual smoke check**

Run PWA locally and confirm:
- reports refresh respects range
- exports trigger download with correct params
- rule matches list respects filters

- [ ] **Step 6: Commit**

Skip (not a git repo). If git is enabled later:
```bash
git add apps/pwa/src/index.html apps/pwa/src/app.js apps/pwa/src/styles.css
git commit -m "feat: add report filters and export feedback"
```

---

## Final Verification

- [ ] Run new backend tests:
```
py -3.12 -m unittest apps/api/tests/test_report_exports_range.py -v
py -3.12 -m unittest apps/api/tests/test_rule_matches_filter.py -v
```
Expected: PASS.

- [ ] (Optional) Run frontend tests if added:
```
node apps/pwa/tests/report_filters.test.js
```
