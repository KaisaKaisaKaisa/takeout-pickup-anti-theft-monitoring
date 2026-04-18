(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.realtimeRouter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function toObject(rawMessage) {
    if (typeof rawMessage === "string") {
      try {
        return JSON.parse(rawMessage);
      } catch (_err) {
        return { type: rawMessage };
      }
    }
    if (rawMessage && typeof rawMessage === "object") {
      return rawMessage;
    }
    return { type: "" };
  }

  function pickEntity(payload = {}) {
    return (
      payload.entity ||
      payload.alert ||
      payload.order ||
      payload.device ||
      payload.match ||
      null
    );
  }

  function classifyRealtimeKind({ eventType = "", entityType = "", payload = {} } = {}) {
    const normalizedEntityType = String(entityType || "").toLowerCase();
    const normalizedEventType = String(eventType || "").toLowerCase();
    if (normalizedEntityType === "rule_match") {
      return "rule_match";
    }
    if (normalizedEntityType) {
      return normalizedEntityType;
    }
    if (payload.match) {
      return "rule_match";
    }
    if (payload.order) {
      return "order";
    }
    if (payload.alert) {
      return "alert";
    }
    if (payload.device) {
      return "device";
    }
    if (normalizedEventType.includes("rule")) {
      return "rule_match";
    }
    if (normalizedEventType.includes("order")) {
      return "order";
    }
    if (normalizedEventType.includes("alert")) {
      return "alert";
    }
    if (normalizedEventType.includes("device")) {
      return "device";
    }
    return "";
  }

  function parseRealtimeEnvelope(rawMessage) {
    const envelope = toObject(rawMessage);
    const eventType = typeof envelope.type === "string" ? envelope.type : "";
    const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
    const entityType = payload.entity_type || payload.entityType || "";
    const entity = pickEntity(payload);
    const kind = classifyRealtimeKind({ eventType, entityType, payload });

    return {
      eventType,
      payload,
      entityType,
      entity,
      kind,
    };
  }

  return {
    parseRealtimeEnvelope,
    classifyRealtimeKind,
  };
});
