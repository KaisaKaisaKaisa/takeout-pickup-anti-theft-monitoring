import asyncio
import logging
from app.services.timeout_checker import run_timeout_loop
from app.services.cleanup import run_cleanup_loop
from app.services.device_offline_checker import run_device_offline_loop

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("takeout_guard.worker")

async def main() -> None:
    logger.info("worker starting")
    await asyncio.gather(
        run_timeout_loop(),
        run_cleanup_loop(),
        run_device_offline_loop(),
    )

if __name__ == "__main__":
    asyncio.run(main())
