const assert = require("assert");
const {
  buildFilterSignature,
  shouldAcceptIncremental,
  rebuildIndex,
  removeIndexForNodes,
} = require("../src/rule_match_index");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("filter signature changes when inputs change", () => {
  const a = buildFilterSignature({ eventType: "", ruleSetId: "", range: "24h", includeSuppressed: false, search: "" });
  const b = buildFilterSignature({ eventType: "motion", ruleSetId: "", range: "24h", includeSuppressed: false, search: "" });
  assert.notStrictEqual(a, b);
});

test("incremental blocked when signature mismatch", () => {
  const current = buildFilterSignature({ eventType: "", ruleSetId: "", range: "24h", includeSuppressed: false, search: "" });
  const next = buildFilterSignature({ eventType: "motion", ruleSetId: "", range: "24h", includeSuppressed: false, search: "" });
  assert.strictEqual(shouldAcceptIncremental(current, next), false);
});

test("filter signature changes when rule set or date range changes", () => {
  const a = buildFilterSignature({ eventType: "", ruleSetId: "set-a", range: "24h", includeSuppressed: false, search: "", start: "", end: "" });
  const b = buildFilterSignature({ eventType: "", ruleSetId: "set-b", range: "24h", includeSuppressed: false, search: "", start: "", end: "" });
  const c = buildFilterSignature({ eventType: "", ruleSetId: "set-b", range: "24h", includeSuppressed: false, search: "", start: "2026-03-01", end: "" });
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(b, c);
});

test("rebuildIndex collects nodes by data-id", () => {
  const list = { children: [
    { dataset: { id: "1" } },
    { dataset: { id: "2" } },
    { dataset: { id: "" } },
  ]};
  const map = rebuildIndex(list);
  assert.strictEqual(map.size, 2);
  assert.ok(map.has("1"));
  assert.ok(map.has("2"));
});

test("removeIndexForNodes deletes ids", () => {
  const index = new Map([["1", {}], ["2", {}]]);
  const nodes = [{ dataset: { id: "1" } }];
  removeIndexForNodes(index, nodes);
  assert.strictEqual(index.has("1"), false);
  assert.strictEqual(index.has("2"), true);
});
