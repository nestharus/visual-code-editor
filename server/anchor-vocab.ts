/**
 * Server-side mirror of app/lib/anchor.ts.
 *
 * Keep the exported literal arrays byte-for-byte aligned with the app substrate;
 * e2e/anchor-vocab-parity.spec.ts pins this contract.
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

export const CONTAINER_ANCHOR_KINDS: readonly AnchorKind[] = [
  "node",
  "behaviour-card",
  "screen",
  "widget",
] as const;

const ANCHOR_KIND_SET: ReadonlySet<string> = new Set(ALL_ANCHOR_KINDS);
const SELECTION_MODE_SET: ReadonlySet<string> = new Set(ALL_SELECTION_MODES);
const CONTAINER_ANCHOR_KIND_SET: ReadonlySet<AnchorKind> = new Set(CONTAINER_ANCHOR_KINDS);

export function isAnchorKind(value: unknown): value is AnchorKind {
  return typeof value === "string" && ANCHOR_KIND_SET.has(value);
}

export function isSelectionMode(value: unknown): value is SelectionMode {
  return typeof value === "string" && SELECTION_MODE_SET.has(value);
}

export function isContainerAnchorKind(value: AnchorKind): boolean {
  return CONTAINER_ANCHOR_KIND_SET.has(value);
}
