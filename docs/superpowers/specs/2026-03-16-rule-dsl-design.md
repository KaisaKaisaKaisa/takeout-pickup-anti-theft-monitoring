# Rule DSL Storage & Validation Design

## Summary
Add a JSON DSL for visual rule editing, validate it server-side, and convert it into the existing `conditions` structure for runtime rule evaluation. This keeps backward compatibility while enabling a future visual editor.

## Goals
- Accept and store a rule DSL (`dsl_json`) for visual editing.
- Validate DSL structure and safely convert to `conditions`.
- Keep existing rule execution intact (still uses `conditions`).
- Expose DSL back to clients for editor round-trips.

## Non-goals
- No front-end editor implementation in this phase.
- No changes to rule evaluation logic beyond reading converted conditions.
- No changes to rule match logging or alert triggering.

## Data Model
- Add `Rule.dsl_json` (JSON, nullable) to store visual rule trees.
- Keep `Rule.conditions` as the runtime structure.

### Migration Note
There is no migration system in the repo. Adding `dsl_json` requires:
- manual ALTER TABLE in production, or
- dropping/recreating tables in dev if using `create_all`.

## DSL Format (v1)
Minimal tree-based format:

```json
{
  "op": "and",
  "rules": [
    {"field": "motion_score", "op": "gte", "value": 1200},
    {"field": "weight_delta", "op": "lt", "value": -50}
  ]
}
```

### Allowed Operators
- Boolean: `and`, `or`
- Comparators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`

### Field Handling
- `field` maps to metrics keys in `metrics_json`.
- Values are numeric or string; invalid types are rejected.

## Validation & Conversion
New service `rule_dsl.py`:
- `validate_dsl(dsl)`: ensures valid tree, operator set, and node types.
- `dsl_to_conditions(dsl)`: converts DSL to existing `conditions` dict used by `_match_conditions`.

### Conversion Strategy
- For `and`: merge into a composite `conditions` object:
  - If all rules are simple comparisons, map to:
    ```json
    {"motion_score": {"gte": 1200}, "weight_delta": {"lt": -50}}
    ```
- For `or`: store as:
  ```json
  {"$or": [ ...sub-conditions... ]}
  ```
  and extend `_match_conditions` to support `$or` in a backward-compatible way.

## API Changes
- `RuleCreate` / `RuleOut` / update payloads accept `dsl_json` (optional).
- If `dsl_json` provided:
  - validate, convert to `conditions`, store both `dsl_json` and `conditions`.
- If `dsl_json` absent:
  - keep existing `conditions` behavior unchanged.

## Compatibility
- Existing rules without `dsl_json` continue to work.
- Existing `conditions` remain canonical for runtime evaluation.

## Error Handling
- Invalid DSL → `400` with validation error.
- Missing `rules` or invalid `op` → `400`.

## Testing
- Unit tests for `validate_dsl` and `dsl_to_conditions`.
- API tests (minimal) to ensure `dsl_json` accepted and persisted.

