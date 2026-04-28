from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routers import orders, alerts, edge_ingest, evidence, devices, auth, media, users, integrations, config, whitelist, audit, sessions, reports, rules, gate
from app.core import ws as ws_hub
from app.core.cache import close as close_cache, probe_cache
from app.core.config import settings
from app.core.db import close_db, probe_db
from app.core.logging_config import configure_logging
from app.core.runtime import background_tasks_snapshot, start_background_tasks, stop_background_tasks
from app.services.storage_service import probe_storage

APP_TITLE = "Takeout Guard API"
APP_VERSION = "1.0.0"
logger = logging.getLogger(__name__)
HealthProbe = Callable[[], Awaitable[dict[str, Any]]]
DEFAULT_HEALTH_PROBES: dict[str, HealthProbe] = {
    "db": probe_db,
    "cache": probe_cache,
    "storage": probe_storage,
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def _response_headers(request: Request) -> dict[str, str]:
    request_id = _request_id(request)
    return {"X-Request-ID": request_id} if request_id else {}


def register_routers(app: FastAPI) -> None:
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/v1", tags=["users"])
    app.include_router(integrations.router, prefix="/api/v1/integrations", tags=["integrations"])
    app.include_router(config.router, prefix="/api/v1", tags=["config"])
    app.include_router(whitelist.router, prefix="/api/v1/whitelist", tags=["whitelist"])
    app.include_router(gate.router, prefix="/api/v1/gate", tags=["gate"])
    app.include_router(audit.router, prefix="/api/v1/audit", tags=["audit"])
    app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
    app.include_router(rules.router, prefix="/api/v1/rules", tags=["rules"])
    app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
    app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])
    app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
    app.include_router(devices.router, prefix="/api/v1/devices", tags=["devices"])
    app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
    app.include_router(edge_ingest.router, prefix="/api/v1/edge", tags=["edge"])
    app.include_router(media.router, prefix="/api/v1/media", tags=["media"])


def register_websocket_routes(app: FastAPI) -> None:
    @app.websocket("/ws/alerts")
    async def ws_alerts(ws: WebSocket):
        await ws.accept()
        await ws_hub.register(ws)
        try:
            while True:
                msg = await ws.receive_text()
                try:
                    data = msg and msg.strip()
                    if data and data.startswith("{"):
                        import json
                        payload = json.loads(data)
                        topics = payload.get("subscribe")
                        if isinstance(topics, list):
                            ws_hub.update_subscription(ws, topics)
                except Exception:
                    pass
        except WebSocketDisconnect:
            await ws_hub.unregister(ws)


async def _run_health_probe(name: str, probe: HealthProbe) -> dict[str, Any]:
    try:
        return await probe()
    except Exception as exc:
        logger.warning("Health probe failed: %s", name, exc_info=exc)
        return {"ok": False, "error": type(exc).__name__}


def create_app(
    *,
    run_background_tasks: bool | None = None,
    health_probes: dict[str, HealthProbe] | None = None,
) -> FastAPI:
    configure_logging()
    background_tasks_enabled = settings.run_background_tasks if run_background_tasks is None else run_background_tasks

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        tasks = start_background_tasks(background_tasks_enabled)
        app.state.background_tasks = tasks
        app.state.background_tasks_enabled = background_tasks_enabled
        app.state.health_probes = dict(health_probes or DEFAULT_HEALTH_PROBES)
        try:
            yield
        finally:
            await stop_background_tasks(tasks)
            await close_db()
            await close_cache()

    app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)
    app.state.background_tasks = []
    app.state.background_tasks_enabled = background_tasks_enabled
    app.state.health_probes = dict(health_probes or DEFAULT_HEALTH_PROBES)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            logger.exception(
                "request failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                },
            )
            raise
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException):
        payload = {"ok": False, "detail": exc.detail, "request_id": _request_id(request)}
        return JSONResponse(
            payload,
            status_code=exc.status_code,
            headers={**(exc.headers or {}), **_response_headers(request)},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception):
        logger.exception(
            "Unhandled API error [request_id=%s] %s %s",
            _request_id(request),
            request.method,
            request.url.path,
            exc_info=exc,
        )
        return JSONResponse(
            {"ok": False, "error": "internal_server_error", "request_id": _request_id(request)},
            status_code=500,
            headers=_response_headers(request),
        )

    async def build_runtime_health(request: Request) -> tuple[dict[str, Any], int]:
        tasks = getattr(app.state, "background_tasks", [])
        probes = getattr(app.state, "health_probes", {})
        components: dict[str, Any] = {
            "background_tasks": background_tasks_snapshot(tasks, enabled=background_tasks_enabled),
        }
        for name, probe in probes.items():
            components[name] = await _run_health_probe(name, probe)

        required_ready = bool(components["background_tasks"].get("ok"))
        degraded = False
        for name, component in components.items():
            if name == "background_tasks":
                continue
            optional = bool(component.get("optional"))
            component_ok = bool(component.get("ok"))
            component_degraded = bool(component.get("degraded"))
            degraded = degraded or component_degraded
            if optional:
                continue
            required_ready = required_ready and component_ok
        ready = required_ready
        status = "ready" if ready and not degraded else "degraded" if ready else "not_ready"
        payload = {
            "ok": ready,
            "status": status,
            "service": "api",
            "version": APP_VERSION,
            "environment": settings.environment,
            "request_id": _request_id(request),
            "components": components,
        }
        return payload, 200 if ready else 503

    @app.get("/livez", include_in_schema=False)
    async def livez(request: Request):
        return {
            "ok": True,
            "status": "alive",
            "service": "api",
            "version": APP_VERSION,
            "environment": settings.environment,
            "request_id": _request_id(request),
        }

    @app.get("/readyz", include_in_schema=False)
    async def readyz(request: Request):
        payload, status_code = await build_runtime_health(request)
        return JSONResponse(payload, status_code=status_code, headers=_response_headers(request))

    @app.get("/healthz", include_in_schema=False)
    async def healthz(request: Request):
        payload, status_code = await build_runtime_health(request)
        return JSONResponse(payload, status_code=status_code, headers=_response_headers(request))

    register_routers(app)
    register_websocket_routes(app)
    return app


app = create_app()
