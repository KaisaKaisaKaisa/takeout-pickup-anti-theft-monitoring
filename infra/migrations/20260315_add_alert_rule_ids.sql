-- Add rule references to alert incidents

ALTER TABLE alert_incidents
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES rules(id);

ALTER TABLE alert_incidents
  ADD COLUMN IF NOT EXISTS rule_set_id uuid REFERENCES rule_sets(id);

CREATE INDEX IF NOT EXISTS idx_alerts_rule_id_time
  ON alert_incidents(rule_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_rule_set_id_time
  ON alert_incidents(rule_set_id, triggered_at DESC);
