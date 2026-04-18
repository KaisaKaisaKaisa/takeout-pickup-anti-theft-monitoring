from __future__ import annotations


def _scope_rank(scope: str | None) -> int:
    return 0 if scope == "user" else 1


def order_rules(rules: list[dict]) -> list[dict]:
    return sorted(
        rules,
        key=lambda r: (r.get("priority", 0), _scope_rank(r.get("scope"))),
    )
