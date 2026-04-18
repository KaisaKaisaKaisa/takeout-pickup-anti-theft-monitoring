const assert = require("assert");
const { buildRuleSetSelectOptions } = require("../src/rule_set_select");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("buildRuleSetSelectOptions creates editor and filter options", () => {
  const result = buildRuleSetSelectOptions([
    { id: "user-1", name: "宿舍规则", scope: "user" },
    { id: "global-1", name: "全局高风险", scope: "global" },
  ]);

  assert.deepStrictEqual(result.editorOptions, [
    { value: "user-1", label: "宿舍规则 / 个人" },
    { value: "global-1", label: "全局高风险 / 全局" },
  ]);

  assert.deepStrictEqual(result.filterOptions, [
    { value: "", label: "全部规则集" },
    { value: "user-1", label: "宿舍规则 / 个人" },
    { value: "global-1", label: "全局高风险 / 全局" },
  ]);
});

test("buildRuleSetSelectOptions keeps filter default when sets empty", () => {
  const result = buildRuleSetSelectOptions([]);

  assert.deepStrictEqual(result.editorOptions, []);
  assert.deepStrictEqual(result.filterOptions, [{ value: "", label: "全部规则集" }]);
});
