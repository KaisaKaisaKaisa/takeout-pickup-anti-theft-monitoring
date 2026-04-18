(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.apiParams = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function appendIfPresent(params, key, value) {
    if (value == null) {
      return;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      return;
    }
    params.set(key, normalized);
  }

  function buildReportRangeParams(filters = {}) {
    const params = new URLSearchParams();
    appendIfPresent(params, "start", filters.start);
    appendIfPresent(params, "end", filters.end);
    return params;
  }

  function buildSummaryQuery(filters = {}) {
    const params = new URLSearchParams();
    params.set("scope", filters.scope || "user");
    buildReportRangeParams(filters).forEach((value, key) => {
      params.set(key, value);
    });
    return params.toString();
  }

  function buildTrendsQuery(filters = {}) {
    const params = new URLSearchParams();
    const interval = filters.interval === "week" ? "week" : "day";
    params.set("scope", filters.scope || "user");
    params.set("interval", interval);
    if (interval === "week") {
      params.set("weeks", String(filters.weeks || 6));
    } else {
      params.set("days", String(filters.days || 7));
    }
    buildReportRangeParams(filters).forEach((value, key) => {
      params.set(key, value);
    });
    return params.toString();
  }

  function buildRuleMatchesQuery(filters = {}) {
    const params = new URLSearchParams();
    const hasExplicitRange = Boolean(
      (filters.start && String(filters.start).trim()) || (filters.end && String(filters.end).trim()),
    );
    params.set("limit", String(filters.limit || 8));
    params.set("offset", String(filters.offset || 0));
    appendIfPresent(params, "event_type", filters.eventType);
    appendIfPresent(params, "rule_set_id", filters.ruleSetId);
    appendIfPresent(params, "search", filters.search);
    if (!hasExplicitRange) {
      appendIfPresent(params, "range", filters.range || "24h");
    }
    appendIfPresent(params, "start", filters.start);
    appendIfPresent(params, "end", filters.end);
    if (filters.includeSuppressed) {
      params.set("include_suppressed", "true");
    }
    return params.toString();
  }

  function buildRuleMatchesExportQuery(filters = {}) {
    const params = new URLSearchParams();
    const hasExplicitRange = Boolean(
      (filters.start && String(filters.start).trim()) || (filters.end && String(filters.end).trim()),
    );
    params.set("scope", filters.scope || "user");
    params.set("limit", String(filters.limit || 200));
    appendIfPresent(params, "event_type", filters.eventType);
    appendIfPresent(params, "rule_set_id", filters.ruleSetId);
    appendIfPresent(params, "search", filters.search);
    if (!hasExplicitRange) {
      appendIfPresent(params, "range", filters.range || "24h");
    }
    appendIfPresent(params, "start", filters.start);
    appendIfPresent(params, "end", filters.end);
    if (filters.includeSuppressed) {
      params.set("include_suppressed", "true");
    }
    return params.toString();
  }

  return {
    buildSummaryQuery,
    buildTrendsQuery,
    buildRuleMatchesQuery,
    buildRuleMatchesExportQuery,
  };
});
