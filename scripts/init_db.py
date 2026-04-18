import asyncio
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "apps" / "api"))

from app.core.config import settings  # noqa: E402
from app.models.base import Base  # noqa: E402
from app import models  # noqa: F401,E402

async def main() -> None:
    engine = create_async_engine(settings.db_url)
    async with engine.begin() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
