(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ruleConsoleLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function toInt(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function createDsl(editorApi, defaultField) {
    if (editorApi && typeof editorApi.createEmptyDsl === "function") {
      return editorApi.createEmptyDsl(defaultField);
    }
    return {
      op: "and",
      rules: [{ field: defaultField || "motion_score", op: "gte", value: "" }],
    };
  }

  function normalizeDsl(editorApi, dsl, defaultField) {
    if (editorApi && typeof editorApi.normalizeDsl === "function") {
      return editorApi.normalizeDsl(dsl, defaultField);
    }
    return dsl || createDsl(editorApi, defaultField);
  }

  function conditionsToDsl(editorApi, conditions, defaultField) {
    if (editorApi && typeof editorApi.conditionsToDsl === "function") {
      return editorApi.conditionsToDsl(conditions, defaultField);
    }
    return createDsl(editorApi, defaultField);
  }

  function createEmptyRuleDraft(defaultField, editorApi) {
    return {
      id: null,
      name: "",
      eventType: "motion",
      action: "alert",
      actionParams: {},
      priority: 100,
      cooldownSec: 120,
      enabled: true,
      dsl: createDsl(editorApi, defaultField),
    };
  }

  function hydrateRuleDraft(rule = {}, defaultField, editorApi) {
    const base = createEmptyRuleDraft(defaultField, editorApi);
    const sourceDsl = rule.dsl_json
      ? normalizeDsl(editorApi, rule.dsl_json, defaultField)
      : conditionsToDsl(editorApi, rule.conditions || {}, defaultField);

    return {
      ...base,
      id: rule.id || null,
      name: rule.name || "",
      eventType: rule.event_type || base.eventType,
      action: rule.action || base.action,
      actionParams: rule.action_params || {},
      priority: rule.priority ?? base.priority,
      cooldownSec: rule.cooldown_sec ?? base.cooldownSec,
      enabled: rule.enabled ?? base.enabled,
      dsl: sourceDsl,
    };
  }

  function buildRulePayload(draft = {}) {
    return {
      name: String(draft.name || "").trim(),
      enabled: Boolean(draft.enabled),
      priority: toInt(draft.priority, 100),
      event_type: draft.eventType || "motion",
      dsl_json: draft.dsl || null,
      action: draft.action || "alert",
      action_params: draft.actionParams || {},
      cooldown_sec: toInt(draft.cooldownSec, 120),
    };
  }

  return {
    createEmptyRuleDraft,
    hydrateRuleDraft,
    buildRulePayload,
  };
});
