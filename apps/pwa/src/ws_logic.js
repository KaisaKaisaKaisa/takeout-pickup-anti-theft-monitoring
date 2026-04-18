(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.wsLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function shouldInsertRuleMatch(match, filters, now) {
    const eventType = filters.eventType || filters.filter || "";
    const ruleSetId = filters.ruleSetId || "";
    const search = filters.search || "";
    const includeSuppressed = Boolean(filters.includeSuppressed);
    const range = filters.range || "24h";
    const start = filters.start || "";
    const end = filters.end || "";
    if (!includeSuppressed && match.suppressed) {
      return false;
    }
    if (eventType && match.event_type !== eventType) {
      return false;
    }
    if (ruleSetId && String(match.rule_set_id || "") !== String(ruleSetId)) {
      return false;
    }
    if (search) {
      const needle = String(search);
      const hay = [match.order_id, match.rule_id, match.rule_set_id]
        .filter(Boolean)
        .map(String);
      if (!hay.some((item) => item.includes(needle))) {
        return false;
      }
    }
    if (range !== "all" && match.matched_at) {
      const ts = new Date(match.matched_at).getTime();
      const base = (now instanceof Date ? now : new Date()).getTime();
      const limit = range === "7d"
        ? 7 * 24 * 3600 * 1000
        : range === "30d"
          ? 30 * 24 * 3600 * 1000
          : 24 * 3600 * 1000;
      if (Number.isFinite(ts) && base - ts > limit) {
        return false;
      }
    }
    if (start && match.matched_at) {
      const ts = new Date(match.matched_at).getTime();
      const min = new Date(start).getTime();
      if (Number.isFinite(ts) && Number.isFinite(min) && ts < min) {
        return false;
      }
    }
    if (end && match.matched_at) {
      const ts = new Date(match.matched_at).getTime();
      const max = new Date(end).getTime();
      if (Number.isFinite(ts) && Number.isFinite(max) && ts > max + 24 * 3600 * 1000 - 1) {
        return false;
      }
    }
    return true;
  }

  return { shouldInsertRuleMatch };
});
