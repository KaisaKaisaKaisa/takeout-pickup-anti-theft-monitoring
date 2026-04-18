const assert = require("assert");
const { getAlertActionMeta } = require("../src/alert_actions");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("getAlertActionMeta returns ack route and messages", () => {
  const meta = getAlertActionMeta("ack");
  assert.deepStrictEqual(meta, {
    action: "ack",
    pathSuffix: "ack",
    successMessage: "告警已确认",
    errorMessage: "告警确认失败",
  });
});

test("getAlertActionMeta returns resolve route and messages", () => {
  const meta = getAlertActionMeta("resolve");
  assert.deepStrictEqual(meta, {
    action: "resolve",
    pathSuffix: "resolve",
    successMessage: "告警已结案",
    errorMessage: "告警结案失败",
  });
});

test("getAlertActionMeta returns false-positive route and messages", () => {
  const meta = getAlertActionMeta("false_positive");
  assert.deepStrictEqual(meta, {
    action: "false_positive",
    pathSuffix: "false-positive",
    successMessage: "已标记为误报",
    errorMessage: "误报标记失败",
  });
});

test("getAlertActionMeta rejects unknown action", () => {
  assert.throws(() => getAlertActionMeta("noop"), /Unknown alert action/);
});
