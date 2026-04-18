# Rule DSL Meta API Design

## Summary
Add a lightweight metadata endpoint so the visual rule editor can fetch supported operators and example DSL payloads.

## Goals
- Provide `GET /api/v1/rules/dsl/meta`.
- Return supported boolean/comparison operators.
- Return at least one example DSL payload.

## Non-goals
- No field dictionary (front-end free input for now).
- No persistence or DB access.

## API

### Endpoint
`GET /api/v1/rules/dsl/meta`

### Response
```json
{
  "operators": {
    "boolean": ["and", "or"],
    "compare": ["gt", "gte", "lt", "lte", "eq", "neq"]
  },
  "examples": [
    {
      "dsl_json": {
        "op": "and",
        "rules": [
          {"field": "motion_score", "op": "gte", "value": 1200},
          {"field": "weight_delta", "op": "lt", "value": -50}
        ]
      }
    }
  ]
}
```

## Testing
- Unit test calling the route function directly.
- Ensure `operators` keys exist and example structure present.

