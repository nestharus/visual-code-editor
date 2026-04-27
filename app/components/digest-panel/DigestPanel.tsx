import { For, Show, createMemo, createSignal, type JSX } from "solid-js";

import type { ChangeEvent, ChangeEventTier } from "../../lib/user-context";

import "./digest-panel.css";

export type DigestDisposition = "disposed_to_immediate" | "dismissed";

export interface DigestPanelProps {
  events: readonly ChangeEvent[];
  onEventClick: (event: ChangeEvent) => void;
  onDispose: (eventId: string, disposition: DigestDisposition) => void;
  emptyMessage?: string;
}

type DigestSection = {
  tier: ChangeEventTier;
  title: string;
};

const SECTIONS: readonly DigestSection[] = [
  { tier: "immediate", title: "Immediate" },
  { tier: "stashed", title: "Stashed" },
  { tier: "suppressed", title: "Suppressed" },
];

function formatAge(timestampMs: number, nowMs = Date.now()): string {
  const elapsedMs = Math.max(0, nowMs - timestampMs);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation();
}

function disposeHandler(
  props: DigestPanelProps,
  event: ChangeEvent,
  disposition: DigestDisposition,
): JSX.EventHandler<HTMLButtonElement, MouseEvent> {
  return (clickEvent) => {
    clickEvent.stopPropagation();
    props.onDispose(event.id, disposition);
  };
}

function DigestEventRow(props: {
  event: ChangeEvent;
  index: number;
  panelProps: DigestPanelProps;
}) {
  const age = createMemo(() => formatAge(props.event.timestampMs));

  return (
    <li
      class="digest-panel__item"
      data-testid={`digest-event-row-${props.event.tier}-${props.index}`}
      role="button"
      tabIndex={0}
      onClick={() => props.panelProps.onEventClick(props.event)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.panelProps.onEventClick(props.event);
        }
      }}
    >
      <div class="digest-panel__row-main">
        <div class="digest-panel__title-line">
          <span
            class={`digest-panel__kind digest-kind--${props.event.kind}`}
            aria-label={`Kind: ${props.event.kind}`}
          >
            {props.event.kind}
          </span>
          <span class="digest-panel__actor" title={props.event.actor}>
            {props.event.actor}
          </span>
        </div>
        <div class="digest-panel__summary">{props.event.contextSummary}</div>
        <div class="digest-panel__subline">
          <span>{age()}</span>
          <span aria-hidden="true">{"\u2022"}</span>
          <span>{props.event.affectedEntityIds.length} affected</span>
        </div>
      </div>

      <div class="digest-panel__actions" aria-label={`Actions for ${props.event.id}`}>
        <Show when={props.event.tier === "stashed"}>
          <button
            class="digest-panel__action-button is-primary"
            data-testid={`digest-action-surface-${props.index}`}
            type="button"
            onClick={disposeHandler(
              props.panelProps,
              props.event,
              "disposed_to_immediate",
            )}
          >
            Surface
          </button>
        </Show>
        <Show when={props.event.tier !== "suppressed"}>
          <button
            class="digest-panel__action-button"
            data-testid={`digest-action-dismiss-${props.index}`}
            type="button"
            onClick={disposeHandler(props.panelProps, props.event, "dismissed")}
          >
            Dismiss
          </button>
        </Show>
        <Show when={props.event.detailUrl}>
          {(detailUrl) => (
            <a
              class="digest-panel__action-button"
              href={detailUrl()}
              target="_blank"
              rel="noopener"
              onClick={stopPropagation}
            >
              Detail
            </a>
          )}
        </Show>
      </div>
    </li>
  );
}

function DigestSectionView(props: {
  section: DigestSection;
  events: readonly ChangeEvent[];
  expanded: boolean;
  onToggle?: () => void;
  panelProps: DigestPanelProps;
}) {
  const sectionTestId = createMemo(() => `digest-section-${props.section.tier}`);
  const listId = createMemo(() => `digest-section-list-${props.section.tier}`);

  return (
    <section
      class="digest-panel__section"
      data-testid={sectionTestId()}
      aria-labelledby={`digest-section-heading-${props.section.tier}`}
    >
      <header class="digest-panel__section-header">
        <h3
          class="digest-panel__section-heading"
          id={`digest-section-heading-${props.section.tier}`}
        >
          {props.section.title} ({props.events.length})
        </h3>
        <Show when={props.section.tier === "suppressed"}>
          <button
            class="digest-panel__toggle"
            data-testid="digest-show-suppressed"
            type="button"
            aria-expanded={props.expanded}
            aria-controls={listId()}
            onClick={props.onToggle}
          >
            {props.expanded ? "Hide suppressed" : "Show suppressed"}
          </button>
        </Show>
      </header>

      <Show
        when={props.expanded}
        fallback={
          <Show when={props.section.tier !== "suppressed"}>
            <p class="digest-panel__empty">No events.</p>
          </Show>
        }
      >
        <Show
          when={props.events.length > 0}
          fallback={<p class="digest-panel__empty">No events.</p>}
        >
          <ul class="digest-panel__list" id={listId()} role="list">
            <For each={props.events}>
              {(event, index) => (
                <DigestEventRow
                  event={event}
                  index={index()}
                  panelProps={props.panelProps}
                />
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}

export function DigestPanel(props: DigestPanelProps) {
  const [showSuppressed, setShowSuppressed] = createSignal(false);
  const eventsByTier = createMemo(() => {
    const groups: Record<ChangeEventTier, ChangeEvent[]> = {
      immediate: [],
      stashed: [],
      suppressed: [],
    };

    for (const event of props.events) {
      groups[event.tier].push(event);
    }

    return groups;
  });

  return (
    <section
      class="digest-panel"
      data-testid="digest-panel"
      role="region"
      aria-label="Digest"
    >
      <header class="digest-panel__header" data-testid="digest-panel-header">
        Digest ({props.events.length})
      </header>

      <Show
        when={props.events.length > 0}
        fallback={
          <p class="digest-panel__empty digest-panel__empty--panel">
            {props.emptyMessage ?? "No change events yet."}
          </p>
        }
      >
        <div class="digest-panel__body">
          <For each={SECTIONS}>
            {(section) => (
              <DigestSectionView
                section={section}
                events={eventsByTier()[section.tier]}
                expanded={section.tier !== "suppressed" || showSuppressed()}
                onToggle={() => setShowSuppressed((value) => !value)}
                panelProps={props}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
