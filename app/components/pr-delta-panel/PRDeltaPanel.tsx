import { For, Show, createMemo, createSignal, type JSX } from "solid-js";

import { PairedGraphViewport } from "../../lib/paired-viewport/PairedGraphViewport";
import type { DeltaKind, EntityDelta, PRDeltaSet } from "../../lib/pr-delta";

import "./pr-delta-panel.css";

export interface PRDeltaPanelProps {
  deltaSet: PRDeltaSet;
  onEntityClick: (delta: EntityDelta, side: "base" | "head") => void;
  showUnchanged?: boolean;
}

type PaneSide = "base" | "head";

interface PaneRow {
  delta: EntityDelta;
  label: string;
}

function deltaLabel(kind: DeltaKind): string {
  return kind;
}

function rowsForDelta(delta: EntityDelta, side: PaneSide, showUnchanged: boolean): PaneRow[] {
  switch (delta.deltaKind) {
    case "added":
      return side === "head" && delta.headId !== null ? [{ delta, label: delta.headId }] : [];
    case "removed":
      return side === "base" && delta.baseId !== null ? [{ delta, label: delta.baseId }] : [];
    case "renamed":
    case "reshaped":
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
    case "unchanged":
      if (!showUnchanged) return [];
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
    case "split":
      if (side === "base") {
        return delta.baseId !== null ? [{ delta, label: delta.baseId }] : [];
      }
      return [
        ...(delta.headId !== null ? [{ delta, label: delta.headId }] : []),
        ...delta.relatedIds.map((relatedId) => ({ delta, label: relatedId })),
      ];
    case "merged":
      if (side === "head") {
        return delta.headId !== null ? [{ delta, label: delta.headId }] : [];
      }
      return [
        ...(delta.baseId !== null ? [{ delta, label: delta.baseId }] : []),
        ...delta.relatedIds.map((relatedId) => ({ delta, label: relatedId })),
      ];
    case "unmatched":
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
  }
}

function buildPaneRows(
  deltas: readonly EntityDelta[],
  side: PaneSide,
  showUnchanged: boolean,
): PaneRow[] {
  return deltas.flatMap((delta) => rowsForDelta(delta, side, showUnchanged));
}

function countDeltas(deltas: readonly EntityDelta[], kind: DeltaKind): number {
  return deltas.filter((delta) => delta.deltaKind === kind).length;
}

function PaneList(props: {
  rows: readonly PaneRow[];
  side: PaneSide;
  onEntityClick: PRDeltaPanelProps["onEntityClick"];
}) {
  const handleRowClick = (row: PaneRow): JSX.EventHandler<HTMLButtonElement, MouseEvent> => {
    return (event) => {
      event.stopPropagation();
      props.onEntityClick(row.delta, props.side);
    };
  };

  return (
    <section
      class="pr-delta-panel__pane"
      data-testid={`pr-delta-pane-${props.side}`}
    >
      <ul class="pr-delta-panel__list" role="list">
        <For each={props.rows}>
          {(row, index) => (
            <li class="pr-delta-panel__list-item">
              <button
                class="pr-delta-panel__row"
                classList={{ "is-unchanged": row.delta.deltaKind === "unchanged" }}
                data-testid={`pr-delta-row-${props.side}-${index()}`}
                type="button"
                role="button"
                aria-label={`${deltaLabel(row.delta.deltaKind)} ${row.delta.entityKind} ${row.label}`}
                onClick={handleRowClick(row)}
              >
                <span
                  class={`pr-delta-panel__chip delta-chip delta-chip--${row.delta.deltaKind}`}
                  data-testid={`pr-delta-chip-${props.side}-${index()}`}
                >
                  {row.delta.deltaKind}
                </span>
                <span class="pr-delta-panel__entity-label" title={row.label}>
                  {row.label}
                </span>
                <span class="pr-delta-panel__entity-kind">{row.delta.entityKind}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

export function PRDeltaPanel(props: PRDeltaPanelProps) {
  const [showUnchanged, setShowUnchanged] = createSignal(props.showUnchanged ?? false);

  const addedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "added"));
  const removedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "removed"));
  const reshapedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "reshaped"));
  const baseRows = createMemo(() =>
    buildPaneRows(props.deltaSet.deltas, "base", showUnchanged()),
  );
  const headRows = createMemo(() =>
    buildPaneRows(props.deltaSet.deltas, "head", showUnchanged()),
  );

  const handleShowUnchanged: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    event.stopPropagation();
    setShowUnchanged(event.currentTarget.checked);
  };

  return (
    <section
      class="pr-delta-panel"
      data-testid="pr-delta-panel"
      role="region"
      aria-label={`PR delta — ${props.deltaSet.baseBranch} to ${props.deltaSet.headBranch}`}
    >
      <header class="pr-delta-panel__header" data-testid="pr-delta-header">
        <div class="pr-delta-panel__header-main">
          <div class="pr-delta-panel__branches">
            <span class="pr-delta-panel__branch" title={props.deltaSet.baseBranch}>
              {props.deltaSet.baseBranch}
            </span>
            <span class="pr-delta-panel__arrow" aria-hidden="true">
              →
            </span>
            <span class="pr-delta-panel__branch" title={props.deltaSet.headBranch}>
              {props.deltaSet.headBranch}
            </span>
            <Show when={props.deltaSet.prNumber !== null}>
              <span class="pr-delta-panel__pr-badge">#{props.deltaSet.prNumber}</span>
            </Show>
          </div>
          <div
            class="pr-delta-panel__counts"
            data-testid="pr-delta-counts"
            role="status"
            aria-label={`${addedCount()} added, ${removedCount()} removed, ${reshapedCount()} reshaped`}
          >
            {addedCount()} + / {removedCount()} - / {reshapedCount()} ~
          </div>
        </div>

        <label class="pr-delta-panel__toggle">
          <input
            data-testid="pr-delta-show-unchanged"
            type="checkbox"
            checked={showUnchanged()}
            onChange={handleShowUnchanged}
            onClick={(event) => event.stopPropagation()}
          />
          <span>Show unchanged</span>
        </label>
      </header>

      <div class="pr-delta-panel__viewport">
        <PairedGraphViewport
          ariaLabel="PR delta entity panes"
          leftLabel="Base entities"
          rightLabel="Head entities"
          left={
            <PaneList rows={baseRows()} side="base" onEntityClick={props.onEntityClick} />
          }
          right={
            <PaneList rows={headRows()} side="head" onEntityClick={props.onEntityClick} />
          }
        />
      </div>
    </section>
  );
}
