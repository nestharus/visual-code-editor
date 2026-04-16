/**
 * SSE subscription hook — connects to the watcher server and
 * invalidates TanStack Query cache on workspace changes.
 */

import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";

const WATCHER_URL =
  typeof window !== "undefined"
    ? (window as any).__WATCHER_URL || "http://localhost:3001"
    : "http://localhost:3001";

export type WatcherStatus = "connected" | "reconnecting" | "disconnected";

export type WatcherState = {
  status: Accessor<WatcherStatus>;
  lastInvalidation: Accessor<string | null>;
  refreshing: Accessor<boolean>;
};

export function useWatchSubscription(): WatcherState {
  const queryClient = useQueryClient();
  const [status, setStatus] = createSignal<WatcherStatus>("disconnected");
  const [lastInvalidation, setLastInvalidation] = createSignal<string | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  onMount(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let wasConnected = false;

    const connect = () => {
      try {
        eventSource = new EventSource(`${WATCHER_URL}/api/events`);

        eventSource.addEventListener("workspace-invalidated", (event) => {
          const data = JSON.parse(event.data);
          console.log("[watcher] workspace invalidated:", data);
          setLastInvalidation(data.timestamp || new Date().toISOString());
          setRefreshing(true);
          if (refreshTimer) clearTimeout(refreshTimer);

          queryClient.invalidateQueries({ queryKey: ["workspace"] });
          queryClient.invalidateQueries({ queryKey: ["diagram"] });
          queryClient.invalidateQueries({ queryKey: ["detail"] });

          refreshTimer = setTimeout(() => setRefreshing(false), 2500);
        });

        eventSource.addEventListener("connected", () => {
          console.log("[watcher] SSE connected");
          wasConnected = true;
          setStatus("connected");
        });

        eventSource.onopen = () => {
          wasConnected = true;
          setStatus("connected");
        };

        eventSource.onerror = () => {
          eventSource?.close();
          setStatus(wasConnected ? "reconnecting" : "disconnected");
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    onCleanup(() => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
    });
  });

  return { status, lastInvalidation, refreshing };
}
