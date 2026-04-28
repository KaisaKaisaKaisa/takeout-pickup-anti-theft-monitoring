(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.reportClient = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function resolveApiParams(config = {}) {
    return config.apiParams || root.apiParams || {};
  }

  function resolveReportMapping(config = {}) {
    return config.reportMapping || root.reportMapping || {};
  }

  function buildSummaryQuery(filters = {}, config = {}) {
    const apiParams = resolveApiParams(config);
    if (typeof apiParams.buildSummaryQuery === "function") {
      return apiParams.buildSummaryQuery(filters);
    }
    return "scope=user";
  }

  function buildTrendsQuery(filters = {}, config = {}) {
    const apiParams = resolveApiParams(config);
    if (typeof apiParams.buildTrendsQuery === "function") {
      return apiParams.buildTrendsQuery(filters);
    }
    const interval = filters.interval || "day";
    return `scope=user&interval=${interval}&days=${filters.days || 7}`;
  }

  function buildRuleMatchesQuery(filters = {}, config = {}) {
    const apiParams = resolveApiParams(config);
    if (typeof apiParams.buildRuleMatchesQuery === "function") {
      return apiParams.buildRuleMatchesQuery(filters);
    }
    return `limit=${filters.limit || 8}&offset=${filters.offset || 0}`;
  }

  function buildRuleMatchesExportQuery(filters = {}, config = {}) {
    const apiParams = resolveApiParams(config);
    if (typeof apiParams.buildRuleMatchesExportQuery === "function") {
      return apiParams.buildRuleMatchesExportQuery(filters);
    }
    return "scope=user&limit=200";
  }

  async function loadSummary(fetchJson, filters = {}, config = {}) {
    const query = buildSummaryQuery(filters, config);
    const summary = await fetchJson(`/reports/summary?${query}`);
    const reportMapping = resolveReportMapping(config);
    return typeof reportMapping.normalizeSummary === "function"
      ? reportMapping.normalizeSummary(summary || {})
      : (summary || {});
  }

  async function loadTrends(fetchJson, filters = {}, config = {}) {
    const query = buildTrendsQuery(filters, config);
    const trends = await fetchJson(`/reports/trends?${query}`);
    const reportMapping = resolveReportMapping(config);
    return typeof reportMapping.normalizeTrends === "function"
      ? reportMapping.normalizeTrends(trends || {})
      : (trends || {});
  }

  async function loadRuleMatches(fetchJson, filters = {}, config = {}) {
    const query = buildRuleMatchesQuery(filters, config);
    return fetchJson(`/rules/matches?${query}`);
  }

  async function exportSummary(downloadWithAuth, filters = {}, config = {}) {
    const query = buildSummaryQuery(filters, config);
    return downloadWithAuth(`/reports/summary/export?${query}`, "report-summary.csv");
  }

  async function exportTrends(downloadWithAuth, filters = {}, config = {}) {
    const query = buildTrendsQuery(filters, config);
    return downloadWithAuth(`/reports/trends/export?${query}`, "report-trends.csv");
  }

  async function exportRuleMatches(downloadWithAuth, filters = {}, config = {}) {
    const query = buildRuleMatchesExportQuery(filters, config);
    return downloadWithAuth(`/reports/rule-matches/export?${query}`, "rule-matches.csv");
  }

  return {
    buildRuleMatchesExportQuery,
    buildRuleMatchesQuery,
    buildSummaryQuery,
    buildTrendsQuery,
    exportRuleMatches,
    exportSummary,
    exportTrends,
    loadRuleMatches,
    loadSummary,
    loadTrends,
  };
});
