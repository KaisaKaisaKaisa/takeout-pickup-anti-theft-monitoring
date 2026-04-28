const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/components/Shell.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "src/pages/OverviewPage.tsx"), "utf8");
const sensing = fs.readFileSync(path.join(root, "src/components/SensingField.tsx"), "utf8");
const cursor = fs.readFileSync(path.join(root, "src/components/EvidenceCursor.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("React shell replaces showcase navigation with an operating command deck", () => {
  assert.match(shell, /brand-command/, "Missing top brand command navigation");
  assert.match(shell, /guard-online/, "Missing guard link status in brand navigation");
  assert.match(shell, /启动防护/, "Brand navigation should expose the primary guard action");
  assert.match(shell, /top-status/, "Missing top status bar");
  assert.match(shell, /WebSocket:/, "Top status bar should expose realtime state");
  ["overview", "console", "cases", "templates", "playback", "orders", "sessions", "alerts", "devices", "rules", "evidence", "reports", "ops"].forEach((id) => {
    assert.match(shell, new RegExp(`id:\\s*"${id}"`), `Missing ${id} navigation item`);
  });
});

test("first screen keeps the guard-console hierarchy and proof metrics", () => {
  assert.match(overview, /外卖取餐防盗值守中枢/, "Overview should open as the live guard console");
  assert.match(overview, /当前防护|活跃会话/, "Overview should expose protection state");
  assert.match(overview, /最新订单队列/, "Overview should expose the order queue");
  assert.match(overview, /告警处理队列/, "Overview should expose the alert queue");
  assert.match(overview, /传感器事件流/, "Overview should expose the sensor event stream");
  assert.match(overview, /取餐防护地图/, "Overview should include the rack/ROI map");
});

test("semantic radar uses R3F and a shader-backed sensing plane", () => {
  assert.match(sensing, /@react-three\/fiber/, "Radar should use React Three Fiber");
  assert.match(sensing, /fragmentShader=/, "Radar should use a fragment shader");
  assert.match(sensing, /weight -318g/, "Radar overlay should carry domain-specific sensor semantics");
  assert.match(css, /\.sensing-field\s*\{[\s\S]*#080B0D;/, "Radar surface should stay in the prompt palette");
});

test("evidence cursor is implemented as the primary interaction memory point", () => {
  assert.match(cursor, /证据光锥/, "Cursor should preserve the evidence cone concept");
  assert.match(cursor, /data-danger-target/, "Cursor should react to danger targets");
  assert.match(cursor, /data-evidence-target/, "Cursor should react to evidence targets");
  assert.match(css, /\.evidence-cursor\s*\{[\s\S]*conic-gradient/, "Cursor should render a scan cone");
  assert.match(css, /\.evidence-cursor\[data-mode="danger"\]/, "Danger cursor mode is missing");
  assert.match(css, /\.evidence-cursor\[data-mode="evidence"\]/, "Evidence cursor mode is missing");
});

test("core responsive command surfaces keep dense but readable dashboard grids", () => {
  assert.match(css, /\.brand-command\s*,[\s\S]*\.side-nav\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto;/, "Desktop should keep top command navigation");
  assert.match(css, /\.metric-strip\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/, "Metrics should scan as a four-up strip");
  assert.match(css, /\.record-card,[\s\S]*\.device-card,[\s\S]*\.evidence-card\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto auto;/, "Operational records need stable grid columns");
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.record-card,[\s\S]*\.console-split,[\s\S]*\.timeline-replay-step\s*\{[\s\S]*grid-template-columns:\s*1fr;/, "Mobile should collapse records safely");
});

test("React runtime still uses GSAP for restrained command transitions", () => {
  assert.match(app, /import gsap from "gsap"/, "GSAP should be part of the migration");
  assert.match(app, /prefers-reduced-motion/, "Motion must respect reduced-motion users");
  assert.match(app, /gsap\.fromTo/, "Page changes should use a restrained GSAP entrance");
});
