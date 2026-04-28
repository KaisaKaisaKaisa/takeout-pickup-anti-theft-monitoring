const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("React migration uses the requested frontend stack", () => {
  assert.ok(exists("package.json"), "apps/pwa/package.json is required");
  const pkg = JSON.parse(read("package.json"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  [
    "react",
    "react-dom",
    "typescript",
    "vite",
    "tailwindcss",
    "gsap",
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "lucide-react",
  ].forEach((dep) => assert.ok(deps[dep], `Missing dependency: ${dep}`));
  assert.match(deps.react, /(?:\^|~)?19\./, "React must be pinned to version 19");
  assert.ok(pkg.scripts?.dev, "Missing dev script");
  assert.ok(pkg.scripts?.build, "Missing build script");
});

test("Vite entry mounts a TypeScript React app instead of the legacy static bundle", () => {
  assert.ok(exists("index.html"), "Vite root index.html is required");
  assert.ok(exists("src/main.tsx"), "src/main.tsx is required");
  assert.ok(exists("src/App.tsx"), "src/App.tsx is required");
  const html = read("index.html");
  const main = read("src/main.tsx");
  assert.match(html, /<div id="root"><\/div>/, "React root mount node is missing");
  assert.match(html, /src="\/src\/main\.tsx"/, "Vite should load /src/main.tsx");
  assert.match(main, /createRoot\(/, "React createRoot should mount the app");
});

test("React architecture separates API, realtime, state, visual components, and pages", () => {
  [
    "src/lib/api.ts",
    "src/lib/realtime.ts",
    "src/state/guard-store.ts",
    "src/components/SensingField.tsx",
    "src/components/EvidenceCursor.tsx",
    "src/components/Shell.tsx",
    "src/pages/OverviewPage.tsx",
    "src/pages/ConsolePage.tsx",
    "src/pages/CasesPage.tsx",
    "src/pages/TemplatesPage.tsx",
    "src/pages/PlaybackPage.tsx",
    "src/pages/OrdersPage.tsx",
    "src/pages/SessionsPage.tsx",
    "src/pages/AlertsPage.tsx",
    "src/pages/DevicesPage.tsx",
    "src/pages/RulesPage.tsx",
    "src/pages/EvidencePage.tsx",
    "src/pages/ReportsPage.tsx",
    "src/pages/OpsPage.tsx",
  ].forEach((file) => assert.ok(exists(file), `Missing ${file}`));
});

test("core navigation covers every operational page from the prompt", () => {
  const app = read("src/App.tsx");
  const shell = read("src/components/Shell.tsx");
  ["overview", "console", "cases", "templates", "playback", "orders", "sessions", "alerts", "devices", "rules", "evidence", "reports", "ops"].forEach((id) => {
    assert.match(`${app}\n${shell}`, new RegExp(`id:\\s*["']${id}["']|${id}:`), `Missing nav/page id: ${id}`);
  });
  ["mission", "gallery", "motion"].forEach((legacyId) => {
    assert.doesNotMatch(
      `${app}\n${shell}`,
      new RegExp(`id:\\s*["']${legacyId}["']|["']${legacyId}["']\\s*:`),
      `Legacy showcase id should not drive React nav: ${legacyId}`,
    );
  });
});

test("API and realtime layers preserve the FastAPI contract", () => {
  const api = read("src/lib/api.ts");
  const realtime = read("src/lib/realtime.ts");
  [
    "/orders",
    "/alerts",
    "/devices",
    "/sessions",
    "/rules/matches",
    "/reports/summary",
    "/reports/trends",
    "/evidence",
  ].forEach((route) => assert.ok(api.includes(route), `API layer missing ${route}`));
  assert.match(api, /http:\/\/localhost:18000\/api\/v1/, "Default REST base should match backend");
  assert.match(realtime, /ws:\/\/localhost:18000\/ws\/alerts/, "Default WebSocket URL should match backend");
});

test("React shell code-splits operational pages and defers the Three radar scene", () => {
  const app = read("src/App.tsx");
  const overview = read("src/pages/OverviewPage.tsx");
  const sensing = read("src/components/SensingField.tsx");
  const viteConfig = read("vite.config.ts");

  assert.match(app, /\blazy\(/, "App should lazy-load page modules");
  assert.match(app, /\bSuspense\b/, "App should wrap lazy pages in Suspense");
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
  ].forEach((component) => {
    assert.doesNotMatch(app, new RegExp(`import\\s+\\{\\s*${component}\\s*\\}`), `${component} should not be statically imported by App`);
  });

  assert.match(overview, /\blazy\(\s*\(\)\s*=>\s*import\(["']\.\.\/components\/SensingField["']\)/, "Overview should lazy-load the Three radar scene");
  assert.match(overview, /\bSuspense\b/, "Overview should render a fallback while the radar scene chunk loads");
  assert.doesNotMatch(overview, /import\s+\{\s*SensingField\s*\}/, "Overview should not statically import SensingField");
  assert.doesNotMatch(sensing, /@react-three\/drei/, "Radar scene should not pull drei into the visualization chunk unless needed");
  assert.doesNotMatch(sensing, /import\s+\*\s+as\s+THREE/, "Radar scene should not namespace-import all of three");
  assert.match(viteConfig, /rolldownOptions/, "Vite should configure Rolldown chunking explicitly");
  assert.match(viteConfig, /codeSplitting/, "Vite should split React, R3F, and Three vendor chunks");
});

test("legacy showcase sections are migrated into React pages", () => {
  const shell = read("src/components/Shell.tsx");
  const overview = read("src/pages/OverviewPage.tsx");
  const consolePage = read("src/pages/ConsolePage.tsx");
  const casesPage = read("src/pages/CasesPage.tsx");
  const templatesPage = read("src/pages/TemplatesPage.tsx");
  const playbackPage = read("src/pages/PlaybackPage.tsx");
  const app = read("src/App.tsx");

  ["外卖防盗监控", "控制台", "案例", "模板", "动效", "文档", "启动防护"].forEach((label) => {
    assert.ok(`${shell}\n${overview}`.includes(label), `Missing top navigation or hero label: ${label}`);
  });
  assert.match(consolePage, /值守控制台|当前班次|订单布防/, "Console page should carry the old command-center content");
  assert.match(casesPage, /案例|送达布防|规则命中|证据归档/, "Cases page should carry scenario review content");
  assert.match(templatesPage, /部署模板|点位拓扑|默认规则|处置动作/, "Templates page should carry deployment template content");
  assert.match(playbackPage, /感知回放|事件时间线|传感波形|证据轨迹/, "Playback page should carry sensor playback content");
  assert.doesNotMatch(app, /src\/index\.html|app\.js/, "React migration must not embed the legacy static bundle");
});

test("monitoring visual system includes semantic radar and evidence cursor", () => {
  const sensing = read("src/components/SensingField.tsx");
  const cursor = read("src/components/EvidenceCursor.tsx");
  const styles = read("src/styles.css");
  assert.match(sensing, /@react-three\/fiber/, "SensingField should use R3F");
  assert.match(sensing, /shaderMaterial|fragmentShader|Canvas/, "SensingField should render a shader-backed radar scene");
  assert.match(cursor, /证据光锥|evidence-cursor|pointer/, "Evidence cursor interaction is missing");
  ["#080B0D", "#11171A", "#151C20", "#38D5C8", "#E64B3C", "#D89A3A", "#67B26F"].forEach((token) => {
    assert.ok(styles.includes(token), `Missing prompt color token ${token}`);
  });
});
