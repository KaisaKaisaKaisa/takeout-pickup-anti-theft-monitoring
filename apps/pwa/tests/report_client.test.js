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
  global.window = {
    apiParams: {
      buildSummaryQuery(filters) {
        return `scope=${filters.scope || "user"}&start=${filters.start || ""}`;
      },
      buildTrendsQuery(filters) {
        return `scope=${filters.scope || "user"}&interval=${filters.interval || "day"}`;
      },
      buildRuleMatchesQuery(filters) {
        return `limit=${filters.limit || 8}&offset=${filters.offset || 0}`;
      },
      buildRuleMatchesExportQuery(filters) {
        return `scope=${filters.scope || "user"}&limit=${filters.limit || 200}`;
      },
    },
    reportMapping: {
      normalizeSummary(payload) {
        return { ...payload, normalized: "summary" };
      },
      normalizeTrends(payload) {
        return { ...payload, normalized: "trends" };
      },
    },
  };
  global.globalThis = global.window;

  delete require.cache[require.resolve("../src/report_client")];
  const reportClient = require("../src/report_client");

  await test("loadSummary uses api params and mapping normalization", async () => {
    const calls = [];
    const payload = await reportClient.loadSummary(async (path) => {
      calls.push(path);
      return { orders: { total: 1 } };
    }, { scope: "user", start: "2026-03-01" });

    assert.strictEqual(calls[0], "/reports/summary?scope=user&start=2026-03-01");
    assert.strictEqual(payload.normalized, "summary");
  });

  await test("loadTrends uses api params and mapping normalization", async () => {
    const calls = [];
    const payload = await reportClient.loadTrends(async (path) => {
      calls.push(path);
      return { interval: "week", orders: [] };
    }, { scope: "user", interval: "week" });

    assert.strictEqual(calls[0], "/reports/trends?scope=user&interval=week");
    assert.strictEqual(payload.normalized, "trends");
  });

  await test("exportRuleMatches builds export path and filename", async () => {
    const calls = [];
    await reportClient.exportRuleMatches(async (path, filename) => {
      calls.push({ path, filename });
    }, { scope: "user", limit: 200 });

    assert.deepStrictEqual(calls[0], {
      path: "/reports/rule-matches/export?scope=user&limit=200",
      filename: "rule-matches.csv",
    });
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
