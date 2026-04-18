const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  add(...tokens) {
    tokens.forEach((token) => this.tokens.add(token));
    this.owner.className = Array.from(this.tokens).join(" ");
  }

  remove(...tokens) {
    tokens.forEach((token) => this.tokens.delete(token));
    this.owner.className = Array.from(this.tokens).join(" ");
  }

  toggle(token) {
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      this.owner.className = Array.from(this.tokens).join(" ");
      return false;
    }
    this.tokens.add(token);
    this.owner.className = Array.from(this.tokens).join(" ");
    return true;
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.parentElement = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.textContent = "";
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.listeners = {};
    this._id = "";
    this._innerHTML = "";
  }

  set id(value) {
    this._id = value == null ? "" : String(value);
    if (this._id) {
      this.ownerDocument.elements.set(this._id, this);
    }
  }

  get id() {
    return this._id;
  }

  set innerHTML(value) {
    this._innerHTML = value == null ? "" : String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(node) {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  prepend(node) {
    node.parentElement = this;
    this.children.unshift(node);
    return node;
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    const next = this.parentElement.children.filter((child) => child !== this);
    this.parentElement.children = next;
    this.parentElement = null;
  }

  replaceWith(node) {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index === -1) {
      return;
    }
    node.parentElement = this.parentElement;
    this.parentElement.children.splice(index, 1, node);
    this.parentElement = null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  dispatchEvent(type, payload = {}) {
    (this.listeners[type] || []).forEach((handler) => handler(payload));
  }

  querySelector(selector) {
    if (selector.startsWith("[data-id=\"")) {
      const id = selector.slice(10, -2);
      return this.children.find((child) => String(child.dataset.id || "") === id) || null;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  scrollIntoView() {}

  get offsetWidth() {
    return 0;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = {};
    this.body = new FakeElement("body", this);
    this.body.dataset = {};
    this.hidden = false;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      return this.getElementById(selector.slice(1));
    }
    if (selector === ".hero-meta") {
      return this.getElementById("hero-meta");
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }
}

function createAppContext() {
  const source = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  const document = new FakeDocument();
  const list = document.createElement("ul");
  list.id = "rule-matches-list";
  document.body.appendChild(list);
  const heroMeta = document.createElement("div");
  heroMeta.id = "hero-meta";
  heroMeta.className = "hero-meta";
  document.body.appendChild(heroMeta);

  const context = {
    console,
    URL,
    Date,
    Map,
    Set,
    JSON,
    Promise,
    Math,
    Intl,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    document,
    location: { protocol: "http:", hostname: "localhost" },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    navigator: { serviceWorker: null },
    Notification: function Notification() {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: function WebSocket(url) {
      this.url = url;
      this.send = () => {};
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app.js" });
  return { context, document, list };
}

test("renderRuleMatches can render a rule match card before websocket starts", () => {
  const { context, list } = createAppContext();
  context.renderRuleMatches([
    {
      id: "match-1",
      rule_name: "Night Guard",
      event_type: "motion",
      rule_set_name: "set-a",
      suppressed: false,
      matched_at: "2026-03-19T00:00:00.000Z",
    },
  ]);

  assert.strictEqual(list.children.length, 1);
  assert.strictEqual(list.children[0].dataset.id, "match-1");
  assert.match(list.children[0].className, /rule-match-card/);
});

test("connectWebSocket initializes without synchronous exceptions", () => {
  const { context } = createAppContext();
  assert.doesNotThrow(() => {
    context.connectWebSocket();
  });
});
