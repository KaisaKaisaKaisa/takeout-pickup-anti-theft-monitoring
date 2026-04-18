const assert = require("assert");
const ruleDslEditor = require("../src/rule_dsl_editor");
const {
  createEmptyRuleDraft,
  hydrateRuleDraft,
  buildRulePayload,
} = require("../src/rule_console_logic");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("createEmptyRuleDraft uses platform defaults", () => {
  const draft = createEmptyRuleDraft("motion_score", ruleDslEditor);

  assert.strictEqual(draft.id, null);
  assert.strictEqual(draft.name, "");
  assert.strictEqual(draft.eventType, "motion");
  assert.strictEqual(draft.action, "alert");
  assert.strictEqual(draft.priority, 100);
  assert.strictEqual(draft.cooldownSec, 120);
  assert.strictEqual(draft.enabled, true);
  assert.strictEqual(draft.dsl.rules[0].field, "motion_score");
});

test("hydrateRuleDraft prefers dsl_json when present", () => {
  const draft = hydrateRuleDraft(
    {
      id: "rule-1",
      name: "高风险动作",
      event_type: "motion",
      action: "alert",
      priority: 80,
      cooldown_sec: 300,
      enabled: false,
      dsl_json: {
        op: "and",
        rules: [{ field: "noise_db", op: "gte", value: 60 }],
      },
    },
    "motion_score",
    ruleDslEditor,
  );

  assert.strictEqual(draft.id, "rule-1");
  assert.strictEqual(draft.name, "高风险动作");
  assert.strictEqual(draft.priority, 80);
  assert.strictEqual(draft.cooldownSec, 300);
  assert.strictEqual(draft.enabled, false);
  assert.strictEqual(draft.dsl.rules[0].field, "noise_db");
});

test("hydrateRuleDraft falls back to legacy conditions", () => {
  const draft = hydrateRuleDraft(
    {
      id: "rule-2",
      name: "重量突降",
      event_type: "weight_drop",
      conditions: {
        weight_delta: { lt: -50 },
      },
    },
    "motion_score",
    ruleDslEditor,
  );

  assert.strictEqual(draft.eventType, "weight_drop");
  assert.strictEqual(draft.dsl.op, "and");
  assert.strictEqual(draft.dsl.rules[0].field, "weight_delta");
  assert.strictEqual(draft.dsl.rules[0].op, "lt");
  assert.strictEqual(draft.dsl.rules[0].value, -50);
});

test("buildRulePayload maps editor draft to api payload", () => {
  const payload = buildRulePayload({
    name: "  夜间告警  ",
    enabled: true,
    priority: "120",
    eventType: "motion",
    dsl: {
      op: "and",
      rules: [{ field: "motion_score", op: "gte", value: 900 }],
    },
    action: "alert",
    actionParams: { channel: "push" },
    cooldownSec: "180",
  });

  assert.deepStrictEqual(payload, {
    name: "夜间告警",
    enabled: true,
    priority: 120,
    event_type: "motion",
    dsl_json: {
      op: "and",
      rules: [{ field: "motion_score", op: "gte", value: 900 }],
    },
    action: "alert",
    action_params: { channel: "push" },
    cooldown_sec: 180,
  });
});
