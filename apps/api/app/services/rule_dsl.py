ALLOWED_OPS = {"and", "or"}
ALLOWED_COMP = {"gt", "gte", "lt", "lte", "eq", "neq"}

def validate_dsl(dsl: dict) -> None:
    if not isinstance(dsl, dict):
        raise ValueError("dsl must be object")
    op = dsl.get("op")
    rules = dsl.get("rules")
    if op not in ALLOWED_OPS:
        raise ValueError("invalid op")
    if not isinstance(rules, list) or not rules:
        raise ValueError("rules must be non-empty list")
    for rule in rules:
        if isinstance(rule, dict) and "op" in rule and "rules" in rule:
            validate_dsl(rule)
            continue
        if not isinstance(rule, dict):
            raise ValueError("rule must be object")
        if rule.get("op") not in ALLOWED_COMP:
            raise ValueError("invalid comparator")
        if "field" not in rule:
            raise ValueError("missing field")

def dsl_to_conditions(dsl: dict) -> dict:
    validate_dsl(dsl)
    op = dsl["op"]
    rules = dsl["rules"]
    if op == "or":
        return {"$or": [dsl_to_conditions({"op": "and", "rules": [r]}) for r in rules]}
    conditions: dict = {}
    for rule in rules:
        if "op" in rule and "rules" in rule:
            child = dsl_to_conditions(rule)
            if "$or" in child:
                conditions.setdefault("$or", []).extend(child["$or"])
            else:
                conditions.update(child)
            continue
        field = rule["field"]
        comp = rule["op"]
        value = rule.get("value")
        if comp == "eq":
            conditions[field] = value
        elif comp == "neq":
            conditions[field] = {"neq": value}
        else:
            conditions.setdefault(field, {})
            conditions[field][comp] = value
    return conditions
