# Architecture

This project is organized around a five-layer product architecture. The goal is to make the fenced takeout pickup system easy to explain, implement and debug: user-visible behavior starts in the frontend, crosses the API contract, runs backend business rules, persists in the database and relies on infrastructure for supporting capabilities.

## 产品核心架构层次

### 前端

Responsibility: user-visible page display and interaction feedback.

Project locations:

- `apps/pwa/src/pages/PickupPage.tsx` renders the student pickup page at `/pickup`.
- `apps/pwa/src/pages/GatePage.tsx` renders the staff gate verification page at `/gate`.
- `apps/pwa/src/styles.css` contains the mobile/web-view visual treatment used by the gate and pickup pages.

In the current fenced pickup flow, students generate a one-time pickup code on `/pickup`; gate staff enter or scan that code on `/gate` and receive immediate feedback such as "allowed to enter" or an API error message.

### API

Responsibility: the communication bridge between frontend and backend, including request URLs, request payloads, response payloads, authentication dependencies and HTTP error mapping.

Project locations:

- `apps/pwa/src/lib/api.ts` defines browser-side API calls such as `issuePickupCode`, `verifyGateCode` and `recentGateVerifications`.
- `apps/api/app/routers/gate.py` exposes the HTTP routes under `/api/v1/gate`.
- `apps/api/app/schemas/schemas.py` defines request and response models such as `PickupCodeOut`, `GateVerifyIn`, `GateVerifyOut` and `GateVerificationListOut`.

Boundary rule: frontend pages call the typed API client instead of building raw URLs; API routers should stay thin and delegate business behavior to backend services.

### 后端

Responsibility: core business logic such as ownership checks, pickup-code TTL rules, one-time-use validation, gate-entry confirmation and audit logging.

Project locations:

- `apps/api/app/services/gate_application.py` owns the fenced pickup workflow rules.
- `apps/api/app/services/order_application.py` owns order mutation workflows.
- `apps/api/app/services/audit_service.py` records auditable actions.
- Other service modules handle alerts, reports, evidence, devices and sessions.

In the current gate flow, `gate_application.issue_pickup_code` checks that an order exists and belongs to the student before issuing or reusing a valid code. `gate_application.verify_gate_code` checks whether the code exists, is unused and is not expired, then records a `gate_entry` confirmation.

Boundary rule: backend services decide business outcomes; they do not own HTTP response formatting, and they do not scatter SQL query construction through routers.

### 数据库

Responsibility: persistent business data, database access and schema evolution.

Project locations:

- `apps/api/app/models/entities.py` defines persisted entities such as `Order`, `PickupCode` and `PickupConfirmation`.
- `apps/api/app/repositories/gate_repository.py` centralizes database access for the gate workflow.
- `apps/api/migrations` contains schema migration history.
- PostgreSQL is the primary relational store in `infra/compose/docker-compose.yml`.

For product architecture, `repositories` are part of the database layer: they keep SQLAlchemy query details close to persistence instead of mixing them into API routers or business workflows.

Core gate data:

- `orders`: the business order record.
- `pickup_codes`: the one-time entry credential, including `code`, `expires_at` and `used_at`.
- `pickup_confirmations`: the gate-entry verification record, including `confirm_method`, `confirmed_by_user_id`, `confirmed_at` and gate notes.

### 基础设施

Responsibility: supporting capabilities that do not belong purely to frontend, API, backend or database.

Project locations:

- `apps/api/app/core/security.py` handles authentication and token concerns.
- `apps/api/app/core/config.py` handles runtime configuration.
- `apps/api/app/core/cache.py` and Redis support cache/runtime coordination.
- `apps/api/app/services/storage_service.py` and MinIO/object storage support evidence media.
- `apps/api/app/worker.py` runs background checks.
- `infra/compose/docker-compose.yml` defines local deployment services and port mappings.

In the fenced pickup scheme, the minimum required infrastructure is authentication, API runtime, PostgreSQL and frontend hosting. Redis, object storage, edge devices and workers are supporting capabilities inherited from the broader anti-theft monitoring system, not mandatory for the lowest-cost gate-entry workflow.

## 围栏取餐码核心链路

1. Student opens `/pickup`.
2. `PickupPage.tsx` calls `guardApi.issuePickupCode` in `apps/pwa/src/lib/api.ts`.
3. The API request reaches `POST /api/v1/gate/orders/{order_id}/pickup-code` in `apps/api/app/routers/gate.py`.
4. The route delegates to `apps/api/app/services/gate_application.py`.
5. The service applies business rules and uses `apps/api/app/repositories/gate_repository.py` to read/write database rows.
6. Data is persisted through `PickupCode`, `Order` and `PickupConfirmation` in `apps/api/app/models/entities.py`.
7. Staff opens `/gate`, submits the code and receives an allow/deny response from the same API/backend/database chain.

This chain records "this code was verified at the gate and the student was allowed to enter the fenced pickup area." It does not claim computer vision proof that the student picked the exact bag inside the fenced area.

## 问题定位矩阵

| Symptom | First layer to inspect | Typical files |
| --- | --- | --- |
| Page layout, button state, mobile web-view display or visible feedback is wrong | 前端 | `apps/pwa/src/pages`, `apps/pwa/src/styles.css` |
| Frontend calls the wrong URL, sends the wrong payload or parses the wrong response | API | `apps/pwa/src/lib/api.ts`, `apps/api/app/routers`, `apps/api/app/schemas/schemas.py` |
| Pickup code rules, gate allow/deny behavior, order mutation or audit behavior is wrong | 后端 | `apps/api/app/services` |
| Data is missing, duplicate, wrongly ordered or not persisted | 数据库 | `apps/api/app/repositories`, `apps/api/app/models/entities.py`, `apps/api/migrations` |
| Login, JWT, Redis, object storage, background worker, server startup or port mapping fails | 基础设施 | `apps/api/app/core`, `apps/api/app/worker.py`, `infra/compose/docker-compose.yml` |

## Boundary Tests

The architecture is protected by tests:

- `apps/api/tests/test_gate_application_boundary.py` keeps API routes thin by requiring route handlers to delegate to `gate_application`.
- `apps/api/tests/test_gate_repository_boundary.py` keeps gate persistence access inside `gate_repository`.
- `apps/api/tests/test_api_contracts.py` checks that frontend-facing endpoints keep explicit OpenAPI response contracts.
- `apps/api/tests/test_architecture_documentation.py` keeps this document aligned with the five product architecture layers.
