const assert = require("assert");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((err) => {
      console.error(`fail - ${name}`);
      throw err;
    });
}

async function run() {
  global.window = { API_BASE: "http://localhost:18000/api/v1" };

  const okFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ ok: true, id: "rule-1" }),
    text: async () => '{"ok":true,"id":"rule-1"}',
  });

  global.fetch = okFetch;
  delete require.cache[require.resolve("../src/rules")];
  require("../src/rules");

  await test("rulesApi returns parsed json on success", async () => {
    const result = await window.rulesApi.createRule("token", "set-1", { name: "r" });
    assert.deepStrictEqual(result, { ok: true, id: "rule-1" });
  });

  global.fetch = async () => ({
    ok: false,
    status: 400,
    headers: { get: () => "application/json" },
    json: async () => ({ detail: "Invalid DSL" }),
    text: async () => '{"detail":"Invalid DSL"}',
  });

  await test("rulesApi throws backend detail on failure", async () => {
    await assert.rejects(
      () => window.rulesApi.validateDsl("token", { dsl_json: null }),
      /Invalid DSL/,
    );
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
