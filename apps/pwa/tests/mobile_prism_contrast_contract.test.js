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

test("mobile gate and pickup pages keep the native cursor visible", () => {
  const css = read("src/styles.css");
  assert.match(css, /Mobile gate\/pickup contrast guard/, "Missing explicit mobile contrast guard");
  assert.match(css, /\.mobile-prism-shell,\s*\.mobile-prism-shell \*/s, "Mobile standalone pages should override global cursor rules");
  assert.match(css, /cursor:\s*auto;/, "Mobile standalone pages should restore the native cursor");
  assert.match(css, /\.mobile-prism-shell button[\s\S]*cursor:\s*pointer;/, "Mobile standalone buttons should show a pointer cursor");
});

test("mobile gate and pickup pages use a dimmer prism surface", () => {
  const css = read("src/styles.css");
  assert.match(css, /#e8edf3 0%, #dfe7ef 48%, #cfdbe7 100%/, "Standalone background should be toned down from pure white");
  assert.match(css, /rgba\(248, 250, 252, 0\.82\)/, "Glass panels should use a dimmer surface instead of bright white");
  assert.match(css, /0 16px 34px rgba\(42, 54, 72, 0\.22\)/, "Hover states should gain visible contrast on light surfaces");
});
