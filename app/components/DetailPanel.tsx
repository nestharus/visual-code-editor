import { Show, createSignal } from "solid-js";
import { useSearch, useNavigate } from "@tanstack/solid-router";

export type PanelEntry = {
  kind: string;
  id: string;
  label?: string;
};

export function DetailPanel() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  const isOpen = () => !!(search as any).panelKind && !!(search as any).panelId;
  const panelKind = () => (search as any).panelKind as string | undefined;
  const panelId = () => (search as any).panelId as string | undefined;
  const panelLabel = () => (search as any).panelLabel as string | undefined;

  const close = () => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.panelKind;
        delete next.panelId;
        delete next.panelLabel;
        return next;
      },
    });
  };

  return (
    <aside
      id="detail-panel"
      classList={{ "detail-panel": true, "is-open": isOpen() }}
    >
      <Show when={isOpen()}>
        <div class="detail-panel__header">
          <div>
            <span id="detail-panel-kind" class="detail-panel__kind">
              {panelKind()}
            </span>
            <h3 id="detail-panel-title" class="detail-panel__title">
              {panelLabel() || panelId()}
            </h3>
          </div>
          <button
            id="detail-panel-close"
            type="button"
            class="detail-panel__close"
            onClick={close}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
        <div id="detail-panel-body" class="detail-panel__body">
          <div
            class="detail-page"
            data-entity-kind={panelKind()}
            data-entity-id={panelId()}
          >
            <p class="detail-panel__placeholder">
              Detail content for {panelKind()} "{panelId()}" will be loaded here.
            </p>
          </div>
        </div>
      </Show>
    </aside>
  );
}
