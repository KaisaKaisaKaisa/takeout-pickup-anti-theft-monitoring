import os
import sys
import unittest


base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)


def _purge_stubbed_modules() -> None:
    prefixes = ("app", "sqlalchemy")
    for name in list(sys.modules):
        if name in prefixes or name.startswith(tuple(f"{prefix}." for prefix in prefixes)):
            sys.modules.pop(name, None)


_purge_stubbed_modules()

from app.main import create_app  # noqa: E402


class ApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app(run_background_tasks=False)
        cls.openapi = cls.app.openapi()

    def response_schema(self, path: str, method: str, status: str = "200", media_type: str = "application/json"):
        return (
            self.openapi["paths"][path][method.lower()]["responses"][status]["content"][media_type]
            .get("schema", {})
        )

    def assert_schema_ref(self, path: str, method: str, model_name: str):
        schema = self.response_schema(path, method)
        self.assertEqual(
            schema,
            {"$ref": f"#/components/schemas/{model_name}"},
            f"{method} {path} should document {model_name}",
        )

    def test_frontend_list_endpoints_keep_wrapped_or_stable_shapes(self):
        self.assert_schema_ref("/api/v1/orders", "GET", "OrderListOut")
        self.assert_schema_ref("/api/v1/alerts", "GET", "AlertListOut")
        self.assert_schema_ref("/api/v1/devices", "GET", "DeviceListOut")
        self.assert_schema_ref("/api/v1/sessions", "GET", "SessionListOut")

        matches_schema = self.response_schema("/api/v1/rules/matches", "GET")
        self.assertEqual(matches_schema.get("type"), "array")
        self.assertEqual(
            matches_schema.get("items"),
            {"$ref": "#/components/schemas/RuleMatchLogOut"},
        )

    def test_frontend_detail_and_action_endpoints_have_explicit_json_contracts(self):
        expected_models = {
            ("/api/v1/alerts/{incident_id}", "GET"): "AlertDetailOut",
            ("/api/v1/orders/{order_id}/arm", "POST"): "OrderArmOut",
            ("/api/v1/orders/{order_id}/confirm-pickup", "POST"): "OkOut",
            ("/api/v1/gate/orders/{order_id}/pickup-code", "POST"): "PickupCodeOut",
            ("/api/v1/gate/verify-code", "POST"): "GateVerifyOut",
            ("/api/v1/gate/recent-verifications", "GET"): "GateVerificationListOut",
            ("/api/v1/devices/{device_id}", "GET"): "DeviceDetailOut",
            ("/api/v1/devices/{device_id}", "PATCH"): "OkOut",
            ("/api/v1/devices/{device_id}/config", "PATCH"): "DeviceConfigOut",
            ("/api/v1/devices/{device_id}/health", "GET"): "DeviceHealthOut",
            ("/api/v1/media/{media_id}", "GET"): "MediaMetadataOut",
            ("/api/v1/evidence/{incident_id}/generate", "POST"): "EvidenceGenerateOut",
            ("/api/v1/evidence/{incident_id}", "GET"): "EvidenceOut",
        }
        for (path, method), model_name in expected_models.items():
            with self.subTest(path=path, method=method):
                self.assert_schema_ref(path, method, model_name)

    def test_media_download_documents_binary_or_redirect_response(self):
        responses = self.openapi["paths"]["/api/v1/media/{media_id}/download"]["get"]["responses"]
        self.assertIn("application/octet-stream", responses["200"]["content"])
        self.assertIn("302", responses)
        self.assertNotIn("application/json", responses["200"].get("content", {}))

    def test_report_exports_advertise_csv_downloads(self):
        for path in (
            "/api/v1/reports/summary/export",
            "/api/v1/reports/trends/export",
            "/api/v1/reports/rule-matches/export",
            "/api/v1/orders/export/csv",
            "/api/v1/alerts/export/csv",
        ):
            with self.subTest(path=path):
                content = self.openapi["paths"][path]["get"]["responses"]["200"]["content"]
                self.assertIn("text/csv", content)
                self.assertNotIn("application/json", content)

    def test_normalized_error_response_is_documented_for_api_routes(self):
        for path, method in (
            ("/api/v1/orders/{order_id}", "get"),
            ("/api/v1/alerts/{incident_id}", "get"),
            ("/api/v1/devices/{device_id}", "get"),
        ):
            with self.subTest(path=path, method=method):
                responses = self.openapi["paths"][path][method]["responses"]
                self.assertEqual(
                    responses["400"]["content"]["application/json"]["schema"],
                    {"$ref": "#/components/schemas/ErrorOut"},
                )
                self.assertEqual(
                    responses["403"]["content"]["application/json"]["schema"],
                    {"$ref": "#/components/schemas/ErrorOut"},
                )
                self.assertEqual(
                    responses["404"]["content"]["application/json"]["schema"],
                    {"$ref": "#/components/schemas/ErrorOut"},
                )


if __name__ == "__main__":
    unittest.main()
