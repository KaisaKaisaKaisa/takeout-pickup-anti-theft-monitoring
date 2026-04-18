function createEmptyDsl(defaultField = "motion_score") {
  return {
    op: "and",
    rules: [{ field: defaultField, op: "gte", value: "" }],
  };
}

function isGroup(node) {
  return Boolean(
    node &&
    typeof node === "object" &&
    (node.op === "and" || node.op === "or") &&
    Array.isArray(node.rules)
  );
}

function normalizeDsl(input, defaultField = "motion_score") {
  if (isGroup(input) && input.rules.length) {
    return input;
  }
  return createEmptyDsl(defaultField);
}

function conditionsToDsl(conditions, defaultField = "motion_score") {
  if (!conditions || typeof conditions !== "object") {
    return createEmptyDsl(defaultField);
  }
  if (Array.isArray(conditions)) {
    return createEmptyDsl(defaultField);
  }
  if (conditions.$or && Array.isArray(conditions.$or)) {
    return {
      op: "or",
      rules: conditions.$or.map((child) => conditionsToDsl(child, defaultField)),
    };
  }
  const entries = Object.entries(conditions);
  if (!entries.length) {
    return createEmptyDsl(defaultField);
  }
  return {
    op: "and",
    rules: entries.map(([field, cond]) => {
      if (cond && typeof cond === "object" && !Array.isArray(cond)) {
        const op = Object.keys(cond)[0] || "eq";
        return { field, op, value: cond[op] };
      }
      return { field, op: "eq", value: cond };
    }),
  };
}

if (typeof module === "object" && module.exports) {
  module.exports = { createEmptyDsl, normalizeDsl, conditionsToDsl, isGroup };
}

if (typeof window !== "undefined") {
  window.ruleDslEditor = { createEmptyDsl, normalizeDsl, conditionsToDsl, isGroup };
}
