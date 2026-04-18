# Rule DSL Fields API Design

## Summary
Expose a static field dictionary so the visual rule editor can present selectable metrics and types.

## Goals
- Provide `GET /api/v1/rules/dsl/fields`.
- Return a list of known metrics fields with types and labels.

## Non-goals
- No dynamic discovery of metrics.
- No localization beyond simple labels.

## API

### Endpoint
`GET /api/v1/rules/dsl/fields`

### Response
```json
{
  "fields": [
    {"key": "motion_score", "type": "number", "label": "Motion Score", "unit": "score", "example": 1200},
    {"key": "weight_delta", "type": "number", "label": "Weight Delta", "unit": "g", "example": -50},
    {"key": "motion", "type": "number", "label": "Motion", "unit": "score", "example": 0.5},
    {"key": "presence", "type": "boolean", "label": "Presence Detected", "example": true},
    {"key": "noise_db", "type": "number", "label": "Noise Level", "unit": "dB", "example": 62}
  ]
}
```

## Testing
- Unit test ensures `fields` key exists and contains at least one entry.

