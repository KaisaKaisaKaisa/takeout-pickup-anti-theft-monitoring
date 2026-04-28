const assert = require("assert");
const { createWorkspaceCards } = require("../src/workspace_cards");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((err) => {
      console.error(`fail - ${name}`);
      process.exitCode = 1;
      throw err;
    });
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  add(token) {
    this.tokens.add(token);
    this.owner.className = Array.from(this.tokens).join(" ");
  }

  contains(token) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.dataset = {};
    this.className = "";
    this.classList = new FakeClassList(this);
    this.listeners = {};
    this.actionNodes = new Map();
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.actionNodes.clear();
    const matches = String(value).matchAll(/data-action="([^"]+)"/g);
    for (const match of matches) {
      this.actionNodes.set(match[1], new FakeElement("button"));
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelector(selector) {
    const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
    if (action) {
      return this.actionNodes.get(action) || null;
    }
    return null;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  async click() {
    if (this.listeners.click) {
      await this.listeners.click({ type: "click" });
    }
  }
}

function createDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

test("order card routes all order actions to callbacks", async () => {
  const calls = [];
  const cards = createWorkspaceCards({
    document: createDocument(),
    onOrderDeliver: async (order) => calls.push(["deliver", order.id]),
    onOrderArm: async (order) => calls.push(["arm", order.id]),
    onOrderConfirm: async (order) => calls.push(["confirm", order.id]),
    onOrderTimeline: async (order) => calls.push(["timeline", order.id]),
  });

  const card = cards.buildOrderCard({
    id: "order-1",
    provider: "manual",
    status: "created",
    merchant_name: "Shop",
    item_summary: "Meal",
  });

  await card.querySelector('[data-action="deliver"]').click();
  await card.querySelector('[data-action="arm"]').click();
  await card.querySelector('[data-action="confirm"]').click();
  await card.querySelector('[data-action="timeline"]').click();

  assert.strictEqual(card.dataset.id, "order-1");
  assert.deepStrictEqual(calls, [
    ["deliver", "order-1"],
    ["arm", "order-1"],
    ["confirm", "order-1"],
    ["timeline", "order-1"],
  ]);
});

test("alert card keeps selection state and routes alert actions", async () => {
  const calls = [];
  const cards = createWorkspaceCards({
    document: createDocument(),
    getActiveAlertId: () => "alert-1",
    onAlertDetail: async (alert) => calls.push(["detail", alert.id]),
    onAlertAction: async (alert, action) => calls.push([action, alert.id]),
    onAlertEvidence: async (alert) => calls.push(["evidence", alert.id]),
  });

  const card = cards.buildAlertCard({
    id: "alert-1",
    alert_type: "pickup_timeout",
    level: "high",
    status: "open",
    order_id: "order-1",
  });

  await card.querySelector('[data-action="detail"]').click();
  await card.querySelector('[data-action="ack"]').click();
  await card.querySelector('[data-action="resolve"]').click();
  await card.querySelector('[data-action="false"]').click();
  await card.querySelector('[data-action="evidence"]').click();

  assert.strictEqual(card.classList.contains("is-selected"), true);
  assert.deepStrictEqual(calls, [
    ["detail", "alert-1"],
    ["ack", "alert-1"],
    ["resolve", "alert-1"],
    ["false_positive", "alert-1"],
    ["evidence", "alert-1"],
  ]);
});

test("device card routes device selection", async () => {
  const calls = [];
  const cards = createWorkspaceCards({
    document: createDocument(),
    onDeviceSelect: async (device) => calls.push(["select", device.id]),
  });

  const card = cards.buildDeviceCard({
    id: "device-1",
    name: "Door Cam",
    status: "online",
    device_type: "camera",
  });

  await card.querySelector('[data-action="select"]').click();

  assert.strictEqual(card.dataset.id, "device-1");
  assert.deepStrictEqual(calls, [["select", "device-1"]]);
});
