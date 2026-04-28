const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

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

test("reference images are migrated as Lightcore Prism tokens and soft glass surfaces", () => {
  const css = read("src/styles.css");
  ["--prism-white: #FFFFFF", "--prism-snow: #FAFAFC", "--prism-slate: #F2F4F8", "--prism-border: #E6E8EF", "--prism-ink: #0A0A0C"].forEach((token) => {
    assert.ok(css.includes(token), `Missing Lightcore neutral token ${token}`);
  });
  ["--prism-a: #FFB86B", "--prism-b: #FFE78A", "--prism-c: #7EE8FF", "--prism-d: #B388FF", "--prism-e: #FF8EDB"].forEach((token) => {
    assert.ok(css.includes(token), `Missing prism gradient stop ${token}`);
  });
  assert.match(css, /LIGHTCORE PRISM \+ iOS soft-glass control widgets/, "CSS should document the image-reference migration layer");
  assert.match(css, /--lightcore-shadow-hi/, "Soft-glass neumorphic shadow tokens should exist");
  assert.match(css, /inset 8px 8px 18px/, "Controls should use iOS-like raised inner lighting");
});

test("brand, hero, metrics, and sensing field expose the new visual language in React", () => {
  const shell = read("src/components/Shell.tsx");
  const overview = read("src/pages/OverviewPage.tsx");
  const metric = read("src/components/MetricCard.tsx");
  const sensing = read("src/components/SensingField.tsx");
  assert.match(shell, /lightcore-prism-shell/, "Shell should opt into the Lightcore Prism art layer");
  assert.match(shell, /brand-prism/, "Navigation should render a prism brand mark");
  assert.match(overview, /Lightcore Prism \/ soft glass guard console/, "Hero copy should name the migrated visual system");
  assert.match(metric, /metric-dial/, "Metric cards should expose circular control-widget dials");
  assert.match(sensing, /sensing-controls/, "Sensing scene should include iOS-control style status chips");
});

test("3D evidence vault includes a pure Three prism halo object", () => {
  const scene = read("src/components/EvidenceVaultScene.tsx");
  assert.match(scene, /function PrismHalo/, "Evidence vault should add a Three-rendered prism halo");
  assert.match(scene, /torusGeometry/, "Prism halo should use real Three geometry");
  assert.match(scene, /3D 棱镜封存舱/, "Vault caption should reflect the Lightcore Prism direction");
});
