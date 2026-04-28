# Gate Access WebView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the project into a fence-gate pickup-code verification system with pages usable from web browsers and WeChat Mini Program web-view.

**Architecture:** Reuse existing orders, pickup codes, pickup confirmations, audit logs, and PWA shell. Add a focused `gate` API router for issuing student pickup codes and verifying them at the fenced entrance; add standalone mobile React pages for `/pickup` and `/gate` that can be embedded by a Mini Program web-view.

**Tech Stack:** FastAPI, SQLAlchemy async models, Pydantic schemas, React + Vite + TypeScript.

---

### Task 1: Backend Gate Contracts

**Files:**
- Modify: `apps/api/app/schemas/schemas.py`
- Create: `apps/api/app/routers/gate.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_api_contracts.py`
- Test: `apps/api/tests/test_gate_application.py`

- [ ] Add OpenAPI contract tests for `POST /api/v1/gate/verify-code`, `POST /api/v1/gate/orders/{order_id}/pickup-code`, and `GET /api/v1/gate/recent-verifications`.
- [ ] Implement gate schemas and router endpoints.
- [ ] Ensure gate verification consumes a pickup code, creates a `PickupConfirmation` with `confirm_method="gate_entry"`, writes an audit log, and does not mark the order `picked_up`.

### Task 2: Frontend Mobile Gate Pages

**Files:**
- Modify: `apps/pwa/src/types.ts`
- Modify: `apps/pwa/src/lib/api.ts`
- Create: `apps/pwa/src/pages/GatePage.tsx`
- Create: `apps/pwa/src/pages/PickupPage.tsx`
- Modify: `apps/pwa/src/App.tsx`
- Modify: `apps/pwa/src/styles.css`

- [ ] Add API client methods for pickup code issue and gate verification.
- [ ] Add `/gate` standalone verification page for entrance staff.
- [ ] Add `/pickup` standalone student pickup-code page.
- [ ] Use path-based rendering so the same built web app can be opened in a browser or WeChat Mini Program web-view.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/solution.md`

- [ ] Document the fenced gate workflow and Mini Program web-view deployment note.
- [ ] Run targeted backend tests.
- [ ] Run PWA TypeScript build.
