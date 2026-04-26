import { For, createMemo, type JSX } from "solid-js";

import type { Slice, SliceLifecycleState } from "../../lib/slice";

import "./slice-panel.css";

type SliceSection = "matched" | "neighbourhood";

export interface SlicePanelProps {
  slice: Slice;
  resolveLabel?: (entityId: string) => string | null;
  onEntityClick: (entityId: string, section: SliceSection) => void;
  onTransition: (toState: SliceLifecycleState, reason: string) => void;
}

interface SliceAction {
  name: string;
  label: string;
  toState: SliceLifecycleState;
  reason: string;
}

const ACTIONS_BY_STATE: Record<SliceLifecycleState, readonly SliceAction[]> = {
  active: [
    { name: "pin", label: "Pin", toState: "pinned", reason: "User pinned slice" },
    {
      name: "dismiss",
      label: "Dismiss",
      toState: "dismissed",
      reason: "User dismissed slice",
    },
  ],
  expiring: [
    { name: "pin", label: "Pin", toState: "pinned", reason: "User pinned slice" },
    {
      name: "dismiss",
      label: "Dismiss",
      toState: "dismissed",
      reason: "User dismissed slice",
    },
  ],
  pinned: [
    {
      name: "unpin",
      label: "Unpin",
      toState: "active",
      reason: "User unpinned slice",
    },
    {
      name: "dismiss",
      label: "Dismiss",
      toState: "dismissed",
      reason: "User dismissed slice",
    },
  ],
  recovered: [
    { name: "pin", label: "Pin", toState: "pinned", reason: "User pinned slice" },
    {
      name: "activate",
      label: "Activate",
      toState: "active",
      reason: "User activated recovered slice",
    },
    {
      name: "dismiss",
      label: "Dismiss",
      toState: "dismissed",
      reason: "User dismissed slice",
    },
  ],
  tombstoned: [
    {
      name: "recover",
      label: "Recover",
      toState: "recovered",
      reason: "User recovered tombstoned slice",
    },
  ],
  dismissed: [],
};

function formatAge(createdAtMs: number, nowMs = Date.now()): string {
  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function transitionHandler(
  onTransition: SlicePanelProps["onTransition"],
  action: SliceAction,
): JSX.EventHandler<HTMLButtonElement, MouseEvent> {
  return (event) => {
    event.stopPropagation();
    onTransition(action.toState, action.reason);
  };
}

function EntityRow(props: {
  entityId: string;
  index: number;
  section: SliceSection;
  resolveLabel?: SlicePanelProps["resolveLabel"];
  onEntityClick: SlicePanelProps["onEntityClick"];
}) {
  const resolvedLabel = createMemo(() => props.resolveLabel?.(props.entityId) ?? null);
  const displayLabel = createMemo(() => resolvedLabel() ?? props.entityId);
  const ariaLabel = createMemo(() => resolvedLabel() ?? `Entity ${props.entityId}`);

  const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    event.stopPropagation();
    props.onEntityClick(props.entityId, props.section);
  };

  return (
    <li class="slice-panel__entity-item">
      <button
        class="slice-panel__entity-row"
        data-testid={`slice-panel-${props.section}-row-${props.index}`}
        type="button"
        role="button"
        aria-label={ariaLabel()}
        title={displayLabel()}
        onClick={handleClick}
      >
        <span class="slice-panel__entity-label">{displayLabel()}</span>
      </button>
    </li>
  );
}

function EntitySection(props: {
  title: string;
  section: SliceSection;
  entityIds: readonly string[];
  resolveLabel?: SlicePanelProps["resolveLabel"];
  onEntityClick: SlicePanelProps["onEntityClick"];
}) {
  return (
    <section class="slice-panel__section" aria-labelledby={`slice-panel-${props.section}-heading`}>
      <h3 class="slice-panel__section-heading" id={`slice-panel-${props.section}-heading`}>
        {props.title} ({props.entityIds.length})
      </h3>
      <ul class="slice-panel__entity-list" role="list">
        <For each={props.entityIds}>
          {(entityId, index) => (
            <EntityRow
              entityId={entityId}
              index={index()}
              section={props.section}
              resolveLabel={props.resolveLabel}
              onEntityClick={props.onEntityClick}
            />
          )}
        </For>
      </ul>
    </section>
  );
}

export function SlicePanel(props: SlicePanelProps) {
  const actions = createMemo(() => ACTIONS_BY_STATE[props.slice.lifecycleState]);
  const createdAge = createMemo(() => formatAge(props.slice.createdAtMs));

  return (
    <section
      class="slice-panel"
      data-testid="slice-panel"
      role="region"
      aria-label={`Slice ${props.slice.query}`}
    >
      <header class="slice-panel__header" data-testid="slice-panel-header">
        <div class="slice-panel__header-main">
          <div class="slice-panel__title-line">
            <span class="slice-panel__title-prefix">Slice</span>
            <span class="slice-panel__separator" aria-hidden="true">
              {"\u2022"}
            </span>
            <span class="slice-panel__query" title={props.slice.query}>
              {props.slice.query}
            </span>
          </div>

          <div class="slice-panel__meta-line">
            <span
              class={`slice-panel__state slice-state--${props.slice.lifecycleState}`}
              data-testid="slice-panel-state-badge"
              aria-label={`Lifecycle: ${props.slice.lifecycleState}`}
            >
              {props.slice.lifecycleState}
            </span>
            <span class="slice-panel__separator" aria-hidden="true">
              {"\u2022"}
            </span>
            <span>{createdAge()}</span>
          </div>

          <div class="slice-panel__counts" role="status">
            <span>{props.slice.matchedEntityIds.length} matched</span>
            <span class="slice-panel__separator" aria-hidden="true">
              {"\u2022"}
            </span>
            <span>{props.slice.neighbourhoodEntityIds.length} adjacent</span>
          </div>
        </div>

        <div class="slice-panel__actions" aria-label={`Actions for ${props.slice.query}`}>
          <For each={actions()}>
            {(action) => (
              <button
                class="slice-panel__action-button"
                data-testid={`slice-panel-action-${action.name}`}
                type="button"
                onClick={transitionHandler(props.onTransition, action)}
              >
                {action.label}
              </button>
            )}
          </For>
        </div>
      </header>

      <div class="slice-panel__body">
        <EntitySection
          title="Matched"
          section="matched"
          entityIds={props.slice.matchedEntityIds}
          resolveLabel={props.resolveLabel}
          onEntityClick={props.onEntityClick}
        />
        <EntitySection
          title="Neighbourhood"
          section="neighbourhood"
          entityIds={props.slice.neighbourhoodEntityIds}
          resolveLabel={props.resolveLabel}
          onEntityClick={props.onEntityClick}
        />
      </div>
    </section>
  );
}
