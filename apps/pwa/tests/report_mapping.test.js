const assert = require("assert");
const { normalizeSummary, normalizeTrends } = require("../src/report_mapping");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("normalizeSummary provides default groups", () => {
  const data = { orders: { total: 1 } };
  const normalized = normalizeSummary(data);
  assert.ok(normalized.rule_matches);
  assert.strictEqual(normalized.events_last_24h, 0);
  assert.strictEqual(normalized.rule_matches.total, 0);
});

test("normalizeTrends provides default groups", () => {
  const data = { interval: "day", orders: [] };
  const normalized = normalizeTrends(data);
  assert.ok(normalized.rule_matches);
  assert.ok(normalized.events);
  assert.ok(normalized.devices);
  assert.ok(normalized.sessions);
});
