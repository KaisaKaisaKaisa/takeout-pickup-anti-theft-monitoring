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

test("hero right side includes a refined 3D evidence vault scene", () => {
  assert.ok(exists("src/components/EvidenceVaultScene.tsx"), "Missing 3D evidence vault scene");
  const scene = read("src/components/EvidenceVaultScene.tsx");
  const overview = read("src/pages/OverviewPage.tsx");
  assert.match(scene, /Canvas/, "Evidence vault should render through R3F Canvas");
  assert.match(scene, /MeshTransmissionMaterial|shaderMaterial/, "Evidence vault should use glass or shader material");
  assert.match(scene, /Float|useFrame/, "Evidence vault should have restrained 3D motion");
  assert.match(scene, /bubble|气泡|bubbles/, "Evidence vault should include rising bubble details");
  assert.match(scene, /scroll|inertia|惯性|impulse/, "Evidence vault should react to scroll inertia");
  assert.match(overview, /EvidenceVaultScene/, "Overview hero should mount the 3D evidence vault");
});

test("risk wheel exposes hover-driven smoke and sector narrative states", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const css = read("src/styles.css");
  assert.match(overview, /useState/, "Risk wheel should track active sector state");
  assert.match(overview, /onMouseEnter|onPointerEnter/, "Risk wheel sectors should react to hover");
  assert.match(overview, /activeRisk|activeSector/, "Risk wheel should expose active sector copy");
  assert.match(overview, /烟雾|smoke/, "Risk wheel should keep the prompt's smoke interaction language");
  assert.match(css, /data-risk-tone|risk-copy-active/, "CSS should style active risk tone and copy");
  assert.match(css, /wheelCondense|condense/, "Wheel should include a shader-to-wheel transition cue");
});

test("custody chain carries black-and-white process imagery language", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const css = read("src/styles.css");
  assert.match(overview, /chain-photo|黑白|monochrome/, "Monitoring chain should render monochrome process plates");
  assert.match(css, /chain-photo/, "Missing chain photo styling");
  assert.match(css, /grayscale|filter:\s*contrast/, "Process plates should look black-and-white, not flat cards");
  assert.match(css, /clip-path|reveal|mask-image/, "Process visuals should have a left-to-right reveal or mask detail");
});
