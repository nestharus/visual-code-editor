/**
 * Solid-backed selection store for typed composer anchors.
 */

import { createSignal, type Accessor } from "solid-js";

import {
  makeSelectionScope,
  type AnchorKind,
  type SelectionItem,
  type SelectionMode,
  type SelectionScope,
} from "./anchor";

export const ALL_LINEAGE_EVENT_KINDS = [
  "same",
  "renamed",
  "split",
  "merged",
  "added",
  "removed",
  "unmatched",
] as const;

export type LineageEventKind = (typeof ALL_LINEAGE_EVENT_KINDS)[number];

export interface LineageEvent {
  kind: LineageEventKind;
  fromId: string;
  toIds: readonly string[];
  affectedKind: AnchorKind;
}

export interface FrozenLineageEvent {
  event: LineageEvent;
  previousSelection: SelectionScope;
  proposedSelection: SelectionScope;
}

export interface SelectionStore {
  selection: Accessor<SelectionScope>;
  frozen: Accessor<FrozenLineageEvent | null>;

  add(item: SelectionItem): void;
  remove(itemKey: { id: string; mode: SelectionMode }): void;
  replace(items: readonly SelectionItem[]): void;
  clear(): void;
  toggle(item: SelectionItem): void;

  notifyLineageEvent(event: LineageEvent): void;
  applyLineage(): void;
  dismissLineage(): void;
}

const FREEZING_LINEAGE_KINDS: ReadonlySet<LineageEventKind> = new Set([
  "renamed",
  "split",
  "merged",
  "removed",
  "unmatched",
]);

function selectionKey(item: Pick<SelectionItem, "id" | "mode">): string {
  return `${item.id}\u0000${item.mode}`;
}

function warnFrozenMutation(action: string): void {
  console.warn(`SelectionStore.${action} ignored while lineage event is frozen`);
}

function logObservedLineageEvent(event: LineageEvent): void {
  console.debug("SelectionStore observed lineage event without freezing", event);
}

function applyLineageToSelection(
  selection: SelectionScope,
  event: LineageEvent,
): SelectionScope {
  const nextItems = selection.items.flatMap((item): SelectionItem[] => {
    if (item.id !== event.fromId) {
      return [item];
    }

    if (event.kind === "renamed" || event.kind === "merged") {
      const nextId = event.toIds[0];
      return nextId === undefined ? [] : [{ ...item, id: nextId }];
    }

    if (event.kind === "split") {
      return event.toIds.map((id) => ({ ...item, id }));
    }

    if (event.kind === "removed" || event.kind === "unmatched") {
      return [];
    }

    return [item];
  });

  return makeSelectionScope(nextItems);
}

export function createSelectionStore(): SelectionStore {
  const [selection, setSelection] = createSignal<SelectionScope>(makeSelectionScope([]));
  const [frozen, setFrozen] = createSignal<FrozenLineageEvent | null>(null);

  function rejectIfFrozen(action: string): boolean {
    if (frozen() === null) {
      return false;
    }

    warnFrozenMutation(action);
    return true;
  }

  function add(item: SelectionItem): void {
    if (rejectIfFrozen("add")) {
      return;
    }

    const current = selection();
    if (current.items.some((existingItem) => selectionKey(existingItem) === selectionKey(item))) {
      return;
    }

    setSelection(makeSelectionScope([...current.items, item]));
  }

  function remove(itemKey: { id: string; mode: SelectionMode }): void {
    if (rejectIfFrozen("remove")) {
      return;
    }

    setSelection(
      makeSelectionScope(
        selection().items.filter((item) => selectionKey(item) !== selectionKey(itemKey)),
      ),
    );
  }

  function replace(items: readonly SelectionItem[]): void {
    if (rejectIfFrozen("replace")) {
      return;
    }

    setSelection(makeSelectionScope(items));
  }

  function clear(): void {
    if (rejectIfFrozen("clear")) {
      return;
    }

    setSelection(makeSelectionScope([]));
  }

  function toggle(item: SelectionItem): void {
    if (rejectIfFrozen("toggle")) {
      return;
    }

    const current = selection();
    if (current.items.some((existingItem) => selectionKey(existingItem) === selectionKey(item))) {
      setSelection(
        makeSelectionScope(
          current.items.filter((existingItem) => selectionKey(existingItem) !== selectionKey(item)),
        ),
      );
      return;
    }

    setSelection(makeSelectionScope([...current.items, item]));
  }

  function notifyLineageEvent(event: LineageEvent): void {
    if (frozen() !== null) {
      console.warn("SelectionStore.notifyLineageEvent ignored while lineage event is frozen");
      return;
    }

    const current = selection();
    const affectsSelection = current.items.some((item) => item.id === event.fromId);
    if (!FREEZING_LINEAGE_KINDS.has(event.kind) || !affectsSelection) {
      if (event.kind !== "same" && event.kind !== "added") {
        logObservedLineageEvent(event);
      }
      return;
    }

    setFrozen({
      event,
      previousSelection: current,
      proposedSelection: applyLineageToSelection(current, event),
    });
  }

  function applyLineage(): void {
    const currentFrozen = frozen();
    if (currentFrozen === null) {
      return;
    }

    setSelection(applyLineageToSelection(selection(), currentFrozen.event));
    setFrozen(null);
  }

  function dismissLineage(): void {
    setFrozen(null);
  }

  return {
    selection,
    frozen,
    add,
    remove,
    replace,
    clear,
    toggle,
    notifyLineageEvent,
    applyLineage,
    dismissLineage,
  };
}
