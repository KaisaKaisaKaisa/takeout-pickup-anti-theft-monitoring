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
const activeJs = appJs.slice(0, appJs.indexOf("/*"));

test("active app copy avoids known mojibake fragments", () => {
  const badFragments = [
    "鏆傛棤",
    "妯℃嫙",
    "鍚姩",
    "纭",
    "鍔犺浇",
    "璇锋",
    "瑙勫垯",
    "鍙栬瘉",
    "璁㈠崟",
    "璁惧",
    "鍛婅",
    "閫夋嫨",
    "缁撴",
    "璇姤",
    "绛夊緟",
    "鏍￠獙",
    "璇勪及",
    "鎺ㄩ€",
    "褰撳墠",
    "浠呯",
    "鏇存柊",
    "????",
  ];

  for (const fragment of badFragments) {
    assert.ok(
      !activeJs.includes(fragment),
      `Active app copy should not include mojibake fragment: ${fragment}`,
    );
  }
});
