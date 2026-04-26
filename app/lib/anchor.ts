/**
 * Canonical anchor and selection vocabulary for composer context.
 */

export const ALL_ANCHOR_KINDS = [
  "node",
  "edge",
  "code-block",
  "section",
  "behaviour-card",
  "task",
  "pr-delta",
  "selection-box",
  "slice",
  "screen",
  "widget",
] as const;

export type AnchorKind = (typeof ALL_ANCHOR_KINDS)[number];

export const ALL_SELECTION_MODES = ["entity", "contents"] as const;

export type SelectionMode = (typeof ALL_SELECTION_MODES)[number];

export interface SelectionItem {
  id: string;
  kind: AnchorKind;
  mode: SelectionMode;
}

export interface SelectionScope {
  items: readonly SelectionItem[];
  primaryAnchor: AnchorKind | null;
}

export interface AnchorContext {
  selection: SelectionScope;
  surfaceAnchor: AnchorKind;
}

export const CONTAINER_ANCHOR_KINDS: readonly AnchorKind[] = [
  "node",
  "behaviour-card",
  "screen",
  "widget",
] as const;

const ANCHOR_KIND_SET: ReadonlySet<string> = new Set(ALL_ANCHOR_KINDS);
const SELECTION_MODE_SET: ReadonlySet<string> = new Set(ALL_SELECTION_MODES);
const CONTAINER_ANCHOR_KIND_SET: ReadonlySet<AnchorKind> = new Set(CONTAINER_ANCHOR_KINDS);

export function anchorKindFromString(value: string): AnchorKind {
  if (ANCHOR_KIND_SET.has(value)) {
    return value as AnchorKind;
  }

  throw new Error(`Unknown anchor kind: ${value}`);
}

export function selectionModeFromString(value: string): SelectionMode {
  if (SELECTION_MODE_SET.has(value)) {
    return value as SelectionMode;
  }

  throw new Error(`Unknown selection mode: ${value}`);
}

export function makeSelectionItem(
  id: string,
  kind: AnchorKind,
  mode: SelectionMode,
): SelectionItem {
  if (mode === "contents" && !CONTAINER_ANCHOR_KIND_SET.has(kind)) {
    throw new Error("SelectionMode.CONTENTS is only valid for container anchor kinds");
  }

  return { id, kind, mode };
}

export function makeSelectionScope(items: readonly SelectionItem[]): SelectionScope {
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.id}\u0000${item.mode}`;
    if (seen.has(key)) {
      throw new Error("SelectionScope items must be unique by (id, mode)");
    }
    seen.add(key);
  }

  return {
    items,
    primaryAnchor: items.length > 0 ? items[items.length - 1].kind : null,
  };
}
