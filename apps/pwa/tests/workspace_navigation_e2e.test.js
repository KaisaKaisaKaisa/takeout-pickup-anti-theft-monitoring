const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../src");
const OUT_DIR = path.resolve(__dirname, "../../../output/playwright");
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HOST = "127.0.0.1";
const PORT = Number(process.env.PWA_E2E_PORT || 5174);
const DEBUG_PORT = Number(process.env.PWA_E2E_DEBUG_PORT || 9223);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const decodedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(ROOT, `.${decodedPath}`);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

function startChrome() {
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Chrome not found at ${CHROME_PATH}`);
  }
  const userDataDir = path.join(OUT_DIR, "chrome-workspace-nav-profile");
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `http://${HOST}:${PORT}/index.html`,
  ];
  const child = spawn(CHROME_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function waitForDevTools() {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const version = await fetchJson(`http://${HOST}:${DEBUG_PORT}/json/version`);
      if (version.webSocketDebuggerUrl) {
        return version;
      }
    } catch (err) {
      lastError = err;
      await sleep(250);
    }
  }
  throw lastError || new Error("Timed out waiting for Chrome DevTools");
}

async function getPageWebSocketUrl() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const tabs = await fetchJson(`http://${HOST}:${DEBUG_PORT}/json`);
    const page = tabs.find((tab) => tab.type === "page" && tab.url.includes(`:${PORT}/index.html`));
    if (page?.webSocketDebuggerUrl) {
      return page.webSocketDebuggerUrl;
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for PWA tab");
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
      return;
    }
    if (message.method && listeners.has(message.method)) {
      listeners.get(message.method).forEach((handler) => handler(message.params || {}));
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await ready;
      const id = nextId++;
      const payload = JSON.stringify({ id, method, params });
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(payload);
      });
    },
    on(method, handler) {
      if (!listeners.has(method)) {
        listeners.set(method, []);
      }
      listeners.get(method).push(handler);
    },
    close() {
      ws.close();
    },
  };
}

function compileScript(fn, ...args) {
  return `(${fn.toString()})(...${JSON.stringify(args)})`;
}

async function evaluate(cdp, fn, ...args) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: compileScript(fn, ...args),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const ok = await evaluate(cdp, predicate);
      if (ok) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(150);
  }
  let pageState = null;
  try {
    pageState = await evaluate(cdp, () => ({
      readyState: document.readyState,
      workspace: document.body?.dataset?.workspace || "",
      hash: location.hash,
      errors: window.__workspaceNavErrors || [],
      consoleErrors: window.__workspaceNavConsoleErrors || [],
      title: document.title,
      appScript: Boolean([...document.scripts].find((script) => script.src.includes("app.js"))),
    }));
  } catch (err) {
    pageState = { diagnosticError: err.message };
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(pageState)}${lastError ? `; last error: ${lastError.message}` : ""}`);
}

function apiStubScript() {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  window.__workspaceNavErrors = [];
  window.__workspaceNavConsoleErrors = [];
  window.addEventListener("error", (event) => {
    window.__workspaceNavErrors.push(event.message || String(event.error || "unknown error"));
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__workspaceNavErrors.push(event.reason?.message || String(event.reason || "unknown rejection"));
  });
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    window.__workspaceNavConsoleErrors.push(args.map((arg) => String(arg?.message || arg)).join(" "));
    originalConsoleError(...args);
  };
  class StubWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      setTimeout(() => this.onopen && this.onopen({ type: "open" }), 0);
    }
    send() {}
    close() {
      this.readyState = 3;
      if (this.onclose) {
        this.onclose({ type: "close" });
      }
    }
    addEventListener(type, handler) {
      this[`on${type}`] = handler;
    }
    removeEventListener() {}
  }
  window.WebSocket = StubWebSocket;
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const pathname = url.pathname.replace(/^\/api\/v1/, "");
    if (url.pathname === "/readyz") {
      return json({ ok: true, database: true, redis: true, minio: true });
    }
    if (pathname === "/auth/login" || pathname === "/auth/register") {
      return json({ access_token: "e2e-token", token_type: "bearer" });
    }
    if (pathname === "/me") {
      return json({ id: "user-1", phone: "demo-user", name: "Demo" });
    }
    if (pathname === "/orders") {
      return json({ orders: [] });
    }
    if (pathname === "/alerts") {
      return json({ alerts: [] });
    }
    if (pathname === "/devices") {
      return json({ devices: [] });
    }
    if (pathname === "/reports/summary") {
      return json({
        orders: {},
        alerts: {},
        devices: {},
        sessions: {},
        events_last_24h: 0,
        rule_matches: {},
      });
    }
    if (pathname === "/reports/trends") {
      return json({ interval: "day", orders: [], alerts: [], devices: [], sessions: [], events: [], rule_matches: [] });
    }
    if (pathname === "/rules/matches") {
      return json([]);
    }
    if (pathname === "/rules/sets") {
      return json([]);
    }
    if (pathname === "/rules/dsl/meta") {
      return json({ operators: ["all", "any"], comparators: ["eq", "gt", "lt"] });
    }
    if (pathname === "/rules/dsl/fields") {
      return json({ fields: [] });
    }
    return json({ ok: true, path: pathname, method: options.method || "GET" });
  };
}

async function clickAndAssertWorkspace(cdp, selector, expectedWorkspace) {
  const result = await evaluate(
    cdp,
    (clickSelector, workspaceId) => {
      const node = document.querySelector(clickSelector);
      if (!node) {
        return { ok: false, reason: `missing ${clickSelector}` };
      }
      node.click();
      const section = document.getElementById(workspaceId);
      const rect = section?.getBoundingClientRect();
      return {
        ok:
          document.body.dataset.workspace === workspaceId &&
          section?.classList.contains("is-current-workspace") &&
          Boolean(rect && rect.width > 0 && rect.height > 0),
        workspace: document.body.dataset.workspace || "",
        active: Boolean(section?.classList.contains("is-current-workspace")),
        hasSection: Boolean(section),
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        hash: location.hash,
      };
    },
    selector,
    expectedWorkspace,
  );
  assert.deepStrictEqual(result.ok, true, `${selector} should activate ${expectedWorkspace}: ${JSON.stringify(result)}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startStaticServer();
  const chrome = startChrome();
  let cdp = null;
  try {
    await waitForDevTools();
    const pageWsUrl = await getPageWebSocketUrl();
    cdp = createCdpClient(pageWsUrl);
    const consoleMessages = [];
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") {
        consoleMessages.push((params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", (params) => {
      consoleMessages.push(params.exceptionDetails?.text || "Runtime exception");
    });
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: compileScript(apiStubScript) });
    await cdp.send("Page.navigate", { url: `http://${HOST}:${PORT}/index.html` });
    await waitFor(
      cdp,
      () => document.readyState === "complete" && document.body.dataset.workspace === "overview",
      "initial workspace activation",
    );

    const workspaces = [
      ['.nav a[href="#console"]', "console"],
      ['.nav a[href="#mission"]', "mission"],
      ['.nav a[href="#gallery"]', "gallery"],
      ['.nav a[href="#motion"]', "motion"],
      ['.nav a[href="#workflow"]', "workflow"],
      ['.nav a[href="#reports"]', "reports"],
      ['.nav a[href="#rules"]', "rules"],
      ['.nav a[href="#ops"]', "ops"],
      ["#hero-connect-btn", "ops"],
      ["#hero-demo-btn", "orders"],
      ["#footer-health-link", "ops"],
    ];

    for (const [selector, expected] of workspaces) {
      await clickAndAssertWorkspace(cdp, selector, expected);
    }

    const runtimeErrors = await evaluate(
      cdp,
      () => ({
        errors: window.__workspaceNavErrors || [],
        consoleErrors: (window.__workspaceNavConsoleErrors || []).filter((message) => !/favicon/i.test(message)),
      }),
    );
    assert.deepStrictEqual(runtimeErrors.errors, [], `window errors: ${runtimeErrors.errors.join("; ")}`);
    assert.deepStrictEqual(runtimeErrors.consoleErrors, [], `console errors: ${runtimeErrors.consoleErrors.join("; ")}`);
    assert.deepStrictEqual(consoleMessages, [], `CDP console/runtime errors: ${consoleMessages.join("; ")}`);

    await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then((shot) => {
      fs.writeFileSync(path.join(OUT_DIR, "workspace-navigation-e2e.png"), Buffer.from(shot.data, "base64"));
    });
    console.log("ok - workspace navigation activates all primary pages without runtime errors");
  } finally {
    if (cdp) {
      cdp.close();
    }
    chrome.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
