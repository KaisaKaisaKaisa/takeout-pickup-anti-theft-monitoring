const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
const rulesJs = fs.readFileSync(path.join(__dirname, "../src/rules.js"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

function getSection(id) {
  const pattern = new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`, "i");
  const match = html.match(pattern);
  assert.ok(match, `Missing section: ${id}`);
  return match[1];
}

function extractBalancedDiv(source, marker) {
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `Missing marker: ${marker}`);

  const tokenPattern = /<div\b[^>]*>|<\/div>/gi;
  tokenPattern.lastIndex = start;

  let depth = 0;
  let end = -1;

  for (let match = tokenPattern.exec(source); match; match = tokenPattern.exec(source)) {
    const token = match[0];
    if (token.startsWith("</div")) {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      end = tokenPattern.lastIndex;
      break;
    }
  }

  assert.notStrictEqual(end, -1, `Unable to extract div for marker: ${marker}`);
  return {
    end,
    content: source.slice(start, end),
  };
}

test("target panels keep a panel-decor overlay", () => {
  const panelIds = [
    "overview",
    "console",
    "mission",
    "gallery",
    "motion",
    "workflow",
    "reports",
    "ops",
    "rules",
    "orders",
    "alerts",
    "alert-detail",
    "devices",
    "rule-matches",
  ];

  panelIds.forEach((id) => {
    const section = getSection(id);
    assert.ok(section.includes('class="panel-decor"'), `Section ${id} is missing panel-decor`);
  });
});

test("hero exposes brand-stage hierarchy and proof strip", () => {
  const hero = getSection("overview");
  assert.ok(hero.includes('class="hero-status"'), "Hero should include a brand status group");
  assert.ok(hero.includes('class="hero-title-group"'), "Hero should include a dedicated title group");
  assert.ok(hero.includes('class="hero-proof'), "Hero should include a proof strip container");
  assert.ok(hero.includes('id="hero-sessions"'), "Hero proof strip must preserve hero-sessions");
  assert.ok(hero.includes('id="hero-alerts"'), "Hero proof strip must preserve hero-alerts");
  assert.ok(hero.includes('id="hero-devices"'), "Hero proof strip must preserve hero-devices");
});

test("content sections expose distinct showcase and command roles", () => {
  const showcaseIds = ["mission", "gallery", "motion", "workflow"];
  const commandIds = ["console", "reports", "ops", "rules", "orders", "alerts", "alert-detail", "devices", "rule-matches"];

  showcaseIds.forEach((id) => {
    const section = getSection(id);
    assert.ok(section.includes('section-role section-role-showcase'), `Section ${id} should expose showcase role`);
  });

  commandIds.forEach((id) => {
    const section = getSection(id);
    assert.ok(section.includes('section-role section-role-command'), `Section ${id} should expose command role`);
  });
});

test("reports trend grid keeps all six trend cards inside the grid", () => {
  const reports = getSection("reports");
  const marker = '<div class="trend-grid">';
  const grid = extractBalancedDiv(reports, marker);
  const cardsInGrid = (grid.content.match(/<div class="trend-card">/g) || []).length;
  const legendIndex = reports.indexOf('<div class="trend-legend">');

  assert.strictEqual(cardsInGrid, 6, `Expected 6 trend cards inside trend-grid, found ${cardsInGrid}`);
  assert.notStrictEqual(legendIndex, -1, "Missing trend legend");

  const strayCards = (reports.slice(grid.end, legendIndex).match(/<div class="trend-card">/g) || []).length;
  assert.strictEqual(strayCards, 0, `Expected no stray trend cards before trend legend, found ${strayCards}`);
});

test("summary metrics use monospaced numeric styling", () => {
  const summaryStrong = css.match(/\.summary-card strong\s*\{([\s\S]*?)\}/);
  assert.ok(summaryStrong, "Missing .summary-card strong declaration");
  assert.match(summaryStrong[1], /font-family:\s*"IBM Plex Mono",\s*monospace;/, "Expected IBM Plex Mono on summary metrics");
  assert.match(summaryStrong[1], /letter-spacing:\s*0\.06em;/, "Expected tighter tracking on summary metrics");
});

test("interaction layers keep differentiated showcase and command feedback", () => {
  assert.match(css, /\.section-role-command\s+span:first-child\s*\{[\s\S]*box-shadow:/, "Command role chip should include glow feedback");
  assert.match(css, /\.case-card:hover\s*\{[\s\S]*0 18px 34px rgba\(2, 6, 18, 0\.28\), 0 0 18px rgba\(77, 255, 227, 0\.1\)/, "Showcase card hover should stay restrained");
  assert.match(css, /\.panel:hover,[\s\S]*0 0 38px rgba\(83,255,228,0\.45\)/, "System panel hover should stay stronger than showcase hover");
  assert.match(css, /\.hero-status,[\s\S]*animation:\s*fadeUp 0\.8s ease both;/, "Hero staggered entrance should remain configured");
  assert.match(css, /\.nav a\s*\{[\s\S]*transition:\s*color 0\.25s ease, background 0\.25s ease, box-shadow 0\.25s ease;/, "Navigation should participate in refined transitions");
});

test("filters, toggles, and pills keep a stronger active state language", () => {
  assert.match(
    css,
    /\.filter-btn\.is-active\s*\{[\s\S]*background:\s*linear-gradient\(120deg,\s*rgba\(83,\s*255,\s*228,\s*0\.18\),\s*rgba\(77,\s*168,\s*255,\s*0\.12\)\);/,
    "Filter buttons should gain a lit active background",
  );
  assert.match(
    css,
    /\.toggle-btn\.is-active\s*\{[\s\S]*background:\s*linear-gradient\(120deg,\s*rgba\(83,\s*255,\s*228,\s*0\.16\),\s*rgba\(255,\s*88,\s*200,\s*0\.1\)\);/,
    "Toggle buttons should gain a differentiated active background",
  );
  assert.match(
    css,
    /\.pill\s*\{[\s\S]*background:\s*linear-gradient\(120deg,\s*rgba\(7,\s*14,\s*28,\s*0\.92\),\s*rgba\(10,\s*18,\s*34,\s*0\.76\)\);/,
    "Pills should use a branded surface instead of a flat fill",
  );
});

test("micro components share a more unified control language", () => {
  assert.match(
    css,
    /button\s*\{[\s\S]*letter-spacing:\s*0\.04em;[\s\S]*text-transform:\s*uppercase;/,
    "Buttons should adopt a clearer command-control typography rhythm",
  );
  assert.match(
    css,
    /\.primary\s*\{[\s\S]*box-shadow:\s*0 0 22px rgba\(83,\s*255,\s*228,\s*0\.28\),\s*0 14px 28px rgba\(5,\s*11,\s*24,\s*0\.24\);/,
    "Primary controls should gain a shared elevated action shadow",
  );
  assert.match(
    css,
    /\.ghost\s*\{[\s\S]*background:\s*linear-gradient\(160deg,\s*rgba\(8,\s*14,\s*26,\s*0\.94\),\s*rgba\(7,\s*12,\s*22,\s*0\.8\)\);/,
    "Ghost controls should share the same layered control surface language",
  );
  assert.match(
    css,
    /\.pill,\s*\.chip\s*\{[\s\S]*box-shadow:\s*0 0 14px rgba\(83,\s*255,\s*228,\s*0\.18\),\s*inset 0 0 0 1px rgba\(255,\s*255,\s*255,\s*0\.03\);/,
    "Pills and chips should share a unified inset-plus-glow control treatment",
  );
  assert.match(
    css,
    /\.filter-btn,\s*\.toggle-btn\s*\{[\s\S]*min-height:\s*38px;/,
    "Filter and toggle controls should align to a shared compact control height",
  );
});

test("reports and workflow sections keep command-depth and scroll cadence styling", () => {
  assert.match(
    css,
    /\.summary-card::before\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(83,\s*255,\s*228,\s*0\.22\),\s*transparent\);/,
    "Summary cards should include a vertical command accent",
  );
  assert.match(
    css,
    /\.trend-card::before\s*\{[\s\S]*repeating-linear-gradient\(/,
    "Trend cards should include a richer data-surface texture",
  );
  assert.match(
    css,
    /\.workflow-step::before\s*\{[\s\S]*linear-gradient\(135deg,\s*rgba\(83,\s*255,\s*228,\s*0\.16\),\s*transparent 58%\);/,
    "Workflow steps should express stronger chain guidance",
  );
  assert.match(
    css,
    /#console\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.02s;/,
    "Console section should enter slightly ahead of secondary sections",
  );
  assert.match(
    css,
    /#reports\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.06s;/,
    "Reports section should keep an earlier reveal priority",
  );
  assert.match(
    css,
    /#rules\[data-reveal\],\s*#ops\[data-reveal\],\s*#orders\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.1s;/,
    "Operational sections should keep a grouped reveal cadence",
  );
});

test("command deck sections expose distinct data-core and cabinet-shell markers", () => {
  const dataCoreIds = ["reports", "rules", "rule-matches"];
  const cabinetIds = ["ops", "alerts", "alert-detail", "devices"];

  dataCoreIds.forEach((id) => {
    const section = getSection(id);
    assert.ok(section.includes("command-shell command-shell-data"), `Section ${id} should expose data-core shell`);
  });

  cabinetIds.forEach((id) => {
    const section = getSection(id);
    assert.ok(section.includes("command-shell command-shell-cabinet"), `Section ${id} should expose cabinet shell`);
  });
});

test("showcase and command zones expose stronger hierarchy markers", () => {
  const mission = getSection("mission");
  const gallery = getSection("gallery");
  const motion = getSection("motion");
  const workflow = getSection("workflow");
  const reports = getSection("reports");
  const ops = getSection("ops");

  assert.ok(mission.includes("showcase-suite"), "Mission should expose a showcase suite wrapper");
  assert.ok(gallery.includes("showcase-suite"), "Gallery should expose a showcase suite wrapper");
  assert.ok(motion.includes("showcase-suite"), "Motion should expose a showcase suite wrapper");
  assert.ok(workflow.includes("showcase-suite"), "Workflow should expose a showcase suite wrapper");
  assert.ok(reports.includes("command-center-panel"), "Reports should expose a dedicated command-center marker");
  assert.ok(ops.includes("command-center-panel"), "Ops should expose a dedicated command-center marker");
});

test("mid-page styling differentiates showcase restraint from command-center emphasis", () => {
  assert.match(
    css,
    /\.showcase-suite\s*\{[\s\S]*border:\s*1px solid rgba\(112,\s*152,\s*255,\s*0\.08\);/,
    "Showcase suite wrapper should remain subtle and low-pressure",
  );
  assert.match(
    css,
    /\.command-center-panel\s*\{[\s\S]*box-shadow:\s*0 28px 56px rgba\(2,\s*6,\s*18,\s*0\.34\);/,
    "Command center panels should gain a stronger operational shell",
  );
  assert.match(
    css,
    /\.summary-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
    "Summary grid should become a denser three-column data deck on desktop",
  );
  assert.match(
    css,
    /\.summary-card\s*\{[\s\S]*padding:\s*18px 18px 18px 22px;/,
    "Summary cards should gain a more substantial command-card padding profile",
  );
  assert.match(
    css,
    /\.report-actions\s*\{[\s\S]*border-radius:\s*18px;[\s\S]*background:\s*linear-gradient\(160deg,\s*rgba\(7,\s*12,\s*24,\s*0\.82\),\s*rgba\(8,\s*12,\s*22,\s*0\.68\)\);/,
    "Report actions should become a grouped command shelf",
  );
  assert.match(
    css,
    /\.case-card\s*\{[\s\S]*box-shadow:\s*0 14px 28px rgba\(2,\s*6,\s*18,\s*0\.22\);/,
    "Showcase cards should remain visually calmer than command cards",
  );
});

test("data-core and cabinet shells keep differentiated styling and module rhythm", () => {
  assert.match(
    css,
    /\.command-shell-data\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(83,\s*255,\s*228,\s*0\.08\),\s*transparent 26%\);/,
    "Data-core shell should add a top-down command wash",
  );
  assert.match(
    css,
    /\.command-shell-cabinet\s*\{[\s\S]*radial-gradient\(circle at 88% 14%,\s*rgba\(255,\s*88,\s*200,\s*0\.1\),\s*transparent 26%\);/,
    "Cabinet shell should add a warmer hardware glow",
  );
  assert.match(
    css,
    /\.ops-card::before\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.08\),\s*transparent 22%\);/,
    "Ops cards should include a cabinet face highlight",
  );
  assert.match(
    css,
    /\.list-shell::before\s*\{[\s\S]*linear-gradient\(90deg,\s*rgba\(83,\s*255,\s*228,\s*0\.16\),\s*transparent 48%\);/,
    "List shell should include a slot-like internal rail",
  );
  assert.match(
    css,
    /\.command-toolbar\s*\{[\s\S]*border-radius:\s*16px;[\s\S]*box-shadow:/,
    "Toolbars should become grouped command surfaces",
  );
});

test("rules engine joins the data command axis with dedicated structure markers", () => {
  assert.match(
    rulesJs,
    /class="command-shell command-shell-data rules-command-core"/,
    "Rules engine should expose a dedicated data-core shell",
  );
  assert.match(
    rulesJs,
    /class="rule-grid rules-command-grid"/,
    "Rules engine grid should expose command-grid semantics",
  );
  assert.match(
    rulesJs,
    /class="rule-card rule-card-wide rule-card-editor"/,
    "Rule editor card should be marked as the command-axis focal card",
  );
  assert.match(
    rulesJs,
    /class="panel-actions command-toolbar"/,
    "Rule editor actions should use the shared command toolbar surface",
  );
  assert.match(
    rulesJs,
    /class="list list-shell compact"/,
    "Rule set list should use list-shell semantics",
  );
});

test("rules command axis styling keeps a stronger focal editor and command grid rhythm", () => {
  assert.match(
    css,
    /\.rules-command-grid\s*\{[\s\S]*grid-template-columns:\s*0\.88fr 0\.92fr minmax\(0,\s*1\.44fr\);/,
    "Rules command grid should widen the editor lane",
  );
  assert.match(
    css,
    /\.rule-card-editor\s*\{[\s\S]*radial-gradient\(circle at 84% 14%,\s*rgba\(83,\s*255,\s*228,\s*0\.12\),\s*transparent 24%\);/,
    "Rule editor card should receive a brighter command-core glow",
  );
  assert.match(
    css,
    /\.rules-command-core\s+\.dsl-toolbar\s*\{[\s\S]*box-shadow:/,
    "DSL toolbar should inherit stronger command toolbar treatment inside rules core",
  );
  assert.match(
    css,
    /\.rules-command-core\s+\.list-shell\s*\{[\s\S]*padding:\s*12px 12px 14px;/,
    "Rules lists should become tighter slot-like data rails",
  );
});

test("lower command deck styling strengthens heads, toolbars, and status surfaces", () => {
  assert.match(
    css,
    /\.audit-chain-panel\s+\.panel-head\s*\{[\s\S]*padding:\s*12px 14px 0;/,
    "Audit chain panel heads should gain a more deliberate command header frame",
  );
  assert.match(
    css,
    /\.audit-chain-panel\s+\.panel-head h2\s*\{[\s\S]*letter-spacing:\s*0\.08em;/,
    "Audit chain headings should read more like command module titles",
  );
  assert.match(
    css,
    /\.audit-chain-panel\s+\.command-toolbar\s*\{[\s\S]*background:\s*linear-gradient\(165deg,\s*rgba\(7,\s*12,\s*22,\s*0\.92\),\s*rgba\(5,\s*9,\s*18,\s*0\.8\)\);/,
    "Audit command toolbars should get a more operational grouped surface",
  );
  assert.match(
    css,
    /\.inline-check\s*\{[\s\S]*border:\s*1px solid rgba\(112,\s*152,\s*255,\s*0\.16\);/,
    "Inline checks should become clearer status toggles",
  );
  assert.match(
    css,
    /\.audit-status-chip\s*\{[\s\S]*letter-spacing:\s*0\.14em;/,
    "Audit status chips should gain a stronger command-chip rhythm",
  );
  assert.match(
    css,
    /\.support-bay-panel\s+\.command-shell-cabinet\s*\{[\s\S]*border:\s*1px solid rgba\(112,\s*152,\s*255,\s*0\.14\);/,
    "Support bay shell should be framed like a calmer hardware support console",
  );
});

test("audit chain sections expose dedicated storyline markers", () => {
  assert.ok(
    html.includes('class="audit-chain-layout"'),
    "Audit chain should introduce a dedicated layout wrapper",
  );

  const matches = getSection("rule-matches");
  const alerts = getSection("alerts");
  const detail = getSection("alert-detail");
  const devices = getSection("devices");

  assert.ok(
    matches.includes("audit-chain-panel audit-chain-origin"),
    "Rule matches should be marked as the audit-chain origin",
  );
  assert.ok(
    alerts.includes("audit-chain-panel alert-matrix-panel"),
    "Alerts should be marked as the alert matrix stage",
  );
  assert.ok(
    detail.includes("audit-chain-panel evidence-bay-panel"),
    "Alert detail should be marked as the evidence bay stage",
  );
  assert.ok(
    devices.includes("support-bay-panel"),
    "Devices should be marked as the supporting bay rather than the main chain",
  );
});

test("audit chain styling keeps dedicated layout, shell language, and reveal cadence", () => {
  assert.match(
    css,
    /\.audit-chain-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.08fr\)\s+minmax\(320px,\s*0\.92fr\);/,
    "Audit chain layout should create an asymmetric command grid",
  );
  assert.match(
    css,
    /\.audit-chain-origin\s+\.list-shell::before\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(83,\s*255,\s*228,\s*0\.22\),\s*transparent 62%\);/,
    "Rule matches should gain a vertical audit rail",
  );
  assert.match(
    css,
    /\.alert-matrix-panel\s+\.command-shell-cabinet\s*\{[\s\S]*radial-gradient\(circle at 14% 16%,\s*rgba\(255,\s*88,\s*200,\s*0\.12\),\s*transparent 28%\);/,
    "Alerts should gain a dedicated alert-matrix shell",
  );
  assert.match(
    css,
    /\.evidence-bay-panel\s+\.command-shell-cabinet\s*\{[\s\S]*linear-gradient\(160deg,\s*rgba\(11,\s*18,\s*35,\s*0\.96\),\s*rgba\(6,\s*10,\s*20,\s*0\.94\)\);/,
    "Alert detail should gain a brighter evidence-bay shell",
  );
  assert.match(
    css,
    /#rule-matches\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.12s;/,
    "Rule matches should reveal ahead of the rest of the audit chain",
  );
  assert.match(
    css,
    /#alerts\[data-reveal\],\s*#alert-detail\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.16s;/,
    "Alert stages should reveal together after rule matches",
  );
  assert.match(
    css,
    /#devices\[data-reveal\]\s*\{[\s\S]*transition-delay:\s*0\.2s;/,
    "Support devices should reveal after the main audit chain",
  );
});

test("audit chain card templates expose richer card-level structure markers", () => {
  assert.match(
    appJs,
    /li\.className = "card audit-card support-node-card";/,
    "Device cards should expose support-node semantics",
  );
  assert.match(
    appJs,
    /li\.className = "card audit-card rule-match-card";/,
    "Rule match cards should expose audit-card semantics",
  );
  assert.match(
    appJs,
    /li\.className = "card audit-card alert-event-card";/,
    "Alert cards should expose alert-event semantics",
  );
  assert.match(
    appJs,
    /class="audit-card-head"/,
    "Audit cards should render a dedicated card head",
  );
  assert.match(
    appJs,
    /class="audit-card-meta-grid"/,
    "Audit cards should render a metadata grid",
  );
  assert.match(
    appJs,
    /class="chip audit-status-chip/,
    "Audit cards should expose status chips",
  );
  assert.match(
    appJs,
    /class="btn-row audit-card-actions"/,
    "Audit cards should expose a dedicated action row",
  );
});

test("audit card styling keeps track, matrix, and support-node differentiation", () => {
  assert.match(
    css,
    /\.audit-card\s*\{[\s\S]*border-radius:\s*18px;[\s\S]*overflow:\s*hidden;/,
    "Audit cards should gain a stronger shell surface",
  );
  assert.match(
    css,
    /\.audit-card-head\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
    "Audit card head should balance summary and state chip",
  );
  assert.match(
    css,
    /\.audit-status-chip\s*\{[\s\S]*text-transform:\s*uppercase;/,
    "Audit status chips should read like control states",
  );
  assert.match(
    css,
    /\.rule-match-card::before\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(83,\s*255,\s*228,\s*0\.28\),\s*transparent 78%\);/,
    "Rule match cards should add a stronger audit rail",
  );
  assert.match(
    css,
    /\.alert-event-card\s+\.primary\s*\{[\s\S]*min-width:\s*88px;/,
    "Alert cards should emphasize the evidence action",
  );
  assert.match(
    css,
    /\.support-node-card\s*\{[\s\S]*border-color:\s*rgba\(112,\s*152,\s*255,\s*0\.16\);/,
    "Support node cards should remain calmer than alert cards",
  );
});

test("alert cards wire selection and evidence bay state transitions", () => {
  assert.match(
    appJs,
    /const setSelectedAlertCard = \(alertId\) => \{[\s\S]*querySelectorAll\("\.alert-event-card\.is-selected"\)\.forEach\(\(card\) => \{[\s\S]*card\.classList\.remove\("is-selected"\);[\s\S]*targetCard\.classList\.add\("is-selected"\);/,
    "App should expose a helper that keeps only one alert card selected",
  );
  assert.match(
    appJs,
    /const setEvidenceBayState = \(\{ loaded = false, evidence = false \} = \{\}\) => \{[\s\S]*detailPanel\.classList\.toggle\("is-loaded", loaded\);[\s\S]*detailPanel\.classList\.toggle\("is-evidence", evidence\);/,
    "App should expose a helper that toggles evidence bay loaded and evidence states",
  );
  assert.match(
    appJs,
    /querySelector\('\[data-action="detail"\]'\)\.addEventListener\("click", async \(\) => \{[\s\S]*setSelectedAlertCard\(alert\.id\);[\s\S]*await loadAlertDetail\(alert\.id\);/,
    "Detail action should promote the clicked alert card into selected state",
  );
  assert.match(
    appJs,
    /querySelector\('\[data-action="evidence"\]'\)\.addEventListener\("click", async \(\) => \{[\s\S]*setSelectedAlertCard\(alert\.id\);[\s\S]*await generateEvidence\(alert\.id\);/,
    "Evidence action should keep the clicked alert card selected before generating evidence",
  );
  assert.match(
    appJs,
    /loadAlertDetail = async function loadAlertDetail\(alertId\) \{[\s\S]*setEvidenceBayState\(\{ loaded: false, evidence: false \}\);[\s\S]*setEvidenceBayState\(\{ loaded: true, evidence: false \}\);[\s\S]*catch \(err\) \{[\s\S]*setEvidenceBayState\(\{ loaded: false, evidence: false \}\);/,
    "Loading alert detail should reset then activate the evidence bay loaded state",
  );
  assert.match(
    appJs,
    /generateEvidence = async function generateEvidence\(alertId\) \{[\s\S]*setEvidenceBayState\(\{ loaded: true, evidence: false \}\);[\s\S]*setEvidenceBayState\(\{ loaded: true, evidence: true \}\);[\s\S]*catch \(err\) \{[\s\S]*setEvidenceBayState\(\{ loaded: true, evidence: false \}\);/,
    "Generating evidence should upgrade the evidence bay into evidence-ready state and clear misleading status on failure",
  );
});

test("alert to evidence styling exposes selected, loaded, and evidence-ready states", () => {
  assert.match(
    css,
    /\.alert-event-card\.is-selected\s*\{[\s\S]*border-color:\s*rgba\(255,\s*143,\s*214,\s*0\.52\);/,
    "Selected alert card should gain a brighter evidence-link border",
  );
  assert.match(
    css,
    /\.evidence-bay-panel\.is-loaded\s+\.command-shell-cabinet\s*\{[\s\S]*border-color:\s*rgba\(83,\s*255,\s*228,\s*0\.24\);/,
    "Loaded evidence bay should gain a focused shell border",
  );
  assert.match(
    css,
    /\.evidence-bay-panel\.is-evidence\s+\.command-shell-cabinet\s*\{[\s\S]*border-color:\s*rgba\(255,\s*88,\s*200,\s*0\.28\);/,
    "Evidence-ready bay should gain a stronger packaged-evidence shell",
  );
});

test("hero exposes a stronger command-stage hierarchy and live proof rail", () => {
  const hero = getSection("overview");
  assert.ok(hero.includes('class="hero-command-rail"'), "Hero should expose a dedicated command rail");
  assert.ok(hero.includes('class="hero-lead"'), "Hero should expose a lead statement above the main title");
  assert.ok(hero.includes('class="hero-proof hero-proof-rail"'), "Hero proof should become a proof rail");
  assert.ok(hero.includes('hero-visual-shell'), "Hero visual should be wrapped in a dedicated shell");
  assert.ok(hero.includes('class="hero-scroll-cue"'), "Hero should expose a scroll cue");
});

test("hero and top navigation styling strengthen brand hierarchy and scroll feedback", () => {
  assert.match(
    css,
    /\.topbar\.is-scrolled\s*\{[\s\S]*box-shadow:\s*0 22px 54px rgba\(2,\s*6,\s*18,\s*0\.52\);/,
    "Topbar should gain a stronger scrolled state",
  );
  assert.match(
    css,
    /\.nav a\.is-active\s*\{[\s\S]*color:\s*rgba\(247,\s*252,\s*255,\s*0\.96\);/,
    "Primary nav should expose an active route state",
  );
  assert.match(
    css,
    /\.hero-command-rail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.16fr\)\s+minmax\(220px,\s*0\.84fr\);/,
    "Hero command rail should widen the narrative lane against the proof lane",
  );
  assert.match(
    css,
    /\.hero-proof-rail\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
    "Hero proof rail should keep a dedicated three-column trust strip",
  );
  assert.match(
    css,
    /\.hero-scroll-cue\s*\{[\s\S]*animation:\s*floatCue 2\.8s ease-in-out infinite;/,
    "Hero scroll cue should provide a branded continuous motion hint",
  );
});

test("app wires topbar scroll state and active section navigation", () => {
  assert.match(
    appJs,
    /function initScrollState\(\) \{[\s\S]*const topbar = document\.querySelector\("\.topbar"\);[\s\S]*topbar\.classList\.toggle\("is-scrolled", window\.scrollY > 18\);/,
    "App should expose a scroll-state initializer for the topbar",
  );
  assert.match(
    appJs,
    /const navLinks = Array\.from\(document\.querySelectorAll\('\.nav a\[href\^="#"\]'\)\);[\s\S]*link\.classList\.toggle\("is-active", link === activeLink\);/,
    "App should keep nav links in sync with the active section",
  );
});

test("local density styling gives command panels a calmer and more premium rhythm", () => {
  assert.match(
    css,
    /\.panel-head\s*\{[\s\S]*margin-bottom:\s*14px;[\s\S]*gap:\s*12px;/,
    "Panel heads should open up slightly to improve hierarchy scanning",
  );
  assert.match(
    css,
    /\.panel-actions\s*\{[\s\S]*gap:\s*12px;[\s\S]*row-gap:\s*10px;/,
    "Panel action rows should gain a more even command-toolbar cadence",
  );
  assert.match(
    css,
    /\.date-range\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*gap:\s*8px;[\s\S]*padding:\s*4px 6px 4px 10px;/,
    "Date ranges should become grouped control capsules instead of loose inputs",
  );
  assert.match(
    css,
    /\.form-row\s*\{[\s\S]*gap:\s*10px;[\s\S]*margin-bottom:\s*14px;/,
    "Form rows should breathe a little more between label and control",
  );
  assert.match(
    css,
    /\.workflow-grid\s*\{[\s\S]*gap:\s*20px;/,
    "Workflow steps should sit on a slightly airier narrative grid",
  );
  assert.match(
    css,
    /\.trend-bar\s*\{[\s\S]*grid-template-columns:\s*72px minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*10px;[\s\S]*padding:\s*3px 0;/,
    "Trend bars should use a cleaner three-part rhythm with more breathing room",
  );
  assert.match(
    css,
    /\.list\s*\{[\s\S]*gap:\s*12px;/,
    "Lists should gain a slightly more premium vertical rhythm",
  );
  assert.match(
    css,
    /\.card\s*\{[\s\S]*padding:\s*14px 14px 15px;[\s\S]*gap:\s*10px;/,
    "Cards should gain a calmer shell padding profile",
  );
  assert.match(
    css,
    /\.btn-row\s*\{[\s\S]*gap:\s*12px;[\s\S]*padding-top:\s*2px;/,
    "Button rows should read as deliberate action rails",
  );
  assert.match(
    css,
    /\.dsl-row\s*\{[\s\S]*gap:\s*10px;[\s\S]*align-items:\s*stretch;/,
    "Rule DSL rows should align controls with a steadier editing rhythm",
  );
  assert.match(
    css,
    /\.audit-card-meta-grid\s*\{[\s\S]*gap:\s*12px;/,
    "Audit metadata should gain a clearer two-column cadence",
  );
  assert.match(
    css,
    /\.audit-card-meta-grid\s+\.meta\s*\{[\s\S]*padding:\s*10px 12px;/,
    "Audit metadata chips should get a slightly more substantial inset",
  );
});

test("top-level showcase ctas are wired instead of remaining static buttons", () => {
  assert.match(
    html,
    /<button class="ghost" id="top-docs-btn" type="button">文档<\/button>/,
    "Topbar docs button should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="primary" id="top-guard-btn" type="button">启动防护<\/button>/,
    "Topbar guard button should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="primary" id="hero-connect-btn" type="button">立即接入<\/button>/,
    "Hero connect button should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="ghost" id="hero-demo-btn" type="button">演示模式<\/button>/,
    "Hero demo button should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="ghost" id="cases-view-all-btn" type="button">查看全部<\/button>/,
    "Case showcase CTA should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="ghost" id="templates-view-all-btn" type="button">浏览全部<\/button>/,
    "Template showcase CTA should expose an id for interaction wiring",
  );
  assert.match(
    html,
    /<button class="ghost" id="motion-assets-btn" type="button">打开素材<\/button>/,
    "Motion showcase CTA should expose an id for interaction wiring",
  );
  assert.match(
    appJs,
    /function initLandingActions\(\) \{[\s\S]*bindClick\("top-docs-btn"[\s\S]*bindClick\("hero-connect-btn"[\s\S]*bindClick\("hero-demo-btn"[\s\S]*bindClick\("cases-view-all-btn"[\s\S]*bindClick\("templates-view-all-btn"[\s\S]*bindClick\("motion-assets-btn"/,
    "App should initialize dedicated landing CTA bindings",
  );
  assert.match(
    appJs,
    /document\.addEventListener\("DOMContentLoaded", \(\) => \{[\s\S]*initLandingActions\(\);/,
    "Landing CTA bindings should be initialized on DOMContentLoaded",
  );
});

test("template gallery buttons are wired into live preview and enable actions", () => {
  assert.match(
    appJs,
    /document\.querySelectorAll\("\.template-card"\)\.forEach\(\(card,\s*index\) => \{[\s\S]*card\.querySelector\("h3"\)/,
    "Template cards should be traversed for interactive button wiring",
  );
  assert.match(
    appJs,
    /const viewButton = card\.querySelector\("button\.ghost"\);[\s\S]*const enableButton = card\.querySelector\("button\.primary"\);/,
    "Template cards should wire both view and enable buttons",
  );
  assert.match(
    appJs,
    /card\.classList\.add\("is-selected"\);[\s\S]*flashMeta\(/,
    "Template interactions should expose a visible selected state and feedback",
  );
});

test("app script stays syntactically valid so button bindings can execute", () => {
  assert.doesNotThrow(
    () => childProcess.execFileSync("node", ["--check", path.join(__dirname, "../src/app.js")], { stdio: "pipe" }),
    "app.js should parse successfully so interactive bindings can run in the browser",
  );
});
