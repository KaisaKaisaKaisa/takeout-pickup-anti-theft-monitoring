const assert = require("assert");
const {
  createEmptyDsl,
  normalizeDsl,
  conditionsToDsl,
  isGroup,
} = require("../src/rule_dsl_editor");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("createEmptyDsl builds default group", () => {
  const dsl = createEmptyDsl("motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.ok(Array.isArray(dsl.rules));
  assert.strictEqual(dsl.rules.length, 1);
  assert.strictEqual(dsl.rules[0].field, "motion_score");
});

test("normalizeDsl falls back on invalid input", () => {
  const dsl = normalizeDsl(null, "motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.strictEqual(dsl.rules.length, 1);
});

test("conditionsToDsl maps simple condition", () => {
  const dsl = conditionsToDsl({ motion_score: { gte: 5 } }, "motion_score");
  assert.strictEqual(dsl.op, "and");
  assert.strictEqual(dsl.rules[0].field, "motion_score");
  assert.strictEqual(dsl.rules[0].op, "gte");
  assert.strictEqual(dsl.rules[0].value, 5);
});

test("isGroup detects group shape", () => {
  assert.strictEqual(isGroup({ op: "and", rules: [] }), true);
  assert.strictEqual(isGroup({ field: "x", op: "gte", value: 1 }), false);
});

if (require.main === module) {
  console.log("done");
}
