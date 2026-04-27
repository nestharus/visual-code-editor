import { For, Show, createMemo, type JSX } from "solid-js";

import type { RenderSnapshot } from "../../lib/render-snapshot";
import type { Widget } from "../../lib/widget";

import "./widget-inventory.css";

export interface WidgetInventoryPanelProps {
  widgets: readonly Widget[];
  renderSnapshotsByWidgetId?: Record<string, readonly RenderSnapshot[]>;
  onWidgetClick: (widget: Widget) => void;
  onRefresh: () => void;
  emptyMessage?: string;
}

function sourcePath(widget: Widget): string {
  const reference = widget.references[0];
  if (!reference) return "";

  return reference.identifier.split("#")[0] || reference.identifier;
}

function rowClickHandler(
  props: WidgetInventoryPanelProps,
  widget: Widget,
): JSX.EventHandler<HTMLButtonElement, MouseEvent> {
  return () => props.onWidgetClick(widget);
}

function renderSnapshotsFor(
  props: WidgetInventoryPanelProps,
  widget: Widget,
): readonly RenderSnapshot[] {
  return props.renderSnapshotsByWidgetId?.[widget.id] ?? [];
}

export function WidgetInventoryPanel(props: WidgetInventoryPanelProps) {
  const count = createMemo(() => props.widgets.length);

  return (
    <section
      class="widget-inventory"
      data-testid="widget-inventory-panel"
      role="region"
      aria-label="Widgets"
    >
      <header class="widget-inventory__header">
        <h2 class="widget-inventory__title">Widgets ({count()})</h2>
        <button
          class="widget-inventory__refresh"
          type="button"
          onClick={props.onRefresh}
        >
          Refresh
        </button>
      </header>

      <Show
        when={props.widgets.length > 0}
        fallback={
          <p class="widget-inventory__empty" data-testid="widget-inventory-empty">
            {props.emptyMessage ?? "No widgets discovered"}
          </p>
        }
      >
        <ul class="widget-inventory__list" role="list">
          <For each={props.widgets}>
            {(widget, index) => {
              const renderSnapshots = createMemo(() =>
                renderSnapshotsFor(props, widget),
              );

              return (
                <li class="widget-inventory__item" role="listitem">
                  <button
                    class="widget-inventory__row"
                    data-testid={`widget-row-${index()}`}
                    type="button"
                    onClick={rowClickHandler(props, widget)}
                  >
                    <span
                      class={`widget-inventory__kind widget-kind--${widget.kind}`}
                      data-testid={`widget-kind-chip-${index()}`}
                    >
                      {widget.kind}
                    </span>
                    <span class="widget-inventory__row-main">
                      <span class="widget-inventory__label">{widget.label}</span>
                      <span class="widget-inventory__meta">
                        <span
                          class="widget-inventory__source"
                          title={sourcePath(widget)}
                        >
                          {sourcePath(widget)}
                        </span>
                        <span class="widget-inventory__renders-hint">
                          Renders ({renderSnapshots().length})
                        </span>
                      </span>
                    </span>
                  </button>
                  <Show when={renderSnapshots().length > 0}>
                    <details class="widget-inventory__renders">
                      <summary class="widget-inventory__renders-summary">
                        Render assets
                      </summary>
                      <ul class="widget-inventory__render-list">
                        <For each={renderSnapshots()}>
                          {(renderSnapshot) => (
                            <li class="widget-inventory__render-item">
                              {renderSnapshot.assetPath}
                            </li>
                          )}
                        </For>
                      </ul>
                    </details>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </section>
  );
}
