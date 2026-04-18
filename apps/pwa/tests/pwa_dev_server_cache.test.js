const assert = require("assert");
const fs = require("fs");
const path = require("path");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

const html = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
const runPwa = fs.readFileSync(path.join(__dirname, "../../../scripts/run_pwa.ps1"), "utf8");

test("pwa html cache-busts primary static assets", () => {
  assert.match(
    html,
    /<link rel="stylesheet" href="\.\/styles\.css\?v=[^"]+"/,
    "Stylesheet link should include a version query to break stale browser caches",
  );
  assert.match(
    html,
    /<script src="\.\/app\.js\?v=[^"]+"><\/script>/,
    "Main app script should include a version query to break stale browser caches",
  );
});

test("service worker registration cache-busts sw.js", () => {
  assert.match(
    appJs,
    /navigator\.serviceWorker\.register\("\.\/sw\.js\?v=[^"]+"\)/,
    "Service worker registration should include a version query",
  );
});

test("pwa run script uses the custom no-cache server", () => {
  assert.match(
    runPwa,
    /serve_pwa\.py/,
    "run_pwa.ps1 should launch the dedicated UTF-8 no-cache server",
  );
});
