const assert = require("assert");
const {
  buildSummaryQuery,
  buildTrendsQuery,
  buildRuleMatchesQuery,
  buildRuleMatchesExportQuery,
} = require("../src/api_params");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("summary query includes optional date range", () => {
  const query = buildSummaryQuery({
    scope: "user",
    start: "2026-03-01",
    end: "2026-03-07",
  });
  assert.strictEqual(query, "scope=user&start=2026-03-01&end=2026-03-07");
});

test("trends query uses weekly window and explicit range", () => {
  const query = buildTrendsQuery({
    scope: "user",
    interval: "week",
    weeks: 8,
    start: "2026-03-01",
    end: "2026-03-31",
  });
  assert.strictEqual(query, "scope=user&interval=week&weeks=8&start=2026-03-01&end=2026-03-31");
});

test("rule matches query distinguishes event type from rule set id", () => {
  const query = buildRuleMatchesQuery({
    limit: 8,
    offset: 16,
    eventType: "motion",
    ruleSetId: "set-123",
    range: "7d",
    search: "abc",
    includeSuppressed: true,
    start: "2026-03-02",
    end: "2026-03-08",
  });
  assert.strictEqual(
    query,
    "limit=8&offset=16&event_type=motion&rule_set_id=set-123&search=abc&start=2026-03-02&end=2026-03-08&include_suppressed=true",
  );
});

test("rule matches export query carries active filters", () => {
  const query = buildRuleMatchesExportQuery({
    scope: "user",
    limit: 200,
    ruleSetId: "set-1",
    range: "30d",
    start: "2026-03-01",
    end: "2026-03-30",
  });
  assert.strictEqual(
    query,
    "scope=user&limit=200&rule_set_id=set-1&start=2026-03-01&end=2026-03-30",
  );
});

test("explicit date range suppresses preset range for rule match requests", () => {
  const query = buildRuleMatchesQuery({
    limit: 8,
    offset: 0,
    range: "24h",
    start: "2026-03-01",
    end: "2026-03-02",
  });
  assert.strictEqual(query, "limit=8&offset=0&start=2026-03-01&end=2026-03-02");
});
