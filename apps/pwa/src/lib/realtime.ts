import type { LiveEvent } from "../types";

export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:18000/ws/alerts";

export function subscribeRealtime(onEvent: (event: LiveEvent) => void, onStatus?: (status: string) => void) {
  let closed = false;
  let socket: WebSocket | null = null;

  const connect = () => {
    if (closed) {
      return;
    }
    try {
      socket = new WebSocket(WS_URL);
      socket.addEventListener("open", () => {
        onStatus?.("online");
        socket?.send(JSON.stringify({ subscribe: ["order", "alert", "device", "rule"] }));
      });
      socket.addEventListener("message", (message) => {
        try {
          onEvent(JSON.parse(message.data) as LiveEvent);
        } catch {
          onEvent({ type: "raw", payload: { message: message.data } });
        }
      });
      socket.addEventListener("close", () => {
        onStatus?.("reconnecting");
        if (!closed) {
          window.setTimeout(connect, 2500);
        }
      });
      socket.addEventListener("error", () => onStatus?.("degraded"));
    } catch {
      onStatus?.("degraded");
    }
  };

  connect();
  return () => {
    closed = true;
    socket?.close();
  };
}
