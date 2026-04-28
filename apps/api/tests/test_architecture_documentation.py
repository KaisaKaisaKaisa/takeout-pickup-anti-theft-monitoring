import os
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ARCHITECTURE_DOC = os.path.join(ROOT_DIR, "docs", "architecture.md")


class ArchitectureDocumentationTests(unittest.TestCase):
    def setUp(self):
        with open(ARCHITECTURE_DOC, "r", encoding="utf-8") as handle:
            self.doc = handle.read()

    def test_document_uses_product_core_architecture_layers(self):
        required_headings = (
            "## 产品核心架构层次",
            "### 前端",
            "### API",
            "### 后端",
            "### 数据库",
            "### 基础设施",
            "## 问题定位矩阵",
        )
        for heading in required_headings:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.doc)

    def test_document_maps_gate_access_flow_to_core_layers(self):
        required_terms = (
            "`/pickup`",
            "`/gate`",
            "`apps/pwa/src/lib/api.ts`",
            "`apps/api/app/routers/gate.py`",
            "`apps/api/app/services/gate_application.py`",
            "`apps/api/app/repositories/gate_repository.py`",
            "`apps/api/app/models/entities.py`",
            "`infra/compose/docker-compose.yml`",
        )
        for term in required_terms:
            with self.subTest(term=term):
                self.assertIn(term, self.doc)


if __name__ == "__main__":
    unittest.main()
