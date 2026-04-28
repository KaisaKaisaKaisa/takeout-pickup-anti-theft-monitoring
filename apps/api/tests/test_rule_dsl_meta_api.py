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
app_services_rule_dsl.validate_dsl = lambda *_: None
app_services_rule_dsl.dsl_to_conditions = lambda *_: {}
sys.modules["app.services.rule_dsl"] = app_services_rule_dsl

app_services_alert_engine = types.ModuleType("app.services.alert_engine")
app_services_alert_engine._match_conditions = lambda *_args, **_kwargs: True
sys.modules["app.services.alert_engine"] = app_services_alert_engine

app_services = types.ModuleType("app.services")
app_services.audit_service = app_services_audit
app_services.rule_permissions = app_services_rule_permissions
app_services.rule_dsl = app_services_rule_dsl
app_services.alert_engine = app_services_alert_engine
app_services.__path__ = []
sys.modules["app.services"] = app_services

app_models = types.ModuleType("app.models.entities")
app_models.RuleSet = type("RuleSet", (), {})
app_models.Rule = type("Rule", (), {})
app_models.RuleMatchLog = type("RuleMatchLog", (), {})
sys.modules["app.models.entities"] = app_models

app_models_pkg = types.ModuleType("app.models")
app_models_pkg.entities = app_models
app_models_pkg.__path__ = []
sys.modules["app.models"] = app_models_pkg

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

app_schemas_pkg = types.ModuleType("app.schemas")
app_schemas_pkg.schemas = app_schemas
app_schemas_pkg.__path__ = []
sys.modules["app.schemas"] = app_schemas_pkg

app_core = types.ModuleType("app.core")
app_core.db = app_core_db
app_core.security = app_core_security
app_core.__path__ = []
sys.modules["app.core"] = app_core

app_module = types.ModuleType("app")
app_module.core = app_core
app_module.services = app_services
app_module.models = app_models_pkg
app_module.schemas = app_schemas_pkg
app_module.__path__ = []
sys.modules["app"] = app_module

def load_module():
    sys.modules["app.core.db"] = app_core_db
    sys.modules["app.core.security"] = app_core_security
    sys.modules["app.core"] = app_core
    sys.modules["app.services.audit_service"] = app_services_audit
    sys.modules["app.services.rule_permissions"] = app_services_rule_permissions
    sys.modules["app.services.rule_dsl"] = app_services_rule_dsl
    sys.modules["app.services.alert_engine"] = app_services_alert_engine
    sys.modules["app.services"] = app_services
    sys.modules["app.models.entities"] = app_models
    sys.modules["app.models"] = app_models_pkg
    sys.modules["app.schemas.schemas"] = app_schemas
    sys.modules["app.schemas"] = app_schemas_pkg
    sys.modules["app"] = app_module
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
