const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

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
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

test("frontend stack keeps React R3F drei GSAP Tailwind and adds shadcn-style UI primitives", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies.react.startsWith("^19"), "React 19 should remain the app runtime");
  assert.ok(pkg.dependencies["@react-three/fiber"], "R3F must remain available");
  assert.ok(pkg.dependencies["@react-three/drei"], "drei must remain available");
  assert.ok(pkg.dependencies.three, "Three.js must remain available");
  assert.ok(pkg.dependencies.gsap, "GSAP must remain available");
  assert.ok(pkg.devDependencies.tailwindcss, "Tailwind must remain available");
  assert.ok(exists("src/components/ui/button.tsx"), "Missing shadcn-style Button primitive");
  assert.ok(exists("src/components/ui/card.tsx"), "Missing shadcn-style Card primitive");
  assert.ok(exists("src/lib/cn.ts"), "Missing className merge utility");
});

test("WebGL ambience implements the migrated amber smoke guard shader language", () => {
  const ambience = read("src/components/GuardAmbience.tsx");
  assert.match(ambience, /Canvas/, "Guard ambience should render through R3F Canvas");
  assert.match(ambience, /shaderMaterial/, "Guard ambience should use GLSL shader material");
  assert.match(ambience, /Fresnel|fresnel/, "Shader should include Fresnel edge light");
  assert.match(ambience, /subsurface|sss/, "Shader should include subsurface liquid glow");
  assert.match(ambience, /caustic/, "Shader should include caustics");
  assert.match(ambience, /chromatic/, "Shader should include chromatic aberration");
  assert.match(ambience, /#C87533|0\.784/, "Amber visual token should be present");
  assert.match(ambience, /#C9302C|0\.788/, "Cinnabar visual token should be present");
});

test("overview migrates prompt sections into operational guard modules", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  assert.match(overview, /RiskWheel/, "Flavor wheel should become a risk wheel");
  assert.match(overview, /MonitoringChain/, "Process timeline should become a monitoring chain");
  assert.match(overview, /GuardAmbience/, "Hero should use WebGL ambience");
  assert.match(overview, /订单导入|自动布防|边缘感知|告警研判|证据归档/, "Monitoring chain should preserve operational steps");
  assert.match(overview, /盗取风险|设备离线|规则命中|证据完整/, "Risk wheel should expose guard-specific sectors");
});

test("memory cursor is ink and ice themed across evidence surfaces", () => {
  const cursor = read("src/components/EvidenceCursor.tsx");
  const css = read("src/styles.css");
  assert.match(cursor, /data-mode="ink"/, "Cursor should default to ink mode");
  assert.match(cursor, /ice|冰|crystal/, "Cursor should expose an ice/crystal state for evidence targets");
  assert.match(css, /cursor:\s*none/, "Desktop custom cursor should hide the default pointer");
  assert.match(css, /mix-blend-mode|backdrop-filter/, "Cursor should carry material/refraction styling");
});
