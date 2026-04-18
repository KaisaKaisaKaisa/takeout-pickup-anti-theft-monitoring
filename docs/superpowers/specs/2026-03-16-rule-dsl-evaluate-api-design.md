# Rule DSL Evaluate API Design

## Summary
Add a preview evaluation endpoint so a visual editor can test DSL against sample metrics.

## Goals
- Provide `POST /api/v1/rules/dsl/evaluate`.
- Validate DSL, convert to conditions, and return match result.
- No persistence or DB writes.

## API

### Endpoint
`POST /api/v1/rules/dsl/evaluate`

### Request
```json
{
  "dsl_json": { ... },
  "metrics": { ... }
}
```

### Response
```json
{
  "ok": true,
  "matched": true,
  "conditions": { ... }
}
```

### Errors
- Missing/invalid `dsl_json` -> 400
- Missing `metrics` -> 400

## Implementation Notes
- Use `validate_dsl` and `dsl_to_conditions`.
- Use existing `_match_conditions` from `alert_engine` for consistency.

## Testing
- Unit test validating a known match and non-match case.

