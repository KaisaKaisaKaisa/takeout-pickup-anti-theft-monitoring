import sys
from pathlib import Path

BAD_MARKERS = ["\ufffd", "锟"]


def has_mojibake(text: str) -> bool:
    return any(marker in text for marker in BAD_MARKERS)


def main() -> int:
    files = [
        Path("apps/pwa/src/index.html"),
        Path("apps/pwa/src/app.js"),
    ]
    failed = []
    for path in files:
        data = path.read_text(encoding="utf-8", errors="replace")
        if has_mojibake(data):
            failed.append(str(path))
    if failed:
        sys.stderr.write("Mojibake detected in:\n")
        for item in failed:
            sys.stderr.write(f"- {item}\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
