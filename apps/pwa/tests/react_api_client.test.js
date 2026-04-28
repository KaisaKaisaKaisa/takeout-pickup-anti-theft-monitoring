const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("../node_modules/typescript");

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

function loadReactApi(env = {}) {
  const apiPath = path.join(__dirname, "../src/lib/api.ts");
  const source = fs
    .readFileSync(apiPath, "utf8")
    .replaceAll("import.meta.env", "globalThis.__TG_IMPORT_META_ENV__");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: apiPath,
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    fetch: global.fetch,
    setTimeout,
    clearTimeout,
    AbortController: global.AbortController,
    Blob: global.Blob,
    DOMException: global.DOMException,
    FormData: global.FormData,
    Headers: global.Headers,
    localStorage: global.localStorage,
    __TG_IMPORT_META_ENV__: {
      VITE_API_BASE: "http://api.test/api/v1",
      ...env,
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(output, sandbox, { filename: apiPath });
  return module.exports;
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? "Unauthorized" : status === 500 ? "Server Error" : "OK",
    headers: { get: () => "application/json" },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function run() {
  let storedToken = "cached-token";
  global.localStorage = {
    getItem(key) {
      return key === "tg_token" ? storedToken : null;
    },
    setItem(key, value) {
      if (key === "tg_token") {
        storedToken = value;
      }
    },
    removeItem(key) {
      if (key === "tg_token") {
        storedToken = null;
      }
    },
  };

  await test("request injects cached bearer token for React API calls", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, { ok: true });
    };

    const { guardApi } = loadReactApi();
    const payload = await guardApi.request("/orders");

    assert.deepStrictEqual(payload, { ok: true });
    assert.strictEqual(calls[0].url, "http://api.test/api/v1/orders");
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer cached-token");
  });

  await test("request refreshes auth once after a 401 and retries with the new token", async () => {
    storedToken = "stale-token";
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/orders") && calls.filter((call) => call.url.endsWith("/orders")).length === 1) {
        return jsonResponse(401, { detail: "Invalid token" });
      }
      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, { access_token: "fresh-token" });
      }
      return jsonResponse(200, { orders: [] });
    };

    const { guardApi } = loadReactApi();
    const payload = await guardApi.request("/orders");

    assert.deepStrictEqual(payload, { orders: [] });
    assert.strictEqual(storedToken, "fresh-token");
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer stale-token");
    assert.strictEqual(calls[2].options.headers.Authorization, "Bearer fresh-token");
  });

  await test("fetchGuardSnapshot surfaces API failure instead of silently returning demo data", async () => {
    storedToken = "cached-token";
    global.fetch = async () => jsonResponse(500, { detail: "database unavailable" });

    const { fetchGuardSnapshot } = loadReactApi();

    await assert.rejects(() => fetchGuardSnapshot(), /database unavailable/);
  });

  await test("fetchGuardSnapshot only uses demo data when explicit demo mode is enabled", async () => {
    storedToken = "cached-token";
    global.fetch = async () => {
      throw new Error("fetch should not be called in demo mode");
    };

    const { fetchGuardSnapshot } = loadReactApi({ VITE_DEMO_MODE: "true" });
    const snapshot = await fetchGuardSnapshot();

    assert.ok(snapshot.orders.length > 0);
    assert.strictEqual(snapshot.orders[0].provider, "manual");
  });

  await test("downloadCsv fetches export files with bearer auth and a stable filename", async () => {
    storedToken = "cached-token";
    const calls = [];
    const clicked = [];
    const appended = [];
    const revoked = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/csv" },
        blob: async () => new Blob(["id,status\n1,open\n"], { type: "text/csv" }),
        json: async () => ({}),
        text: async () => "id,status\n1,open\n",
      };
    };

    const { guardApi } = loadReactApi();
    guardApi.setDownloadHost({
      createObjectURL(blob) {
        assert.strictEqual(blob.type, "text/csv");
        return "blob:report";
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
      createLink() {
        return { href: "", download: "" };
      },
      appendLink(link) {
        appended.push({ href: link.href, download: link.download });
      },
      clickLink(link) {
        clicked.push({ href: link.href, download: link.download });
      },
      removeLink() {},
    });

    await guardApi.downloadCsv("/reports/summary/export?scope=user", "summary.csv");

    assert.strictEqual(calls[0].url, "http://api.test/api/v1/reports/summary/export?scope=user");
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer cached-token");
    assert.deepStrictEqual(appended[0], { href: "blob:report", download: "summary.csv" });
    assert.deepStrictEqual(clicked[0], { href: "blob:report", download: "summary.csv" });
    assert.deepStrictEqual(revoked, ["blob:report"]);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
