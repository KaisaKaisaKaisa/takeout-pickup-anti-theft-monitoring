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

const appJs = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");

test("style console runtime labels stay readable Chinese", () => {
  assert.match(
    appJs,
    /collapseToggle\.textContent = collapsed \? "展开" : "折叠";/,
    "Collapse toggle should use readable Chinese labels when toggled",
  );
  assert.match(
    appJs,
    /collapseToggle\.textContent = consolePanel\.classList\.contains\("is-collapsed"\) \? "展开" : "折叠";/,
    "Collapse toggle should keep readable Chinese labels on initial sync",
  );
  assert.match(
    appJs,
    /demoToggle\.textContent = document\.body\.dataset\.demoLoop === "on" \? "停止演示" : "启动演示";/,
    "Demo toggle should switch between readable start and stop labels",
  );
  assert.match(
    appJs,
    /demoPause\.textContent = "暂停";/,
    "Demo pause button should expose a readable pause label",
  );
  assert.match(
    appJs,
    /demoPause\.textContent = "继续";/,
    "Demo pause button should expose a readable resume label",
  );
  const runtimeAssignments = Array.from(
    appJs.matchAll(/(?:collapseToggle|demoToggle|demoPause)\.textContent\s*=\s*[^;]+;/g),
    (match) => match[0],
  ).join("\n");
  assert.ok(
    !/鍋滄婕旂ず|鍚姩婕旂ず|鏆傚仠|缁х画|灞曞紑|鎶樺彔/.test(runtimeAssignments),
    "Style console runtime label assignments should not contain mojibake",
  );
});
