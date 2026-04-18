(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.trendCache = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function buildBucketKey(date, interval) {
    const dt = new Date(date);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    if (interval === "week") {
      const year = dt.getUTCFullYear();
      const first = new Date(Date.UTC(year, 0, 1));
      const dayOfYear = Math.floor((dt - first) / 86400000) + 1;
      const week = Math.ceil(dayOfYear / 7);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    return dt.toISOString().slice(0, 10);
  }

  function applyRuleMatchIncrement(cache, matchedAt) {
    if (!cache || !matchedAt) {
      return false;
    }
    const interval = cache.interval || "day";
    const key = buildBucketKey(matchedAt, interval);
    if (!key) {
      return false;
    }
    const list = cache.rule_matches || [];
    let row = list.find((item) => (item.day || item.week) === key);
    if (!row) {
      row = interval === "week" ? { week: key, count: 0 } : { day: key, count: 0 };
      list.unshift(row);
    }
    row.count = (row.count || 0) + 1;
    cache.rule_matches = list;
    return true;
  }

  return { buildBucketKey, applyRuleMatchIncrement };
});
