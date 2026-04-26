import { expect, test } from "@playwright/test";

import {
  ALL_ANCHOR_KINDS,
  ALL_SELECTION_MODES,
  CONTAINER_ANCHOR_KINDS,
  anchorKindFromString,
  makeSelectionItem,
  makeSelectionScope,
  selectionModeFromString,
  type AnchorContext,
  type AnchorKind,
  type SelectionMode,
} from "./anchor";

const CONTRACT_ANCHOR_KINDS = [
  ["NODE", "node"],
  ["EDGE", "edge"],
  ["CODE_BLOCK", "code-block"],
  ["SECTION", "section"],
  ["BEHAVIOUR_CARD", "behaviour-card"],
  ["TASK", "task"],
  ["PR_DELTA", "pr-delta"],
  ["SELECTION_BOX", "selection-box"],
  ["SLICE", "slice"],
  ["SCREEN", "screen"],
  ["WIDGET", "widget"],
] as const satisfies readonly (readonly [string, AnchorKind])[];

const CONTRACT_SELECTION_MODES = [
  ["ENTITY", "entity"],
  ["CONTENTS", "contents"],
] as const satisfies readonly (readonly [string, SelectionMode])[];

const CONTRACT_ANCHOR_VALUES = CONTRACT_ANCHOR_KINDS.map(([, kind]) => kind);
const CONTRACT_SELECTION_MODE_VALUES = CONTRACT_SELECTION_MODES.map(([, mode]) => mode);
const CONTRACT_CONTAINER_ANCHOR_KINDS: readonly AnchorKind[] = [
  "node",
  "behaviour-card",
  "screen",
  "widget",
];

const describe = test.describe;
const it = test;

describe("Anchor vocabulary contract", () => {
  for (const [memberName, kindValue] of CONTRACT_ANCHOR_KINDS) {
    it(`contains contract anchor kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(ALL_ANCHOR_KINDS).toContain(kindValue);
      expect(anchorKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, modeValue] of CONTRACT_SELECTION_MODES) {
    it(`contains contract selection mode ${memberName} with stable string value ${modeValue}`, () => {
      expect(ALL_SELECTION_MODES).toContain(modeValue);
      expect(selectionModeFromString(modeValue)).toBe(modeValue);
    });
  }

  it("contains exactly the 11 contract anchor kinds", () => {
    expect(ALL_ANCHOR_KINDS).toHaveLength(11);
    expect(ALL_ANCHOR_KINDS).toEqual(CONTRACT_ANCHOR_VALUES);
  });

  it("contains exactly the 2 contract selection modes", () => {
    expect(ALL_SELECTION_MODES).toHaveLength(2);
    expect(ALL_SELECTION_MODES).toEqual(CONTRACT_SELECTION_MODE_VALUES);
  });

  it("throws instead of silently accepting unknown anchor kind strings", () => {
    expect(() => anchorKindFromString("button")).toThrow();
  });

  it("throws instead of silently accepting unknown selection mode strings", () => {
    expect(() => selectionModeFromString("entity-and-contents")).toThrow();
  });

  for (const [memberName, kindValue] of CONTRACT_ANCHOR_KINDS) {
    it(`accepts entity mode for ${memberName}`, () => {
      expect(makeSelectionItem(`${kindValue}-entity`, kindValue, "entity")).toEqual({
        id: `${kindValue}-entity`,
        kind: kindValue,
        mode: "entity",
      });
    });
  }

  for (const [memberName, kindValue] of CONTRACT_ANCHOR_KINDS) {
    it(`enforces contents mode container restriction for ${memberName}`, () => {
      if (CONTRACT_CONTAINER_ANCHOR_KINDS.includes(kindValue)) {
        expect(makeSelectionItem(`${kindValue}-contents`, kindValue, "contents")).toEqual({
          id: `${kindValue}-contents`,
          kind: kindValue,
          mode: "contents",
        });
        return;
      }

      expect(() => makeSelectionItem(`${kindValue}-contents`, kindValue, "contents")).toThrow();
    });
  }

  it("rejects duplicate SelectionScope id and mode pairs", () => {
    const first = makeSelectionItem("same", "node", "entity");
    const duplicatePair = makeSelectionItem("same", "edge", "entity");

    expect(() => makeSelectionScope([first, duplicatePair])).toThrow();
  });

  it("allows the same SelectionScope id with different modes", () => {
    const entityItem = makeSelectionItem("same", "node", "entity");
    const contentsItem = makeSelectionItem("same", "node", "contents");

    expect(makeSelectionScope([entityItem, contentsItem])).toEqual({
      items: [entityItem, contentsItem],
      primaryAnchor: "node",
    });
  });

  it("sets SelectionScope primaryAnchor to null for empty scopes", () => {
    expect(makeSelectionScope([])).toEqual({
      items: [],
      primaryAnchor: null,
    });
  });

  it("sets SelectionScope primaryAnchor from the last item", () => {
    const first = makeSelectionItem("first", "node", "entity");
    const last = makeSelectionItem("last", "widget", "contents");

    expect(makeSelectionScope([first, last])).toEqual({
      items: [first, last],
      primaryAnchor: "widget",
    });
  });

  it("keeps AnchorContext surfaceAnchor independent of selection primaryAnchor", () => {
    const selection = makeSelectionScope([makeSelectionItem("selected-node", "node", "entity")]);
    const context = {
      selection,
      surfaceAnchor: "section",
    } satisfies AnchorContext;

    expect(context.selection.primaryAnchor).toBe("node");
    expect(context.surfaceAnchor).toBe("section");
  });

  it("keeps CONTAINER_ANCHOR_KINDS exactly to node, behaviour-card, screen, and widget", () => {
    expect(new Set(CONTAINER_ANCHOR_KINDS)).toEqual(new Set(CONTRACT_CONTAINER_ANCHOR_KINDS));
  });
});
