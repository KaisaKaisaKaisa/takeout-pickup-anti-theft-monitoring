import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run database migrations through Alembic. "
            "This is the only supported local database initialization path."
        ),
        epilog="Example: python scripts/init_db.py",
    )
    return parser.parse_args()


def main() -> None:
    parse_args()
    print("Running Alembic migrations from apps/api: alembic upgrade head", flush=True)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR,
        check=False,
    )
    if result.returncode != 0:
        print(
            "Alembic migration failed. Install apps/api requirements for local runs "
            "or use scripts/dev_up.ps1 to run migrations inside Docker Compose.",
            file=sys.stderr,
        )
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
