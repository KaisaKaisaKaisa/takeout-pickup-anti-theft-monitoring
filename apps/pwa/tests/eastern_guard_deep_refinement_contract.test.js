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

test("evidence vault is now a real R3F primary object instead of a DOM glass fallback", () => {
  const scene = read("src/components/EvidenceVaultScene.tsx");
  const css = read("src/styles.css");
  assert.match(scene, /orthographic/, "Vault should render as a stable independent R3F scene");
  assert.match(scene, /preserveDrawingBuffer:\s*true/, "Vault canvas should remain visible in browser screenshots and visual QA");
  assert.match(scene, /VaultGeometryPlate/, "Vault should include a readable Three geometry primary plate");
  assert.match(scene, /ringGeometry/, "Vault should use geometric seal rings");
  assert.match(scene, /meshBasicMaterial[\s\S]*DoubleSide/, "Vault should include readable solid Three material, not only transparent glass");
  assert.match(scene, /ReadableVaultFace/, "Vault should include shader-rendered face details");
  assert.match(scene, /SealLiquid/, "Vault should keep shader-driven liquid");
  assert.match(scene, /BubbleField/, "Vault should keep 3D rising bubbles");
  assert.doesNotMatch(scene, /className="vault-object"/, "DOM foreground vault object should be removed");
  assert.doesNotMatch(scene, /vault-glass/, "DOM glass fallback should not define the primary visual");
  assert.doesNotMatch(css, /\.vault-object|\.vault-glass|\.vault-liquid|\.vault-bubbles|\.vault-base/, "CSS should not retain the old DOM vault fallback");
});

test("risk wheel active tone drives the WebGL ambience shader", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const ambience = read("src/components/GuardAmbience.tsx");
  assert.match(overview, /const \[activeRisk, setActiveRisk\]/, "Overview should own active risk state");
  assert.match(overview, /<GuardAmbience tone=\{ambienceTones\[activeRisk\]\}/, "Hero shader should receive active risk tone");
  assert.match(overview, /onActiveRiskChange=\{setActiveRisk\}/, "Risk wheel should update overview tone state");
  assert.match(ambience, /uTone/, "Shader should expose a tone uniform");
  assert.match(ambience, /toneColor/, "Shader should mix tone-specific color into ambience");
  assert.match(ambience, /danger[\s\S]*evidence[\s\S]*sensor[\s\S]*safe/, "Shader tone mapping should cover risk sectors");
});

test("custody chain uses local monochrome image assets instead of CSS-only plates", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const css = read("src/styles.css");
  ["import", "arm", "sense", "review", "archive"].forEach((name) => {
    assert.ok(exists(`public/assets/custody-${name}.png`), `Missing custody-${name}.png`);
    const bytes = fs.statSync(path.join(root, `public/assets/custody-${name}.png`)).size;
    assert.ok(bytes > 120000, `custody-${name}.png should be a composed raster asset, not a tiny CSS-like placeholder`);
  });
  assert.match(overview, /<img[\s\S]*custody-\$\{step\.plate\}\.png/, "Monitoring chain should render local custody images");
  assert.match(css, /object-fit:\s*cover/, "Custody assets should be cropped as image plates");
  assert.match(css, /filter:\s*grayscale\(1\) contrast/, "Custody assets should keep monochrome evidence treatment");
});

test("case template and playback pages are upgraded into the same eastern workspace system", () => {
  ["CasesPage.tsx", "TemplatesPage.tsx", "PlaybackPage.tsx"].forEach((file) => {
    const source = read(`src/pages/${file}`);
    assert.match(source, /eastern-workspace/, `${file} should use the shared eastern workspace shell`);
    assert.match(source, /page-title/, `${file} should use the refined page title rhythm`);
  });
  const css = read("src/styles.css");
  assert.match(css, /\.eastern-workspace \.case-card/, "Case cards should receive refined workspace styling");
  assert.match(css, /\.eastern-workspace \.template-preview::before/, "Template previews should have crafted topology framing");
  assert.match(css, /\.playback-page \.waveform/, "Playback waveform should be visually upgraded");
  assert.match(css, /\.playback-page \.evidence-rail span/, "Playback evidence rail should have refined custody styling");
});
