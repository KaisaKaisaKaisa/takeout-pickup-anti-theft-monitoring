const assert = require("assert");
const { createRealtimeClient } = require("../src/realtime_client");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((err) => {
      console.error(`fail - ${name}`);
      process.exitCode = 1;
      throw err;
    });
}

function createEnv(overrides = {}) {
  const calls = [];
  const nodes = {
    "orders-list": createList(),
    "alerts-list": createList(),
    "devices-list": createList(),
    "rule-matches-list": createList(),
  };
  const env = {
    calls,
    document: {
      hidden: false,
      addEventListener(type) {
        calls.push(["document-listener", type]);
      },
    },
    root: {
      wsThrottle: {
        createThrottle(_wait, handler) {
          return () => handler();
        },
      },
      realtimeRouter: require("../src/realtime_router"),
      wsLogic: {
        shouldInsertRuleMatch() {
          return true;
        },
      },
      ruleMatchIndex: {
        buildFilterSignature() {
          return "sig";
        },
        shouldAcceptIncremental() {
          return true;
        },
        removeIndexForNodes() {},
      },
      trendCache: {
        applyRuleMatchIncrement(cache) {
          cache.rule_matches = cache.rule_matches || [];
          cache.rule_matches.push({ bucket: "now", total: 1 });
          return true;
        },
      },
    },
    getElementById(id) {
      return nodes[id] || null;
    },
    getRuleMatchFilters() {
      return { limit: 8, offset: 0, range: "24h" };
    },
    getRuleMatchPage() {
      return 1;
    },
    setRuleMatchHasMore(value) {
      calls.push(["has-more", value]);
    },
    updateRuleMatchPager() {
      calls.push(["pager"]);
    },
    getRuleMatchSignature() {
      return "";
    },
    setRuleMatchSignature(value) {
      calls.push(["signature", value]);
    },
    getTrendCache() {
      return { rule_matches: [] };
    },
    renderTrendBars(_node, rows, kind) {
      calls.push(["trend-bars", kind, rows.length]);
    },
    renderTrendMeta(_node, rows) {
      calls.push(["trend-meta", rows.length]);
    },
    ruleMatchIndex: new Map(),
    loadOrders: async () => calls.push(["load", "orders"]),
    loadAlerts: async () => calls.push(["load", "alerts"]),
    loadDevices: async () => calls.push(["load", "devices"]),
    loadReports: async () => calls.push(["load", "reports"]),
    loadTrends: async () => calls.push(["load", "trends"]),
    loadRuleMatches: async (page) => calls.push(["load", "rule-matches", page]),
    buildOrderCard: (row) => createNode(row.id),
    buildAlertCard: (row) => createNode(row.id),
    buildDeviceCard: (row) => createNode(row.id),
    buildRuleMatchCard: (row) => createNode(row.id),
    ...overrides,
  };
  env.nodes = nodes;
  return env;
}

function createNode(id) {
  return {
    dataset: { id: id == null ? "" : String(id) },
    parentElement: null,
    remove() {
      if (!this.parentElement) {
        return;
      }
      const list = this.parentElement;
      list.children = list.children.filter((child) => child !== this);
      this.parentElement = null;
    },
  };
}

function createList() {
  return {
    children: [],
    querySelector(selector) {
      const id = selector.match(/data-id="([^"]+)"/)?.[1] || "";
      return this.children.find((child) => child.dataset.id === id) || null;
    },
    prepend(node) {
      node.parentElement = this;
      this.children.unshift(node);
    },
    appendChild(node) {
      node.parentElement = this;
      this.children.push(node);
    },
  };
}

test("merges order alert and device payloads through card builders", async () => {
  const env = createEnv();
  const client = createRealtimeClient(env);

  await client.handleMessage({ data: JSON.stringify({ type: "order.updated", payload: { order: { id: "order-1" } } }) });
  await client.handleMessage({ data: JSON.stringify({ type: "alert.updated", payload: { alert: { id: "alert-1" } } }) });
  await client.handleMessage({ data: JSON.stringify({ type: "device.updated", payload: { device: { id: "device-1" } } }) });

  assert.deepStrictEqual(env.nodes["orders-list"].children.map((node) => node.dataset.id), ["order-1"]);
  assert.deepStrictEqual(env.nodes["alerts-list"].children.map((node) => node.dataset.id), ["alert-1"]);
  assert.deepStrictEqual(env.nodes["devices-list"].children.map((node) => node.dataset.id), ["device-1"]);
  assert(env.calls.some((call) => call[0] === "load" && call[1] === "reports"));
});

test("routes unknown string events to refresh fallback", async () => {
  const env = createEnv();
  const client = createRealtimeClient(env);

  await client.handleMessage({ data: "unknown.event" });

  assert(env.calls.some((call) => call[0] === "load" && call[1] === "alerts"));
  assert(env.calls.some((call) => call[0] === "load" && call[1] === "reports"));
});

test("increments accepted rule matches and trend cache", async () => {
  const env = createEnv();
  const client = createRealtimeClient(env);

  await client.handleMessage({
    data: JSON.stringify({
      type: "rule.match",
      payload: { match: { id: "match-1", matched_at: "2026-04-26T08:00:00.000Z" } },
    }),
  });

  assert.deepStrictEqual(env.nodes["rule-matches-list"].children.map((node) => node.dataset.id), ["match-1"]);
  assert(env.calls.some((call) => call[0] === "has-more" && call[1] === true));
  assert(env.calls.some((call) => call[0] === "trend-bars"));
});

test("binds visibility refresh once across client instances", () => {
  const env = createEnv();
  const client = createRealtimeClient(env);

  client.bindVisibilityRefresh();
  client.bindVisibilityRefresh();

  assert.deepStrictEqual(
    env.calls.filter((call) => call[0] === "document-listener"),
    [["document-listener", "visibilitychange"]],
  );
});
