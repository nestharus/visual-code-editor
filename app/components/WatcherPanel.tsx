import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { WATCHER_URL } from "../lib/diagram-data";
import type { WatcherStatus } from "../lib/live/useWatchSubscription";
import { createOverlayFocus } from "../lib/a11y/createOverlayFocus";

type WatchEntry = {
  id: string;
  path: string;
  debounceMs: number;
  createdAt: string;
  lastEvent?: string;
};

type WatcherPanelProps = {
  isOpen: boolean;
  status: Accessor<WatcherStatus>;
  refreshing: Accessor<boolean>;
  lastInvalidation: Accessor<string | null>;
  onClose: () => void;
};

export function WatcherPanel(props: WatcherPanelProps) {
  const [watches, setWatches] = createSignal<WatchEntry[]>([]);
  const [newPath, setNewPath] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const pathInputId = "watcher-path-input";
  let panelRef: HTMLDivElement | undefined;
  let pathInputRef: HTMLInputElement | undefined;

  // Toolbar flyout: kept as region, no trap, Escape closes, focus returns to the Live button.
  createOverlayFocus({
    isOpen: () => props.isOpen,
    getRoot: () => panelRef,
    getFocusTarget: () => pathInputRef ?? null,
    onEscape: props.onClose,
  });

  const fetchWatches = async () => {
    try {
      const response = await fetch(`${WATCHER_URL}/api/watch`);
      if (!response.ok) return;

      const data = await response.json();
      setWatches(Array.isArray(data) ? data : []);
    } catch {
      // Phase 1 ignores fetch errors for passive refresh.
    }
  };

  createEffect(() => {
    if (!props.isOpen) return;
    void fetchWatches();
  });

  const handleAdd = async (event: SubmitEvent) => {
    event.preventDefault();
    const path = newPath().trim();
    if (!path) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${WATCHER_URL}/api/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, debounceMs: 500 }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add watch");
      }

      setNewPath("");
      await fetchWatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add watch");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await fetch(`${WATCHER_URL}/api/watch/${id}`, { method: "DELETE" });
      await fetchWatches();
    } catch {
      // Phase 1 ignores delete failures.
    }
  };

  const handleRebuild = async () => {
    setLoading(true);

    try {
      await fetch(`${WATCHER_URL}/api/rebuild`, { method: "POST" });
    } catch {
      // Phase 1 ignores rebuild failures.
    } finally {
      setLoading(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div
        id="watcher-panel"
        ref={panelRef}
        class="watcher-panel"
        role="region"
        aria-labelledby="watcher-panel-title"
      >
        <div class="watcher-panel-header">
          <div>
            <h3 id="watcher-panel-title" class="watcher-panel-title">Live Watcher</h3>
            <span
              class="watcher-panel-status"
              data-status={props.status()}
              aria-live="polite"
            >
              {props.status()}
            </span>
          </div>
          <button
            type="button"
            class="button watcher-panel-close"
            onClick={props.onClose}
            aria-label="Close watcher panel"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              aria-hidden="true"
              style={{ "flex-shrink": 0 }}
            >
              <path
                d="M1 1 L9 9 M9 1 L1 9"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>

        <Show when={props.refreshing()}>
          <div class="watcher-panel-refresh" aria-live="polite">Refreshing…</div>
        </Show>
        <Show when={!props.refreshing() && props.lastInvalidation()}>
          <div class="watcher-panel-last-update" aria-live="polite">
            Last update: {props.lastInvalidation()}
          </div>
        </Show>

        <div class="watcher-panel-actions">
          <button
            type="button"
            class="button watcher-rebuild-btn"
            onClick={handleRebuild}
            disabled={loading()}
          >
            Regenerate
          </button>
        </div>

        <form class="watcher-add-form" onSubmit={handleAdd}>
          <label class="visually-hidden" for={pathInputId}>
            Watch path
          </label>
          <input
            id={pathInputId}
            ref={pathInputRef}
            type="text"
            class="watcher-add-input"
            placeholder="Watch path..."
            value={newPath()}
            onInput={(event) => setNewPath(event.currentTarget.value)}
          />
          <button
            type="submit"
            class="button watcher-add-btn"
            disabled={loading() || !newPath().trim()}
          >
            Add
          </button>
        </form>

        <Show when={error()}>
          <p class="watcher-error">{error()}</p>
        </Show>

        <div class="watcher-list">
          <Show when={watches().length === 0}>
            <p class="watcher-empty">No active watches</p>
          </Show>
          <For each={watches()}>
            {(entry) => (
              <div class="watcher-entry">
                <div class="watcher-entry-info">
                  <span class="watcher-entry-path">{entry.path}</span>
                  <span class="watcher-entry-meta">
                    {entry.debounceMs}ms debounce
                    {entry.lastEvent ? ` · last: ${entry.lastEvent}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  class="button watcher-entry-remove"
                  onClick={() => handleRemove(entry.id)}
                  aria-label={`Remove watch on ${entry.path}`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                    style={{ "flex-shrink": 0 }}
                  >
                    <path
                      d="M1 1 L9 9 M9 1 L1 9"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
