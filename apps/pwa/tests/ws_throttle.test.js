const assert = require("assert");
const { createThrottle } = require("../src/ws_throttle");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("createThrottle merges calls within window", (done) => {
  let count = 0;
  const throttle = createThrottle(50, () => { count += 1; });
  throttle();
  throttle();
  setTimeout(() => {
    assert.strictEqual(count, 1);
    done && done();
  }, 80);
});
