const assert = require("assert");
const {
  parseRealtimeEnvelope,
  classifyRealtimeKind,
} = require("../src/realtime_router");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("parseRealtimeEnvelope reads JSON alert payload", () => {
  const envelope = parseRealtimeEnvelope(
    JSON.stringify({
      type: "alert.created",
      payload: {
        entity_type: "alert",
        entity: { id: "alert-1", status: "open" },
      },
    }),
  );

  assert.strictEqual(envelope.eventType, "alert.created");
  assert.strictEqual(envelope.entityType, "alert");
  assert.strictEqual(envelope.kind, "alert");
  assert.deepStrictEqual(envelope.entity, { id: "alert-1", status: "open" });
});

test("parseRealtimeEnvelope falls back to raw string event type", () => {
  const envelope = parseRealtimeEnvelope("device.updated");

  assert.strictEqual(envelope.eventType, "device.updated");
  assert.strictEqual(envelope.kind, "device");
  assert.strictEqual(envelope.entity, null);
});

test("parseRealtimeEnvelope detects rule match payload without entity_type", () => {
  const envelope = parseRealtimeEnvelope({
    type: "rule.match",
    payload: {
      match: { id: "match-1", event_type: "motion" },
    },
  });

  assert.strictEqual(envelope.kind, "rule_match");
  assert.deepStrictEqual(envelope.entity, { id: "match-1", event_type: "motion" });
});

test("classifyRealtimeKind uses payload hints when entity type is absent", () => {
  const kind = classifyRealtimeKind({
    eventType: "message",
    entityType: "",
    payload: {
      order: { id: "order-1" },
    },
  });

  assert.strictEqual(kind, "order");
});
