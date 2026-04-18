const assert = require("assert");
const { enforceListLimit } = require("../src/list_limit");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("enforceListLimit trims to max size", () => {
  const items = [1, 2, 3, 4, 5];
  const trimmed = enforceListLimit(items, 3);
  assert.deepStrictEqual(trimmed, [1, 2, 3]);
});
