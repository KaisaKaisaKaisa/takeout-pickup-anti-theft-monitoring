import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock

from fastapi import HTTPException

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODULE_PATH = os.path.join(base_dir, "app", "routers", "rules.py")

app_core_db = types.ModuleType("app.core.db")


async def _get_db():
    yield None


app_core_db.get_db = _get_db
sys.modules["app.core.db"] = app_core_db

app_core_security = types.ModuleType("app.core.security")
app_core_security.get_current_user = lambda: None
app_core_security.is_admin_user = lambda user: bool(getattr(user, "is_admin", False))
sys.modules["app.core.security"] = app_core_security

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = AsyncMock()
sys.modules["app.services.audit_service"] = app_services_audit

app_services_rule_permissions = types.ModuleType("app.services.rule_permissions")
app_services_rule_permissions.can_edit_rule_set = (
    lambda user, ruleset: bool(user.get("is_admin")) or str(user.get("id")) == str(ruleset.get("owner_user_id"))
)
sys.modules["app.services.rule_permissions"] = app_services_rule_permissions

app_services_rule_dsl = types.ModuleType("app.services.rule_dsl")
app_services_rule_dsl.validate_dsl = lambda dsl: None
app_services_rule_dsl.dsl_to_conditions = lambda dsl: {"motion_score": {"gte": 5}}
sys.modules["app.services.rule_dsl"] = app_services_rule_dsl

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine._match_conditions = lambda *_args, **_kwargs: True
sys.modules["app.services.alert_engine"] = app_services_alert_engine

app_models = types.ModuleType("app.models.entities")


class _Col:
    def __eq__(self, *_args, **_kwargs):
        return True

    def cast(self, *_args, **_kwargs):
        return self

    def ilike(self, *_args, **_kwargs):
        return True

    def desc(self):
        return self

    def asc(self):
        return self

    def __ge__(self, *_args, **_kwargs):
        return True

    def __le__(self, *_args, **_kwargs):
        return True


class _RuleSet:
    id = _Col()
    owner_user_id = _Col()
    scope = _Col()
    created_at = _Col()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _Rule:
    id = _Col()
    rule_set_id = _Col()
    priority = _Col()

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _RuleMatchLog:
    id = _Col()
    rule_id = _Col()
    rule_set_id = _Col()
    order_id = _Col()
    user_id = _Col()
    matched_at = _Col()
    suppressed = _Col()
    event_type = _Col()


app_models.RuleSet = _RuleSet
app_models.Rule = _Rule
app_models.RuleMatchLog = _RuleMatchLog
sys.modules["app.models.entities"] = app_models

app_schemas = types.ModuleType("app.schemas.schemas")
try:
    from pydantic import BaseModel
except Exception:
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class _RuleSetCreate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    scope: str | None = None


class _RuleSetOut(BaseModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    scope: str | None = None


class _RuleCreate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    priority: int | None = None
    event_type: str | None = None
    conditions: dict | None = None
    dsl_json: dict | None = None
    action: str | None = None
    action_params: dict | None = None
    cooldown_sec: int | None = None


class _RuleOut(BaseModel):
    id: str | None = None
    rule_set_id: str | None = None


class _RuleMatchLogOut(BaseModel):
    id: str | None = None


app_schemas.RuleSetCreate = _RuleSetCreate
app_schemas.RuleSetOut = _RuleSetOut
app_schemas.RuleCreate = _RuleCreate
app_schemas.RuleOut = _RuleOut
app_schemas.RuleMatchLogOut = _RuleMatchLogOut
sys.modules["app.schemas.schemas"] = app_schemas

sqlalchemy_module = types.ModuleType("sqlalchemy")


class _SelectStub:
    def join(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def offset(self, *_args, **_kwargs):
        return self

    def where(self, *_args, **_kwargs):
        return self


class _StringStub:
    def ilike(self, *_args, **_kwargs):
        return True


sqlalchemy_module.select = lambda *_args, **_kwargs: _SelectStub()
sqlalchemy_module.String = _StringStub
sys.modules["sqlalchemy"] = sqlalchemy_module

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext

sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_asyncio.AsyncSession = object
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio

app_module = types.ModuleType("app")
app_module.core = types.SimpleNamespace(db=app_core_db, security=app_core_security)
app_module.services = types.SimpleNamespace(
    rule_dsl=app_services_rule_dsl,
    rule_permissions=app_services_rule_permissions,
    audit_service=app_services_audit,
    alert_engine=app_services_alert_engine,
)
app_module.models = types.SimpleNamespace(entities=app_models)
app_module.schemas = types.SimpleNamespace(schemas=app_schemas)
sys.modules["app"] = app_module


def load_module():
    sys.modules.pop("rules_router_permissions", None)
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.security"] = app_core_security
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.services.rule_permissions"] = app_services_rule_permissions
    sys.modules["app.services.rule_dsl"] = app_services_rule_dsl
    sys.modules["app.services.alert_engine"] = app_services_alert_engine
    sys.modules["app.models.entities"] = app_models
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["sqlalchemy"] = sqlalchemy_module
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("rules_router_permissions", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _ScalarResult:
    def __init__(self, item):
        self._item = item

    def scalar_one_or_none(self):
        return self._item


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _ResultWithScalars:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _ScalarsResult(self._rows)


class _SequencedDB:
    def __init__(self, responses):
        self._responses = list(responses)
        self.commit = AsyncMock()
        self.flush = AsyncMock()
        self.delete = AsyncMock()

    async def execute(self, *_args, **_kwargs):
        if not self._responses:
            raise AssertionError("unexpected execute call")
        response = self._responses.pop(0)
        if isinstance(response, list):
            return _ResultWithScalars(response)
        return _ScalarResult(response)

    def add(self, *_args, **_kwargs):
        return None


class RuleRouterPermissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_rule_set_rejects_invalid_set_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid set id")

        with self.assertRaises(HTTPException) as ctx:
            await module.update_rule_set(
                set_id="bad-set-id",
                payload={"name": "new"},
                db=_DB(),
                user=types.SimpleNamespace(id="u1", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid set_id")

    async def test_create_rule_rejects_invalid_set_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid set id")

        with self.assertRaises(HTTPException) as ctx:
            await module.create_rule(
                set_id="bad-set-id",
                payload=types.SimpleNamespace(),
                db=_DB(),
                user=types.SimpleNamespace(id="u1", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid set_id")

    async def test_list_rules_rejects_invalid_set_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid set id")

        with self.assertRaises(HTTPException) as ctx:
            await module.list_rules(
                set_id="bad-set-id",
                db=_DB(),
                user=types.SimpleNamespace(id="u1", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid set_id")

    async def test_update_rule_rejects_invalid_rule_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid rule id")

        with self.assertRaises(HTTPException) as ctx:
            await module.update_rule(
                rule_id="bad-rule-id",
                payload={"name": "new"},
                db=_DB(),
                user=types.SimpleNamespace(id="u1", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid rule_id")

    async def test_delete_rule_rejects_invalid_rule_id(self):
        module = load_module()

        class _DB:
            async def execute(self, *_args, **_kwargs):
                raise AssertionError("execute should not be called for invalid rule id")

        with self.assertRaises(HTTPException) as ctx:
            await module.delete_rule(
                rule_id="bad-rule-id",
                db=_DB(),
                user=types.SimpleNamespace(id="u1", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid rule_id")

    async def test_update_rule_set_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _RuleSet(
                    id="set-1",
                    owner_user_id="owner-a",
                    name="Set 1",
                    description="desc",
                    enabled=True,
                    scope="user",
                )
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.update_rule_set(
                set_id="00000000-0000-0000-0000-000000000001",
                payload={"name": "new"},
                db=db,
                user=types.SimpleNamespace(id="user-b", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_create_rule_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _RuleSet(
                    id="set-2",
                    owner_user_id="owner-a",
                    name="Set 2",
                    description="desc",
                    enabled=True,
                    scope="user",
                )
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.create_rule(
                set_id="00000000-0000-0000-0000-000000000002",
                payload=types.SimpleNamespace(),
                db=db,
                user=types.SimpleNamespace(id="user-b", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_update_rule_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _Rule(id="rule-1", rule_set_id="set-3", name="Rule 1"),
                _RuleSet(
                    id="set-3",
                    owner_user_id="owner-a",
                    name="Set 3",
                    description="desc",
                    enabled=True,
                    scope="user",
                ),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.update_rule(
                rule_id="00000000-0000-0000-0000-000000000003",
                payload={"name": "new"},
                db=db,
                user=types.SimpleNamespace(id="user-b", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")

    async def test_delete_rule_forbidden_for_other_user(self):
        module = load_module()
        db = _SequencedDB(
            [
                _Rule(id="rule-2", rule_set_id="set-4", name="Rule 2"),
                _RuleSet(
                    id="set-4",
                    owner_user_id="owner-a",
                    name="Set 4",
                    description="desc",
                    enabled=True,
                    scope="user",
                ),
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            await module.delete_rule(
                rule_id="00000000-0000-0000-0000-000000000004",
                db=db,
                user=types.SimpleNamespace(id="user-b", is_admin=False),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Forbidden")


if __name__ == "__main__":
    unittest.main()
