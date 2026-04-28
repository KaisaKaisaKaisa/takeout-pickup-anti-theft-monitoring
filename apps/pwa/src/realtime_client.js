(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.realtimeClient = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function createDefaultPending() {
    return { orders: false, alerts: false, devices: false, reports: false };
  }

  function parseEnvelope(rawMessage, config) {
    const router = config.realtimeRouter || config.root?.realtimeRouter || root.realtimeRouter;
    const data = rawMessage && typeof rawMessage === "object" && "data" in rawMessage
      ? rawMessage.data
      : rawMessage;
    if (router && typeof router.parseRealtimeEnvelope === "function") {
      return router.parseRealtimeEnvelope(data);
    }
    if (typeof data === "string") {
      try {
        const envelope = JSON.parse(data);
        return parseEnvelope(envelope, config);
      } catch (_err) {
        return { eventType: data, payload: {}, entityType: "", entity: null, kind: "" };
      }
    }
    const envelope = data && typeof data === "object" ? data : {};
    const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
    const eventType = typeof envelope.type === "string" ? envelope.type : "";
    const entityType = payload.entity_type || payload.entityType || "";
    const entity = payload.entity || payload.order || payload.alert || payload.device || payload.match || null;
    const kind = entityType || (payload.order && "order") || (payload.alert && "alert") ||
      (payload.device && "device") || (payload.match && "rule_match") || "";
    return { eventType, payload, entityType, entity, kind };
  }

  function resolveWsUrl(config) {
    if (typeof config.wsUrl === "string" && config.wsUrl) {
      return config.wsUrl;
    }
    const apiRoot = config.apiRoot || "";
    try {
      const parsed = new URL(apiRoot);
      const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${parsed.host}/ws/alerts`;
    } catch (_err) {
      const locationRef = config.location || root.location || {};
      const protocol = locationRef.protocol === "https:" ? "wss" : "ws";
      const hostname = locationRef.hostname || "localhost";
      return `${protocol}://${hostname}:18000/ws/alerts`;
    }
  }

  function createRealtimeClient(config = {}) {
    const doc = config.document || root.document;
    const rootRef = config.root || root;
    const throttleFactory = config.createThrottle ||
      rootRef.wsThrottle?.createThrottle ||
      ((_wait, handler) => handler);
    let pending = config.pending || createDefaultPending();
    let visibilityBound = false;

    const getElementById = config.getElementById ||
      ((id) => (doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null));
    const isHidden = () => Boolean(doc && doc.hidden);

    const mark = (type) => {
      if (type === "order") {
        pending.orders = true;
        pending.reports = true;
      } else if (type === "alert") {
        pending.alerts = true;
        pending.reports = true;
      } else if (type === "device") {
        pending.devices = true;
        pending.reports = true;
      } else if (type === "reports") {
        pending.reports = true;
      } else {
        pending.alerts = true;
        pending.reports = true;
      }
    };

    const flushPending = async () => {
      if (isHidden()) {
        return;
      }
      const snapshot = { ...pending };
      pending = createDefaultPending();
      if (snapshot.orders && typeof config.loadOrders === "function") {
        await config.loadOrders();
      }
      if (snapshot.alerts && typeof config.loadAlerts === "function") {
        await config.loadAlerts();
      }
      if (snapshot.devices && typeof config.loadDevices === "function") {
        await config.loadDevices();
      }
      if (snapshot.reports && typeof config.loadReports === "function") {
        await config.loadReports();
      }
    };

    const throttleOrders = throttleFactory(200, async () => {
      if (!isHidden() && pending.orders && typeof config.loadOrders === "function") {
        pending.orders = false;
        await config.loadOrders();
      }
    });
    const throttleAlerts = throttleFactory(200, async () => {
      if (!isHidden() && pending.alerts && typeof config.loadAlerts === "function") {
        pending.alerts = false;
        await config.loadAlerts();
      }
    });
    const throttleDevices = throttleFactory(500, async () => {
      if (!isHidden() && pending.devices && typeof config.loadDevices === "function") {
        pending.devices = false;
        await config.loadDevices();
      }
    });
    const throttleReports = throttleFactory(800, async () => {
      if (!isHidden() && pending.reports && typeof config.loadReports === "function") {
        pending.reports = false;
        await config.loadReports();
      }
    });

    const trigger = (type) => {
      mark(type);
      if (type === "order") {
        throttleOrders();
        throttleReports();
      } else if (type === "alert") {
        throttleAlerts();
        throttleReports();
      } else if (type === "device") {
        throttleDevices();
        throttleReports();
      } else if (type === "reports") {
        throttleReports();
      } else {
        throttleAlerts();
        throttleReports();
      }
    };

    const trimList = (listId, max) => {
      if (!max || max <= 0) {
        return;
      }
      const list = getElementById(listId);
      if (!list) {
        return;
      }
      const items = Array.from(list.children || []);
      const limiter = rootRef.listLimit?.enforceListLimit || null;
      const keep = limiter ? limiter(items, max) : items.slice(0, max);
      keep.forEach((node) => {
        if (node && node.parentElement !== list && typeof list.appendChild === "function") {
          list.appendChild(node);
        }
      });
      const removed = items.slice(keep.length);
      removed.forEach((node) => {
        if (node && typeof node.remove === "function") {
          node.remove();
        }
      });
      if (listId === "rule-matches-list" && rootRef.ruleMatchIndex?.removeIndexForNodes) {
        rootRef.ruleMatchIndex.removeIndexForNodes(config.ruleMatchIndex, removed);
      }
    };

    const mergeListItem = (listId, itemId, build, fallbackType) => {
      const list = getElementById(listId);
      if (!list) {
        return;
      }
      if (!itemId) {
        trigger(fallbackType || "reports");
        return;
      }
      const existing = typeof list.querySelector === "function"
        ? list.querySelector(`[data-id="${itemId}"]`)
        : null;
      const node = build();
      if (existing && typeof existing.replaceWith === "function") {
        existing.replaceWith(node);
      } else if (typeof list.prepend === "function") {
        list.prepend(node);
      }
      if (listId === "rule-matches-list") {
        const id = node && node.dataset ? node.dataset.id : null;
        if (id && config.ruleMatchIndex && typeof config.ruleMatchIndex.set === "function") {
          config.ruleMatchIndex.set(String(id), node);
        }
      }
      if (listId === "orders-list") {
        trimList("orders-list", 100);
      } else if (listId === "alerts-list") {
        trimList("alerts-list", 100);
      } else if (listId === "rule-matches-list") {
        trimList("rule-matches-list", 200);
      }
    };

    const handleRuleMatch = async (match) => {
      const page = typeof config.getRuleMatchPage === "function" ? config.getRuleMatchPage() : 1;
      const filters = typeof config.getRuleMatchFilters === "function" ? config.getRuleMatchFilters(page) : {};
      const signature = rootRef.ruleMatchIndex?.buildFilterSignature
        ? rootRef.ruleMatchIndex.buildFilterSignature(filters)
        : "";
      const currentSignature = typeof config.getRuleMatchSignature === "function"
        ? config.getRuleMatchSignature()
        : "";
      const acceptSignature = rootRef.ruleMatchIndex?.shouldAcceptIncremental
        ? rootRef.ruleMatchIndex.shouldAcceptIncremental(currentSignature, signature)
        : true;
      if (typeof config.setRuleMatchSignature === "function") {
        config.setRuleMatchSignature(signature);
      }
      if (!acceptSignature || !match.id) {
        if (typeof config.loadRuleMatches === "function") {
          await config.loadRuleMatches(1);
        }
        return;
      }
      const canInsert = rootRef.wsLogic?.shouldInsertRuleMatch
        ? rootRef.wsLogic.shouldInsertRuleMatch(match, filters, new Date())
        : true;
      if (canInsert) {
        mergeListItem("rule-matches-list", match.id, () => config.buildRuleMatchCard(match), "reports");
        if (typeof config.setRuleMatchHasMore === "function") {
          config.setRuleMatchHasMore(true);
        }
        if (typeof config.updateRuleMatchPager === "function") {
          config.updateRuleMatchPager();
        }
      }
      if (!match.matched_at) {
        if (typeof config.loadTrends === "function") {
          await config.loadTrends();
        }
        return;
      }
      const trendCache = typeof config.getTrendCache === "function" ? config.getTrendCache() : null;
      if (!trendCache || !rootRef.trendCache?.applyRuleMatchIncrement) {
        if (typeof config.loadTrends === "function") {
          await config.loadTrends();
        }
        return;
      }
      const applied = rootRef.trendCache.applyRuleMatchIncrement(trendCache, match.matched_at);
      if (applied) {
        if (typeof config.renderTrendBars === "function") {
          config.renderTrendBars(getElementById("trend-rule-matches"), trendCache.rule_matches || [], "rules");
        }
        if (typeof config.renderTrendMeta === "function") {
          config.renderTrendMeta(getElementById("trend-rules-meta"), trendCache.rule_matches || []);
        }
      } else if (typeof config.loadTrends === "function") {
        await config.loadTrends();
      }
    };

    const handleMessage = async (event) => {
      const envelope = parseEnvelope(event, config);
      const eventType = envelope.eventType || "";
      const payload = envelope.payload || {};
      if (envelope.kind === "order" && (envelope.entity || payload.order)) {
        const order = envelope.entity || payload.order;
        mergeListItem("orders-list", order.id, () => config.buildOrderCard(order), "order");
        trigger("order");
        return;
      }
      if (envelope.kind === "alert" && (envelope.entity || payload.alert)) {
        const alert = envelope.entity || payload.alert;
        mergeListItem("alerts-list", alert.id, () => config.buildAlertCard(alert), "alert");
        trigger("alert");
        return;
      }
      if (envelope.kind === "device" && (envelope.entity || payload.device)) {
        const device = envelope.entity || payload.device;
        mergeListItem("devices-list", device.id, () => config.buildDeviceCard(device), "device");
        trigger("device");
        return;
      }
      if (envelope.kind === "rule_match" && (envelope.entity || payload.match)) {
        await handleRuleMatch(envelope.entity || payload.match);
        return;
      }
      if (eventType && eventType.includes("rule")) {
        if (typeof config.loadRuleMatches === "function") {
          await config.loadRuleMatches(typeof config.getRuleMatchPage === "function" ? config.getRuleMatchPage() : 1);
        }
        return;
      }
      if (eventType.includes("alert")) {
        trigger("alert");
      } else if (eventType.includes("order")) {
        trigger("order");
      } else if (eventType.includes("device")) {
        trigger("device");
      } else {
        trigger("unknown");
      }
    };

    const bindVisibilityRefresh = () => {
      if (visibilityBound || !doc || typeof doc.addEventListener !== "function") {
        return;
      }
      visibilityBound = true;
      doc.addEventListener("visibilitychange", () => {
        if (!isHidden()) {
          flushPending();
        }
      });
    };

    const connect = () => {
      bindVisibilityRefresh();
      const WebSocketRef = config.WebSocket || rootRef.WebSocket;
      if (typeof WebSocketRef !== "function") {
        return null;
      }
      const ws = new WebSocketRef(resolveWsUrl(config));
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ subscribe: ["order", "alert", "device", "rule"] }));
        } catch (err) {
          if (rootRef.console && typeof rootRef.console.warn === "function") {
            rootRef.console.warn("ws subscribe failed", err);
          }
        }
      };
      ws.onmessage = handleMessage;
      ws.onclose = () => {
        const schedule = config.setTimeout || rootRef.setTimeout || setTimeout;
        schedule(connect, 5000);
      };
      return ws;
    };

    return {
      bindVisibilityRefresh,
      connect,
      flushPending,
      handleMessage,
      mark,
      trimList,
      mergeListItem,
    };
  }

  return {
    createRealtimeClient,
  };
});
