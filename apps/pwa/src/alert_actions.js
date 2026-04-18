(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.alertActions = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ACTIONS = {
    ack: {
      action: "ack",
      pathSuffix: "ack",
      successMessage: "告警已确认",
      errorMessage: "告警确认失败",
    },
    resolve: {
      action: "resolve",
      pathSuffix: "resolve",
      successMessage: "告警已结案",
      errorMessage: "告警结案失败",
    },
    false_positive: {
      action: "false_positive",
      pathSuffix: "false-positive",
      successMessage: "已标记为误报",
      errorMessage: "误报标记失败",
    },
  };

  function getAlertActionMeta(action) {
    const meta = ACTIONS[action];
    if (!meta) {
      throw new Error(`Unknown alert action: ${action}`);
    }
    return { ...meta };
  }

  return { getAlertActionMeta };
});
