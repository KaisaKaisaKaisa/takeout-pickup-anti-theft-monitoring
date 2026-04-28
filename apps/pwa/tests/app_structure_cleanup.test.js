const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
const realtimeClientJs = fs.readFileSync(path.join(__dirname, "../src/realtime_client.js"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

function countMatches(pattern) {
  return (appJs.match(pattern) || []).length;
}

function countMatchesIn(source, pattern) {
  return (source.match(pattern) || []).length;
}

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = appJs.indexOf(marker);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const braceStart = appJs.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < appJs.length; index += 1) {
    const ch = appJs[index];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return appJs.slice(braceStart + 1, index);
      }
    }
  }
  throw new Error(`Could not parse body for ${name}`);
}

test("runtime has a single DOMContentLoaded boot entry", () => {
  assert.strictEqual(countMatches(/DOMContentLoaded/g), 1);
});

test("source directory does not contain stale generated fragments", () => {
  const staleFiles = fs
    .readdirSync(path.join(__dirname, "../src"))
    .filter((name) => /(?:excerpt|raw|normalized)|\.txt$/i.test(name));
  assert.deepStrictEqual(staleFiles, []);
});

test("core card builders are declared once at top level", () => {
  [
    "buildOrderCard",
    "buildAlertCard",
    "buildDeviceCard",
    "buildRuleMatchCard",
  ].forEach((name) => {
    assert.strictEqual(
      countMatches(new RegExp(`(^|\\n)function ${name}\\(`, "g")),
      1,
      `${name} should have one declared implementation`,
    );
    assert.strictEqual(
      countMatches(new RegExp(`(^|\\n)\\s*(const|let|var)\\s+${name}\\s*=`, "g")),
      0,
      `${name} should not be reassigned inside patch blocks`,
    );
  });
});

test("renderers and realtime updates share card builders", () => {
  assert.match(functionBody("renderOrders"), /renderList\(\s*listEl,\s*orders,\s*buildOrderCard,\s*"暂无订单"\s*\)/);
  assert.match(functionBody("renderAlerts"), /renderList\(\s*listEl,\s*alerts,\s*buildAlertCard,\s*"暂无告警"\s*\)/);
  assert.match(functionBody("renderDevices"), /renderList\(\s*listEl,\s*devices,\s*buildDeviceCard,\s*"暂无设备"\s*\)/);
  const websocketBody = functionBody("connectWebSocket");
  assert.doesNotMatch(websocketBody, /const build(?:Order|Alert|Device|RuleMatch)Card\s*=/);
  assert.doesNotMatch(websocketBody, /let buildAlertCard\s*=/);
  assert.match(websocketBody, /buildOrderCard/);
  assert.match(websocketBody, /buildAlertCard/);
  assert.match(websocketBody, /buildDeviceCard/);
  assert.match(websocketBody, /buildRuleMatchCard/);
});

test("websocket reconnects do not stack visibility listeners", () => {
  const websocketBody = functionBody("connectWebSocket");
  assert.doesNotMatch(websocketBody, /addEventListener\(\s*["']visibilitychange["']/);
  assert.strictEqual(countMatches(/addEventListener\(\s*["']visibilitychange["']/g), 0);
  assert.strictEqual(countMatchesIn(realtimeClientJs, /addEventListener\(\s*["']visibilitychange["']/g), 1);
  assert.match(realtimeClientJs, /visibilityBound/);
});

test("global event binding is idempotent", () => {
  assert.match(appJs, /let\s+appEventsBound\s*=\s*false/);
  assert.match(functionBody("bindEvents"), /if\s*\(\s*appEventsBound\s*\)\s*{\s*return;\s*}/);
  assert.match(functionBody("bindEvents"), /appEventsBound\s*=\s*true/);
});

test("websocket runtime is delegated to realtime client module", () => {
  const websocketBody = functionBody("connectWebSocket");
  assert.match(websocketBody, /appRealtimeClient\.createRealtimeClient/);
  assert.match(websocketBody, /\.connect\(\)/);
  assert.doesNotMatch(websocketBody, /ws\.onmessage\s*=/);
  assert.doesNotMatch(websocketBody, /mergeListItem/);
  ["markWebSocketRefresh", "flushWebSocketPendingRefresh", "bindWebSocketVisibilityRefresh"].forEach((name) => {
    assert.strictEqual(appJs.includes(`function ${name}(`), false, `${name} should live in realtime_client`);
  });
});
