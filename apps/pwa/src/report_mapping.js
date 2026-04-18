function normalizeSummary(data = {}) {
  const orders = data.orders || {};
  const alerts = data.alerts || {};
  const devices = data.devices || {};
  const sessions = data.sessions || {};
  return {
    orders: {
      total: orders.total ?? 0,
      created: orders.created ?? 0,
      delivered: orders.delivered ?? 0,
      picked_up: orders.picked_up ?? 0,
    },
    alerts: {
      total: alerts.total ?? 0,
      open: alerts.open ?? 0,
      acknowledged: alerts.acknowledged ?? 0,
      resolved: alerts.resolved ?? 0,
      false_positive: alerts.false_positive ?? 0,
    },
    devices: {
      total: devices.total ?? 0,
      online: devices.online ?? 0,
      offline: devices.offline ?? 0,
    },
    sessions: {
      total: sessions.total ?? 0,
      armed: sessions.armed ?? 0,
      alerted: sessions.alerted ?? 0,
      confirmed: sessions.confirmed ?? 0,
    },
    events_last_24h: data.events_last_24h ?? 0,
    rule_matches: {
      total: (data.rule_matches || {}).total ?? 0,
      suppressed: (data.rule_matches || {}).suppressed ?? 0,
    },
  };
}

function normalizeTrends(data = {}) {
  return {
    interval: data.interval || "day",
    orders: data.orders || [],
    alerts: data.alerts || [],
    devices: data.devices || [],
    sessions: data.sessions || [],
    events: data.events || [],
    rule_matches: data.rule_matches || [],
  };
}

if (typeof module === "object" && module.exports) {
  module.exports = { normalizeSummary, normalizeTrends };
}
