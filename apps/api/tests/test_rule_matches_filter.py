import importlib.util
import os
import sys
import types
import unittest
import uuid
from datetime import datetime, timezone
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
app_core_security.is_admin_user = lambda *_: False
sys.modules["app.core.security"] = app_core_security

app_services_audit = types.ModuleType("app.services.audit_service")
app_services_audit.log_action = lambda *_: None
sys.modules["app.services.audit_service"] = app_services_audit

app_services_rule_permissions = types.ModuleType("app.services.rule_permissions")
app_services_rule_permissions.can_edit_rule_set = lambda *_: True
sys.modules["app.services.rule_permissions"] = app_services_rule_permissions

app_services_rule_dsl = types.ModuleType("app.services.rule_dsl")
app_services_rule_dsl.validate_dsl = lambda dsl: None
app_services_rule_dsl.dsl_to_conditions = lambda dsl: {"motion_score": {"gte": 5}}
sys.modules["app.services.rule_dsl"] = app_services_rule_dsl

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine._match_conditions = lambda *_: True
sys.modules["app.services.alert_engine"] = app_services_alert_engine

app_models = types.ModuleType("app.models.entities")


class _RuleMatchLog:
    def __init__(self):
        self.id = uuid.uuid4()
        self.rule_id = uuid.uuid4()
        self.rule_set_id = uuid.uuid4()
        self.order_id = uuid.uuid4()
        self.session_id = uuid.uuid4()
        self.event_id = None
        self.user_id = uuid.uuid4()
        self.event_type = "motion"
        self.conditions = {}
        self.metrics_json = {}
        self.action = "alert"
        self.suppressed = False
        self.note = None
        self.matched_at = datetime.now(timezone.utc)

    class _Col:
        def __eq__(self, *_args, **_kwargs):
            return True

        def ilike(self, *_args, **_kwargs):
            return True

        def cast(self, *_args, **_kwargs):
            return self

        def desc(self):
            return self

        def __ge__(self, *_args, **_kwargs):
            return True

        def __le__(self, *_args, **_kwargs):
            return True

    id = _Col()
    rule_id = _Col()
    rule_set_id = _Col()
    order_id = _Col()
    user_id = _Col()
    matched_at = _Col()
    suppressed = _Col()
    event_type = _Col()


class _Col:
    def __eq__(self, *_args, **_kwargs):
        return True

    def ilike(self, *_args, **_kwargs):
        return True

class _RuleSet:
    id = _Col()
    name = "rule-set"

class _Rule:
    id = _Col()
    name = "rule"

app_models.RuleSet = _RuleSet
app_models.Rule = _Rule
app_models.RuleMatchLog = _RuleMatchLog
sys.modules["app.models.entities"] = app_models

app_schemas = types.ModuleType("app.schemas.schemas")
try:
    import pydantic
    BaseModel = pydantic.BaseModel
except Exception:
    pydantic = None
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class _RuleSetCreate(BaseModel):
    name: str | None = None


class _RuleSetOut(BaseModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    scope: str | None = None


class _RuleCreate(BaseModel):
    name: str | None = None


class _RuleOut(BaseModel):
    id: str | None = None
    rule_set_id: str | None = None


if pydantic:
    class _RuleMatchLogOut(BaseModel):
        id: str | None = None
        rule_id: str | None = None
        rule_set_id: str | None = None
        rule_name: str | None = None
        rule_set_name: str | None = None
        order_id: str | None = None
        session_id: str | None = None
        event_id: str | None = None
        user_id: str | None = None
        event_type: str | None = None
        conditions: dict | None = None
        metrics: dict | None = None
        action: str | None = None
        suppressed: bool | None = None
        note: str | None = None
        matched_at: datetime | None = None

        class Config:
            arbitrary_types_allowed = True
            from_attributes = True
else:
    class _RuleMatchLogOut(BaseModel):
        id: str | None = None


app_schemas.RuleSetCreate = _RuleSetCreate
app_schemas.RuleSetOut = _RuleSetOut
app_schemas.RuleCreate = _RuleCreate
app_schemas.RuleOut = _RuleOut
app_schemas.RuleMatchLogOut = _RuleMatchLogOut
sys.modules["app.schemas.schemas"] = app_schemas

app_module = types.ModuleType("app")
app_module.core = types.SimpleNamespace(db=app_core_db, security=app_core_security)
app_module.services = types.SimpleNamespace(rule_dsl=app_services_rule_dsl, rule_permissions=app_services_rule_permissions, audit_service=app_services_audit)
app_module.models = types.SimpleNamespace(entities=app_models)
app_module.schemas = types.SimpleNamespace(schemas=app_schemas)
sys.modules["app"] = app_module

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

sqlalchemy_module.select = lambda *_args, **_kwargs: _SelectStub()

class _StringStub:
    def ilike(self, *_args, **_kwargs):
        return True

sqlalchemy_module.String = _StringStub
sys.modules["sqlalchemy"] = sqlalchemy_module

sqlalchemy_ext = types.ModuleType("sqlalchemy.ext")
sys.modules["sqlalchemy.ext"] = sqlalchemy_ext

sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")
sqlalchemy_asyncio.AsyncSession = object
sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio


def load_module():
    sys.modules.pop("rules_router", None)
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.security"] = app_core_security
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.services.rule_permissions"] = app_services_rule_permissions
    sys.modules["app.services.rule_dsl"] = app_services_rule_dsl
    sys.modules["app.services.alert_engine"] = app_services_alert_engine
    sys.modules["app.models.entities"] = app_models
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["app"] = app_module
    sys.modules["sqlalchemy"] = sqlalchemy_module
    sys.modules["sqlalchemy.ext"] = sqlalchemy_ext
    sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    spec = importlib.util.spec_from_file_location("rules_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _DB:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, *_args, **_kwargs):
        return _Result(self.rows)


class RuleMatchFilterTests(unittest.IsolatedAsyncioTestCase):
    async def test_rule_matches_filters(self):
        module = load_module()
        fake_item = _RuleMatchLog()
        fake_item.id = str(fake_item.id)
        fake_item.rule_id = str(fake_item.rule_id)
        fake_item.rule_set_id = str(fake_item.rule_set_id)
        fake_item.order_id = str(fake_item.order_id)
        fake_item.session_id = str(fake_item.session_id)
        fake_item.user_id = str(fake_item.user_id)
        fake_row = (fake_item, "rule-name", "rule-set")
        db = _DB([fake_row])
        user = types.SimpleNamespace(id=uuid.uuid4())
        start = datetime(2026, 3, 1, tzinfo=timezone.utc).isoformat()
        end = datetime(2026, 3, 2, tzinfo=timezone.utc).isoformat()
        result = await module.list_rule_matches(
            db=db,
            user=user,
            limit=50,
            offset=0,
            include_suppressed=False,
            event_type=None,
            rule_id=None,
            search=None,
            range=None,
            start=start,
            end=end,
            rule_set_id=str(uuid.uuid4()),
        )
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 1)

    async def test_rule_matches_rejects_invalid_rule_set_id(self):
        module = load_module()
        db = _DB([])
        user = types.SimpleNamespace(id=uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await module.list_rule_matches(
                db=db,
                user=user,
                limit=50,
                offset=0,
                include_suppressed=False,
                event_type=None,
                rule_id=None,
                search=None,
                range=None,
                start=None,
                end=None,
                rule_set_id="not-a-uuid",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid rule_set_id")

    async def test_rule_matches_rejects_invalid_rule_id(self):
        module = load_module()
        db = _DB([])
        user = types.SimpleNamespace(id=uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await module.list_rule_matches(
                db=db,
                user=user,
                limit=50,
                offset=0,
                include_suppressed=False,
                event_type=None,
                rule_id="bad-rule-id",
                search=None,
                range=None,
                start=None,
                end=None,
                rule_set_id=None,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid rule_id")


if __name__ == "__main__":
    unittest.main()
