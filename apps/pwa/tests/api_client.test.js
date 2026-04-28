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
  const fetchCalls = [];
  global.window = {
    API_BASE: "http://localhost:18000/api/v1",
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true, path: url }),
        text: async () => '{"ok":true}',
      };
    },
  };
  global.globalThis = global.window;

  delete require.cache[require.resolve("../src/api_client")];
  const apiClient = require("../src/api_client");

  await test("request injects auth header through token provider", async () => {
    const payload = await apiClient.request(
      "/orders",
      { method: "GET" },
      {
        apiBase: window.API_BASE,
        useAuth: true,
        getToken: async () => "token-123",
      },
    );
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(fetchCalls[0].url, "http://localhost:18000/api/v1/orders");
    assert.strictEqual(fetchCalls[0].options.headers.Authorization, "Bearer token-123");
  });

  await test("request surfaces backend detail from json error payload", async () => {
    window.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: { get: () => "application/json" },
      json: async () => ({ detail: "Invalid order id" }),
      text: async () => '{"detail":"Invalid order id"}',
    });
    await assert.rejects(
      () => apiClient.request("/orders", {}, { apiBase: window.API_BASE }),
      /Invalid order id/,
    );
  });

  await test("request retries once after auth refresh on 401", async () => {
    let attempts = 0;
    let refreshCalls = 0;
    window.fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          headers: { get: () => "application/json" },
          json: async () => ({ detail: "Invalid token" }),
          text: async () => '{"detail":"Invalid token"}',
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}',
      };
    };
    const payload = await apiClient.request(
      "/alerts",
      {},
      {
        apiBase: window.API_BASE,
        useAuth: true,
        getToken: async () => "stale-token",
        refreshAuth: async () => {
          refreshCalls += 1;
        },
      },
    );
    assert.deepStrictEqual(payload, { ok: true });
    assert.strictEqual(refreshCalls, 1);
    assert.strictEqual(attempts, 2);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
