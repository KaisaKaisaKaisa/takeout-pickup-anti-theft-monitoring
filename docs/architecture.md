# Architecture

Components:
- API (FastAPI + PostgreSQL + Redis)
- Edge agent (camera + optional weight sensor)
- PWA (alerts, orders, evidence)
- Object storage (MinIO/COS/OSS)

Data flow:
- Provider webhook or polling updates order status
- API arms monitoring session
- Edge posts sensor events
- Rule engine raises alerts and triggers evidence capture
