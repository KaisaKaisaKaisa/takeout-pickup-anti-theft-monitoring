import json
import os
import sys
import unittest

from fastapi import HTTPException
from starlette.requests import Request

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)


def _purge_stubbed_modules() -> None:
    """Ensure this bootstrap test imports the real app package.

    Several router/service unit tests install lightweight modules into
    sys.modules at import time. unittest imports test modules in one process, so
    those stubs can make app.core/app.schemas look like non-package modules.
    """
    prefixes = ("app", "sqlalchemy")
    for name in list(sys.modules):
        if name in prefixes or name.startswith(tuple(f"{prefix}." for prefix in prefixes)):
            sys.modules.pop(name, None)


_purge_stubbed_modules()

from app.main import create_app  # noqa: E402


async def _ok_db_probe():
    return {"ok": True}


async def _degraded_cache_probe():
    return {"ok": False, "backend": "memory", "degraded": True, "optional": True}


async def _failed_db_probe():
    return {"ok": False, "error": "ConnectionError"}


async def _ok_storage_probe():
    return {"ok": True, "backend": "local"}


async def _failed_storage_probe():
    return {"ok": False, "backend": "minio", "bucket": "takeout-guard-evidence", "error": "ClientError"}


class FailedTask:
    def __init__(self, name: str, error: BaseException):
        self._name = name
        self._error = error

    def cancelled(self):
        return False

    def done(self):
        return True

    def exception(self):
        return self._error

    def get_name(self):
        return self._name


def build_request(path: str = "/healthz", request_id: str = "req-test") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "path": path,
        "headers": [],
    }
    request = Request(scope)
    request.state.request_id = request_id
    return request


class AppBootstrapTests(unittest.IsolatedAsyncioTestCase):
    def route_for(self, app, path: str):
        return next(route for route in app.routes if getattr(route, "path", "") == path)

    async def test_livez_reports_process_state(self):
        app = create_app(run_background_tasks=False)
        route = self.route_for(app, "/livez")
        request = build_request("/livez", "req-live")

        payload = await route.endpoint(request)

        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["status"], "alive")
        self.assertEqual(payload["service"], "api")
        self.assertEqual(payload["request_id"], "req-live")

    async def test_readyz_accepts_degraded_optional_cache(self):
        app = create_app(
            run_background_tasks=False,
            health_probes={"db": _ok_db_probe, "cache": _degraded_cache_probe, "storage": _ok_storage_probe},
        )
        route = self.route_for(app, "/readyz")
        request = build_request("/readyz", "req-ready")

        response = await route.endpoint(request)
        payload = json.loads(response.body.decode("utf-8"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["status"], "degraded")
        self.assertEqual(payload["components"]["background_tasks"]["enabled"], False)
        self.assertEqual(payload["components"]["background_tasks"]["active"], 0)
        self.assertEqual(payload["components"]["cache"]["degraded"], True)
        self.assertEqual(payload["components"]["storage"]["backend"], "local")
        self.assertEqual(payload["request_id"], "req-ready")
        self.assertEqual(response.headers.get("X-Request-ID"), "req-ready")

    async def test_readyz_fails_when_background_task_has_exception(self):
        app = create_app(
            run_background_tasks=False,
            health_probes={"db": _ok_db_probe, "cache": _degraded_cache_probe},
        )
        app.state.background_tasks = [FailedTask("takeout-guard:test", RuntimeError("loop failed"))]
        route = self.route_for(app, "/readyz")
        request = build_request("/readyz", "req-not-ready")

        response = await route.endpoint(request)
        payload = json.loads(response.body.decode("utf-8"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["status"], "not_ready")
        self.assertEqual(payload["components"]["background_tasks"]["ok"], False)
        self.assertEqual(payload["components"]["background_tasks"]["failed"][0]["name"], "takeout-guard:test")

    async def test_healthz_reflects_failed_required_probe(self):
        app = create_app(
            run_background_tasks=False,
            health_probes={"db": _failed_db_probe, "cache": _degraded_cache_probe},
        )
        route = self.route_for(app, "/healthz")
        request = build_request("/healthz", "req-health")

        response = await route.endpoint(request)
        payload = json.loads(response.body.decode("utf-8"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["components"]["db"]["error"], "ConnectionError")
        self.assertEqual(payload["request_id"], "req-health")

    async def test_readyz_fails_when_storage_probe_fails(self):
        app = create_app(
            run_background_tasks=False,
            health_probes={"db": _ok_db_probe, "cache": _degraded_cache_probe, "storage": _failed_storage_probe},
        )
        route = self.route_for(app, "/readyz")
        request = build_request("/readyz", "req-storage")

        response = await route.endpoint(request)
        payload = json.loads(response.body.decode("utf-8"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["status"], "not_ready")
        self.assertEqual(payload["components"]["storage"]["error"], "ClientError")

    async def test_http_exception_handler_wraps_detail_and_request_id(self):
        app = create_app(run_background_tasks=False)
        request = build_request("/guarded", "req-http")

        response = await app.exception_handlers[HTTPException](
            request,
            HTTPException(status_code=403, detail="forbidden", headers={"X-Test": "1"}),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.headers.get("X-Request-ID"), "req-http")
        self.assertEqual(response.headers.get("X-Test"), "1")
        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["detail"], "forbidden")
        self.assertEqual(payload["request_id"], "req-http")

    async def test_unhandled_errors_are_normalized_and_hide_internal_message(self):
        app = create_app(run_background_tasks=False)
        request = build_request("/boom-test", "req-123")

        response = await app.exception_handlers[Exception](
            request,
            RuntimeError("db password leaked"),
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers.get("X-Request-ID"), "req-123")
        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["error"], "internal_server_error")
        self.assertEqual(payload["request_id"], "req-123")
        self.assertNotIn("db password leaked", response.body.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
