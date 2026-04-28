import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchGuardSnapshot } from "../lib/api";
import { subscribeRealtime } from "../lib/realtime";
import type { GuardSnapshot, LiveEvent } from "../types";

const emptySnapshot: GuardSnapshot = {
  orders: [],
  sessions: [],
  alerts: [],
  devices: [],
  ruleMatches: [],
  summary: {},
  trends: {},
  evidence: [],
};

export function useGuardStore() {
  const [snapshot, setSnapshot] = useState<GuardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState("offline");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchGuardSnapshot();
      setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeRealtime(
      (event: LiveEvent) => {
        setSnapshot((current) => ({
          ...current,
          orders: event.order?.id
            ? current.orders.map((order) => (order.id === event.order?.id ? { ...order, ...event.order } : order))
            : current.orders,
          alerts: event.alert?.id
            ? current.alerts.map((alert) => (alert.id === event.alert?.id ? { ...alert, ...event.alert } : alert))
            : current.alerts,
          devices: event.device?.id
            ? current.devices.map((device) => (device.id === event.device?.id ? { ...device, ...event.device } : device))
            : current.devices,
        }));
      },
      setWsStatus,
    );
  }, []);

  const metrics = useMemo(() => {
    const openAlerts = snapshot.alerts.filter((alert) => alert.status === "open").length;
    const onlineDevices = snapshot.devices.filter((device) => device.status === "online").length;
    return {
      activeSessions: snapshot.sessions.filter((session) => ["armed", "alerted"].includes(session.state)).length,
      onlineDevices,
      offlineDevices: Math.max(snapshot.devices.length - onlineDevices, 0),
      openAlerts,
      events24h: snapshot.summary.events_last_24h ?? 0,
      ruleMatches: snapshot.ruleMatches.length,
    };
  }, [snapshot]);

  return {
    snapshot,
    metrics,
    loading,
    error,
    wsStatus,
    refresh,
  };
}
