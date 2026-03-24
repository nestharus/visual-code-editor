/**
 * SSE subscription hook — connects to the watcher server and
 * invalidates TanStack Query cache on workspace changes.
 */

import { onCleanup, onMount } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";

const WATCHER_URL =
  typeof window !== "undefined"
    ? (window as any).__WATCHER_URL || "http://localhost:3001"
    : "http://localhost:3001";

export function useWatchSubscription() {
  const queryClient = useQueryClient();

  onMount(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      try {
        eventSource = new EventSource(`${WATCHER_URL}/api/events`);

        eventSource.addEventListener("workspace-invalidated", (event) => {
          const data = JSON.parse(event.data);
          console.log("[watcher] workspace invalidated:", data);

          // Invalidate all diagram queries
          queryClient.invalidateQueries({ queryKey: ["workspace"] });
          queryClient.invalidateQueries({ queryKey: ["diagram"] });
          queryClient.invalidateQueries({ queryKey: ["detail"] });
        });

        eventSource.addEventListener("connected", () => {
          console.log("[watcher] SSE connected");
        });

        eventSource.onerror = () => {
          eventSource?.close();
          // Reconnect after 5s
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    onCleanup(() => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    });
  });
}
