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

test("secondary operating pages share the eastern workspace art system", () => {
  [
    "OrdersPage.tsx",
    "AlertsPage.tsx",
    "DevicesPage.tsx",
    "RulesPage.tsx",
    "EvidencePage.tsx",
    "ReportsPage.tsx",
    "SessionsPage.tsx",
    "OpsPage.tsx",
  ].forEach((file) => {
    const source = read(`src/pages/${file}`);
    assert.match(source, /eastern-workspace/, `${file} should opt into the shared eastern workspace shell`);
  });
});

test("secondary pages have page-specific lacquer, amber, cinnabar, and evidence motifs", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.eastern-workspace::before/, "Shared workspace should have ambient page lighting");
  assert.match(css, /--page-accent/, "Secondary pages should use semantic accent variables");
  assert.match(css, /\.alerts-page\s*{[^}]*--page-accent:\s*var\(--cinnabar\)/s, "Alerts page should use cinnabar danger tone");
  assert.match(css, /\.evidence-page[\s\S]*--page-accent:\s*var\(--gold\)/, "Evidence/report/order pages should use amber gold tone");
  assert.match(css, /backdrop-filter:\s*blur\(14px\)/, "Secondary cards should keep a lacquered glass depth system");
  assert.match(css, /repeating-linear-gradient\(90deg/, "Rule/editor surfaces should include fine process-grid craft detail");
});

test("reports, rules, and evidence pages expose durable semantic styling hooks", () => {
  const reports = read("src/pages/ReportsPage.tsx");
  const rules = read("src/pages/RulesPage.tsx");
  const evidence = read("src/pages/EvidencePage.tsx");
  const css = read("src/styles.css");

  assert.match(reports, /report-export-strip/, "Reports should have a styled export strip");
  assert.match(reports, /trend-panel/, "Reports should use refined trend panels");
  assert.match(rules, /rule-lacquer-board/, "Rules editor should have a lacquer board hook");
  assert.match(rules, /rule-hit-board/, "Rule matches should have a dedicated board hook");
  assert.match(evidence, /custody-card/, "Evidence bundles should expose custody card styling");
  assert.match(css, /\.report-export-strip/, "Missing report export strip styling");
  assert.match(css, /\.rule-lacquer-board::after/, "Missing rule wheel / lacquer styling");
  assert.match(css, /\.custody-card/, "Missing custody card styling");
  assert.match(css, /\.reports-page \.trend-bars span:nth-child\(2n\)/, "Trend bars should carry amber/cinnabar variation");
});

test("mobile composition keeps secondary operational pages from squeezing desktop layouts", () => {
  const css = read("src/styles.css");
  assert.match(css, /@media \(max-width:\s*820px\)/, "Missing mobile breakpoint");
  assert.match(css, /\.device-grid,\s*\n\s*\.evidence-grid,\s*\n\s*\.report-grid/, "Secondary grids should collapse on mobile");
  assert.match(css, /\.record-card,\s*\n\s*\.device-card,\s*\n\s*\.evidence-card/, "Record/device/evidence cards should share mobile stacking");
  assert.match(css, /\.condition-builder\s*{\s*\n\s*grid-template-columns:\s*1fr/s, "Rules condition builder should recompose on mobile");
});
