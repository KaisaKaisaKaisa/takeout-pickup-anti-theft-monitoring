(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ruleMatchIndex = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function buildFilterSignature(filters) {
    const payload = {
      eventType: filters.eventType || filters.filter || "",
      ruleSetId: filters.ruleSetId || "",
      range: filters.range || "24h",
      includeSuppressed: Boolean(filters.includeSuppressed),
      search: filters.search || "",
      start: filters.start || "",
      end: filters.end || "",
    };
    return JSON.stringify(payload);
  }

  function shouldAcceptIncremental(currentSignature, nextSignature) {
    return currentSignature === nextSignature;
  }

  function rebuildIndex(listEl) {
    const map = new Map();
    if (!listEl) {
      return map;
    }
    Array.from(listEl.children).forEach((node) => {
      const id = node && node.dataset ? node.dataset.id : null;
      if (id) {
        map.set(String(id), node);
      }
    });
    return map;
  }

  function removeIndexForNodes(index, nodes) {
    if (!index || !nodes) {
      return;
    }
    nodes.forEach((node) => {
      const id = node && node.dataset ? node.dataset.id : null;
      if (id) {
        index.delete(String(id));
      }
    });
  }

  return {
    buildFilterSignature,
    shouldAcceptIncremental,
    rebuildIndex,
    removeIndexForNodes,
  };
});
