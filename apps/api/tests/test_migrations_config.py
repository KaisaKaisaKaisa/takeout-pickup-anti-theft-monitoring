import os
import unittest


class MigrationConfigTests(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        self.api_dir = os.path.join(self.repo_root, "apps", "api")

    def test_alembic_config_and_baseline_revision_exist(self):
        self.assertTrue(os.path.exists(os.path.join(self.api_dir, "alembic.ini")))
        self.assertTrue(os.path.exists(os.path.join(self.api_dir, "migrations", "env.py")))
        self.assertTrue(os.path.exists(os.path.join(self.api_dir, "migrations", "versions", "20260425_0001_baseline.py")))

    def test_requirements_include_alembic(self):
        with open(os.path.join(self.api_dir, "requirements.txt"), encoding="utf-8") as fh:
            requirements = fh.read()
        self.assertIn("alembic==", requirements)

    def test_init_script_delegates_to_alembic_only(self):
        with open(os.path.join(self.repo_root, "scripts", "init_db.py"), encoding="utf-8") as fh:
            script = fh.read()
        self.assertIn("argparse", script)
        self.assertIn("python scripts/init_db.py", script)
        self.assertIn('"-m", "alembic", "upgrade", "head"', script)
        self.assertNotIn("create_all", script)
        self.assertNotIn("Base.metadata", script)

    def test_compose_runs_migration_before_api_start(self):
        compose_path = os.path.join(self.repo_root, "infra", "compose", "docker-compose.yml")
        with open(compose_path, encoding="utf-8") as fh:
            compose = fh.read()
        self.assertIn("alembic upgrade head && uvicorn", compose)
        self.assertIn("condition: service_healthy", compose)
        self.assertIn("condition: service_completed_successfully", compose)

    def test_docs_do_not_present_schema_sql_as_migration_source(self):
        docs_to_check = ["README.md", os.path.join("docs", "deployment.md"), os.path.join("docs", "spec.md")]
        for rel_path in docs_to_check:
            with self.subTest(rel_path=rel_path):
                with open(os.path.join(self.repo_root, rel_path), encoding="utf-8") as fh:
                    content = fh.read()
                self.assertIn("Alembic", content)
                self.assertNotIn("Base.metadata.create_all", content)
                self.assertNotIn("完整字段定义见 `docs/schema.sql`", content)


if __name__ == "__main__":
    unittest.main()
