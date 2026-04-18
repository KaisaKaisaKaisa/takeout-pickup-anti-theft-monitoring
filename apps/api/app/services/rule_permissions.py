from __future__ import annotations


def can_edit_rule_set(user: dict, ruleset: dict) -> bool:
    if user.get("is_admin"):
        return True
    if ruleset.get("scope") == "global":
        return False
    return ruleset.get("owner_user_id") == user.get("id")
