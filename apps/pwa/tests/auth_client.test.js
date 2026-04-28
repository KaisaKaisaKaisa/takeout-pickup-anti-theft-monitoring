const assert = require("assert");

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

async function run() {
  const localStore = new Map();
  global.window = {
    API_BASE: "http://localhost:18000/api/v1",
    setTimeout,
    clearTimeout,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    document: {
      body: {
        appendChild() {},
      },
      createElement() {
        return {
          click() {},
          remove() {},
        };
      },
    },
    localStorage: {
      getItem(key) {
        return localStore.has(key) ? localStore.get(key) : null;
      },
      setItem(key, value) {
        localStore.set(key, value);
      },
      removeItem(key) {
        localStore.delete(key);
      },
    },
  };
  global.globalThis = global.window;

  const apiClient = {
    async request(path) {
      if (path === "/auth/login") {
        return { access_token: "login-token" };
      }
      return { ok: true, path };
    },
    async requestBlob() {
      return { size: 1 };
    },
  };
  window.apiClient = apiClient;

  delete require.cache[require.resolve("../src/auth_client")];
  const authClient = require("../src/auth_client");

  await test("ensureAuth stores and returns login token", async () => {
    const state = { token: null };
    const token = await authClient.ensureAuth({
      store: state,
      apiBase: window.API_BASE,
      apiClient,
      demoAccount: { phone: "demo", password: "pass", name: "Demo" },
    });
    assert.strictEqual(token, "login-token");
    assert.strictEqual(state.token, "login-token");
    assert.strictEqual(localStore.get("tg_token"), "login-token");
  });

  await test("fetchJson delegates through api client with auth context", async () => {
    let receivedToken = null;
    const state = { token: "cached-token" };
    const observingClient = {
      async request(_path, _options, config) {
        receivedToken = await config.getToken();
        return { ok: true };
      },
      async requestBlob() {
        return { size: 1 };
      },
    };

    const payload = await authClient.fetchJson("/orders", { method: "GET" }, {
      store: state,
      apiBase: window.API_BASE,
      apiClient: observingClient,
    });

    assert.strictEqual(payload.ok, true);
    assert.strictEqual(receivedToken, "cached-token");
  });

  await test("ensureAuth reports a readable failure when login and register fail", async () => {
    localStore.clear();
    const failingClient = {
      async request() {
        throw new Error("backend rejected auth");
      },
      async requestBlob() {
        return { size: 1 };
      },
    };
    await assert.rejects(
      () =>
        authClient.ensureAuth({
          store: { token: null },
          apiBase: window.API_BASE,
          apiClient: failingClient,
          demoAccount: { phone: "demo", password: "pass", name: "Demo" },
        }),
      /登录失败/,
    );
  });

  await test("clearAuth clears in-memory and persisted token", async () => {
    const state = { token: "cached-token" };
    localStore.set("tg_token", "cached-token");
    authClient.clearAuth(state);
    assert.strictEqual(state.token, null);
    assert.strictEqual(localStore.has("tg_token"), false);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
