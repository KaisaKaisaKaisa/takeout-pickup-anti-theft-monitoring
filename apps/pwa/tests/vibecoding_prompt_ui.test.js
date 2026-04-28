const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
const realtime = fs.readFileSync(path.join(root, "src/lib/realtime.ts"), "utf8");
const store = fs.readFileSync(path.join(root, "src/state/guard-store.ts"), "utf8");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("prompt palette is implemented as calm guard-console tokens", () => {
  assert.match(css, /--bg:\s*#080B0D;/, "Missing deep ink background token");
  assert.match(css, /--bg-2:\s*#11171A;/, "Missing charcoal background token");
  assert.match(css, /--panel:\s*#151C20;/, "Missing cold work-panel token");
  assert.match(css, /--sensor:\s*#38D5C8;/, "Missing sensor cyan token");
  assert.match(css, /--danger:\s*#E64B3C;/, "Missing alert red token");
  assert.match(css, /--evidence:\s*#D89A3A;/, "Missing evidence amber token");
  assert.match(css, /--safe:\s*#67B26F;/, "Missing low-saturation safe green token");
  assert.doesNotMatch(css, /#ff58c8|purple|violet/i, "React console should avoid old neon purple drift");
});

test("Vite root is a real React app entry with accessibility and product metadata", () => {
  assert.match(html, /<title>Takeout Guard 值守中枢<\/title>/, "Missing product title");
  assert.match(html, /<div id="root"><\/div>/, "Missing React root");
  assert.match(html, /href="#workspace-main"/, "Missing skip-link target");
  assert.match(html, /src="\/src\/main\.tsx"/, "Missing TypeScript React entry");
});

test("all prompt pages exist as React modules instead of legacy showcase anchors", () => {
  [
    "OverviewPage",
    "ConsolePage",
    "CasesPage",
    "TemplatesPage",
    "PlaybackPage",
    "OrdersPage",
    "SessionsPage",
    "AlertsPage",
    "DevicesPage",
    "RulesPage",
    "EvidencePage",
    "ReportsPage",
    "OpsPage",
  ].forEach((name) => {
    const source = read(`src/pages/${name}.tsx`);
    assert.match(source, new RegExp(`export function ${name}`), `Missing ${name} component`);
  });
});

test("legacy visual modules are represented in React navigation and pages", () => {
  const shell = read("src/components/Shell.tsx");
  const consolePage = read("src/pages/ConsolePage.tsx");
  const casesPage = read("src/pages/CasesPage.tsx");
  const templatesPage = read("src/pages/TemplatesPage.tsx");
  const playbackPage = read("src/pages/PlaybackPage.tsx");
  ["控制台", "案例", "模板", "动效"].forEach((label) => {
    assert.ok(shell.includes(label), `Missing migrated nav label ${label}`);
  });
  assert.match(consolePage, /workspace-status-grid|值守控制台|当前班次/, "Console page should not disappear in React");
  assert.match(casesPage, /case console|案例/, "Cases page should not disappear in React");
  assert.match(templatesPage, /deployment kit|部署模板/, "Templates page should not disappear in React");
  assert.match(playbackPage, /sensor playback|感知回放/, "Playback page should not disappear in React");
});

test("API layer centralizes existing FastAPI contract and object-storage evidence paths", () => {
  assert.match(api, /http:\/\/localhost:18000\/api\/v1/, "Default API base must match FastAPI");
  [
    "/orders",
    "/sessions",
    "/alerts",
    "/devices",
    "/rules/matches",
    "/reports/summary",
    "/reports/trends",
    "/evidence",
  ].forEach((route) => assert.ok(api.includes(route), `Missing route ${route}`));
  assert.match(api, /generateEvidence/, "Evidence generation should stay in the API layer");
  assert.match(api, /exportRuleMatchesUrl/, "Rule match CSV export should stay in the API layer");
});

test("state and realtime layers are separated from view components", () => {
  assert.match(store, /useGuardStore/, "Missing global guard store hook");
  assert.match(store, /fetchGuardSnapshot/, "Store should hydrate from API layer");
  assert.match(store, /subscribeRealtime/, "Store should subscribe through realtime layer");
  assert.match(realtime, /ws:\/\/localhost:18000\/ws\/alerts/, "Default realtime URL must match backend");
  assert.match(realtime, /subscribe:\s*\["order",\s*"alert",\s*"device",\s*"rule"\]/, "Realtime subscription topics should be explicit");
});

test("core workflows expose direct operator actions in React pages", () => {
  const orders = read("src/pages/OrdersPage.tsx");
  const alerts = read("src/pages/AlertsPage.tsx");
  const rules = read("src/pages/RulesPage.tsx");
  const reports = read("src/pages/ReportsPage.tsx");
  assert.match(orders, /armOrder/, "Orders page should wire manual arm action");
  assert.match(orders, /confirmPickup/, "Orders page should wire pickup confirmation");
  assert.match(alerts, /acknowledgeAlert/, "Alerts page should wire acknowledge action");
  assert.match(alerts, /resolveAlert/, "Alerts page should wire resolve action");
  assert.match(alerts, /falsePositiveAlert/, "Alerts page should wire false-positive action");
  assert.match(rules, /validate|preview|保存|复制规则/, "Rules page should expose DSL operations");
  assert.match(reports, /导出摘要 CSV|导出趋势 CSV|导出规则命中 CSV/, "Reports page should expose CSV exports");
});
