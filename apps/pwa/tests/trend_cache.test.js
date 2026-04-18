const assert = require("assert");
const { buildBucketKey, applyRuleMatchIncrement } = require("../src/trend_cache");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("buildBucketKey day", () => {
  const key = buildBucketKey(new Date("2026-03-15T10:00:00Z"), "day");
  assert.strictEqual(key, "2026-03-15");
});

test("applyRuleMatchIncrement creates bucket", () => {
  const cache = { interval: "day", rule_matches: [] };
  applyRuleMatchIncrement(cache, "2026-03-15T10:00:00Z");
  assert.strictEqual(cache.rule_matches[0].count, 1);
});
