(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.listLimit = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function enforceListLimit(items, max) {
    if (!Array.isArray(items) || !Number.isFinite(max) || max <= 0) {
      return items || [];
    }
    return items.slice(0, max);
  }

  return { enforceListLimit };
});
