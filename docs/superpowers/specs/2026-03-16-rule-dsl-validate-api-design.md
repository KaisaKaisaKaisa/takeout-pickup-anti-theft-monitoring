# Rule DSL Validate API Design

## Summary
Add a lightweight validation endpoint for the rule DSL so the front-end editor can validate and preview `conditions` without persisting a rule.

## Goals
- Provide `POST /api/v1/rules/dsl/validate` to validate DSL and return converted `conditions`.
- Reuse existing `rule_dsl.validate_dsl` and `dsl_to_conditions`.
- No DB writes or side effects.

## Non-goals
- No persistence or rule creation.
- No UI/editor implementation in this phase.

## API

### Endpoint
`POST /api/v1/rules/dsl/validate`

### Request Body
```json
{
  "dsl_json": { ... }
}
```

### Response (Success)
```json
{
  "ok": true,
  "conditions": { ... }
}
```

### Response (Failure)
- `400` with `{ "detail": "<reason>" }`

## Validation & Conversion
- `validate_dsl(dsl_json)` ensures structure and operators are valid.
- `dsl_to_conditions(dsl_json)` generates runtime-compatible `conditions`.

## Error Handling
- Missing or invalid `dsl_json` -> `400`

## Testing
- Unit test for the endpoint using a minimal stubbed router environment.
- Assertions:
  - Valid DSL returns `ok: true` and expected `conditions`.
  - Invalid DSL returns `400`.

