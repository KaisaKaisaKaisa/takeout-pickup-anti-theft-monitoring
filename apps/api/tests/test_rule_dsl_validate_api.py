import importlib.util
import os
import sys
import types
import unittest

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

app_models = types.ModuleType("app.models.entities")
app_models.RuleSet = type("RuleSet", (), {})
app_models.Rule = type("Rule", (), {})
app_models.RuleMatchLog = type("RuleMatchLog", (), {})
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

class _RuleMatchLogOut(BaseModel):
    id: int | None = None

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

def load_module():
    spec = importlib.util.spec_from_file_location("rules_router", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class RuleDslValidateApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_validate_dsl_returns_conditions(self):
        module = load_module()
        payload = {"dsl_json": {"op": "and", "rules": [{"field": "motion_score", "op": "gte", "value": 5}]}}
        result = await module.validate_dsl_route(payload)
        self.assertEqual(result["ok"], True)
        self.assertEqual(result["conditions"], {"motion_score": {"gte": 5}})

if __name__ == "__main__":
    unittest.main()
