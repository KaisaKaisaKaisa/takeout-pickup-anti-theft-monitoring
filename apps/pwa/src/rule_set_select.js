(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ruleSetSelect = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function getScopeLabel(scope) {
    return scope === "global" ? "全局" : "个人";
  }

  function buildRuleSetOption(set = {}) {
    return {
      value: set.id || "",
      label: `${set.name || "未命名规则集"} / ${getScopeLabel(set.scope)}`,
    };
  }

  function buildRuleSetSelectOptions(sets = []) {
    const normalizedSets = Array.isArray(sets) ? sets : [];
    const editorOptions = normalizedSets.map(buildRuleSetOption);
    const filterOptions = [{ value: "", label: "全部规则集" }, ...editorOptions];
    return { editorOptions, filterOptions };
  }

  function replaceSelectOptions(select, options) {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
  }

  return {
    buildRuleSetSelectOptions,
    replaceSelectOptions,
  };
});
