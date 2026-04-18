const assert = require("assert");
const { shouldInsertRuleMatch } = require("../src/ws_logic");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("default filters accept non-suppressed match", () => {
  const match = { event_type: "motion", suppressed: false, matched_at: new Date().toISOString() };
  const filters = { eventType: "", ruleSetId: "", search: "", includeSuppressed: false, range: "24h", start: "", end: "" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date()), true);
});

test("suppressed match excluded by default", () => {
  const match = { event_type: "motion", suppressed: true, matched_at: new Date().toISOString() };
  const filters = { eventType: "", ruleSetId: "", search: "", includeSuppressed: false, range: "24h", start: "", end: "" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date()), false);
});

test("rule set filter excludes mismatched match", () => {
  const match = {
    event_type: "motion",
    rule_set_id: "set-a",
    suppressed: false,
    matched_at: new Date().toISOString(),
  };
  const filters = { eventType: "", ruleSetId: "set-b", search: "", includeSuppressed: false, range: "24h", start: "", end: "" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date()), false);
});

test("explicit date range excludes out-of-window match", () => {
  const match = {
    event_type: "motion",
    rule_set_id: "set-a",
    suppressed: false,
    matched_at: "2026-03-01T08:00:00.000Z",
  };
  const filters = { eventType: "", ruleSetId: "", search: "", includeSuppressed: false, range: "all", start: "2026-03-02", end: "2026-03-03" };
  assert.strictEqual(shouldInsertRuleMatch(match, filters, new Date("2026-03-04T00:00:00.000Z")), false);
});
