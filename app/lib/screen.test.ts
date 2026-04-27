import { expect, test } from "@playwright/test";

import {
  SCREEN_EDGE_ID_PATTERN,
  SCREEN_ID_PATTERN,
  makeScreen,
  makeScreenEdge,
  screenEdgeKindFromString,
  screenEdgeTriggerFromString,
  screenKindFromString,
  type Screen,
  type ScreenEdge,
  type ScreenEdgeKind,
  type ScreenEdgeTrigger,
  type ScreenKind,
} from "./screen";
import { makeTrustSignal } from "./trust";

const CONTRACT_SCREEN_KINDS = [
  ["PAGE", "page"],
  ["MODAL", "modal"],
  ["OVERLAY", "overlay"],
  ["DIALOG", "dialog"],
  ["POPOVER", "popover"],
  ["DRAWER", "drawer"],
  ["SIDEPANEL", "sidepanel"],
  ["TOAST", "toast"],
] as const satisfies readonly (readonly [string, ScreenKind])[];

const CONTRACT_SCREEN_EDGE_KINDS = [
  ["NAVIGATE", "navigate"],
  ["OPEN_MODAL", "open-modal"],
  ["CLOSE_MODAL", "close-modal"],
  ["PUSH", "push"],
  ["POP", "pop"],
  ["REPLACE", "replace"],
  ["REDIRECT", "redirect"],
  ["USER_BACK", "user-back"],
] as const satisfies readonly (readonly [string, ScreenEdgeKind])[];

const CONTRACT_SCREEN_EDGE_TRIGGERS = [
  ["CLICK", "click"],
  ["KEYBOARD", "keyboard"],
  ["AUTO", "auto"],
  ["ROUTE", "route"],
  ["PARENT_REQUEST", "parent-request"],
] as const satisfies readonly (readonly [string, ScreenEdgeTrigger])[];

const CONTRACT_SCREEN_KIND_VALUES = CONTRACT_SCREEN_KINDS.map(([, kind]) => kind);
const CONTRACT_SCREEN_EDGE_KIND_VALUES = CONTRACT_SCREEN_EDGE_KINDS.map(
  ([, kind]) => kind,
);
const CONTRACT_SCREEN_EDGE_TRIGGER_VALUES = CONTRACT_SCREEN_EDGE_TRIGGERS.map(
  ([, trigger]) => trigger,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractScreenKind = (typeof CONTRACT_SCREEN_KINDS)[number][1];
type ContractScreenEdgeKind = (typeof CONTRACT_SCREEN_EDGE_KINDS)[number][1];
type ContractScreenEdgeTrigger =
  (typeof CONTRACT_SCREEN_EDGE_TRIGGERS)[number][1];
type _ScreenKindMembership = Assert<Equal<ScreenKind, ContractScreenKind>>;
type _ScreenEdgeKindMembership = Assert<
  Equal<ScreenEdgeKind, ContractScreenEdgeKind>
>;
type _ScreenEdgeTriggerMembership = Assert<
  Equal<ScreenEdgeTrigger, ContractScreenEdgeTrigger>
>;

const describe = test.describe;
const it = test;

function screen(overrides: Partial<Screen> = {}): Screen {
  return makeScreen({
    id: "screen:overview",
    label: "Overview",
    kind: "page",
    route: "/",
    widgetIds: ["widget:nav.primary", "widget:graph.canvas"],
    trust: makeTrustSignal("candidate", null),
    attributionActor: "generator",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function screenEdge(overrides: Partial<ScreenEdge> = {}): ScreenEdge {
  return makeScreenEdge({
    id: "screen-edge:overview-to-detail",
    fromScreenId: "screen:overview",
    toScreenId: "screen:detail",
    kind: "navigate",
    trigger: "click",
    trust: makeTrustSignal("candidate", null),
    attributionActor: "generator",
    observedAtMs: 1_700_000_001_000,
    ...overrides,
  });
}

describe("Screen schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_SCREEN_KINDS) {
    it(`contains contract screen kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(screenKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, kindValue] of CONTRACT_SCREEN_EDGE_KINDS) {
    it(`contains contract screen edge kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(screenEdgeKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, triggerValue] of CONTRACT_SCREEN_EDGE_TRIGGERS) {
    it(`contains contract screen edge trigger ${memberName} with stable string value ${triggerValue}`, () => {
      expect(screenEdgeTriggerFromString(triggerValue)).toBe(triggerValue);
    });
  }

  it("contains exactly the 8 contract screen kinds", () => {
    expect(CONTRACT_SCREEN_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_SCREEN_KIND_VALUES).size).toBe(8);
  });

  it("contains exactly the 8 contract screen edge kinds", () => {
    expect(CONTRACT_SCREEN_EDGE_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_SCREEN_EDGE_KIND_VALUES).size).toBe(8);
  });

  it("contains exactly the 5 contract screen edge triggers", () => {
    expect(CONTRACT_SCREEN_EDGE_TRIGGER_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_SCREEN_EDGE_TRIGGER_VALUES).size).toBe(5);
  });

  it("throws instead of silently accepting unknown screen kind strings", () => {
    for (const invalidValue of ["", "PAGE", "screen", "page ", "modal "]) {
      expect(
        () => screenKindFromString(invalidValue),
        `screenKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown screen edge kind strings", () => {
    for (const invalidValue of [
      "",
      "NAVIGATE",
      "open_modal",
      "navigate ",
      "click",
    ]) {
      expect(
        () => screenEdgeKindFromString(invalidValue),
        `screenEdgeKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown screen edge trigger strings", () => {
    for (const invalidValue of [
      "",
      "CLICK",
      "parent_request",
      "route ",
      "navigate",
    ]) {
      expect(
        () => screenEdgeTriggerFromString(invalidValue),
        `screenEdgeTriggerFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the screen pattern", () => {
    for (const screenId of [
      "screen:overview",
      "screen:Screen_123",
      "screen:system-card",
    ]) {
      expect(SCREEN_ID_PATTERN.test(screenId)).toBe(true);
      expect(screen({ id: screenId }).id).toBe(screenId);
    }
  });

  it("rejects ids outside the screen pattern", () => {
    for (const screenId of [
      "",
      "overview",
      "screen:",
      "Screen:overview",
      "screen:has spaces",
      "screen:overview/main",
    ]) {
      expect(SCREEN_ID_PATTERN.test(screenId)).toBe(false);
      expect(() => screen({ id: screenId })).toThrow();
    }
  });

  it("rejects empty screen labels", () => {
    for (const label of ["", "   ", "\n\t"]) {
      expect(() => screen({ label })).toThrow();
    }
  });

  it("dedupes screen widget ids in order", () => {
    expect(
      screen({
        widgetIds: [
          "widget:nav.primary",
          "widget:graph.canvas",
          "widget:nav.primary",
          "widget:detail-panel",
        ],
      }).widgetIds,
    ).toEqual(["widget:nav.primary", "widget:graph.canvas", "widget:detail-panel"]);
  });

  it("rejects widget ids outside the widget pattern", () => {
    for (const widgetId of [
      "",
      "nav.primary",
      "widget:",
      "Widget:button",
      "widget:has spaces",
      "widget:button/primary",
    ]) {
      expect(() => screen({ widgetIds: ["widget:nav.primary", widgetId] })).toThrow();
    }
  });

  it("accepts ids matching the screen edge pattern", () => {
    for (const edgeId of [
      "screen-edge:overview-to-detail",
      "screen-edge:Screen_123",
      "screen-edge:system-card",
    ]) {
      expect(SCREEN_EDGE_ID_PATTERN.test(edgeId)).toBe(true);
      expect(screenEdge({ id: edgeId }).id).toBe(edgeId);
    }
  });

  it("rejects ids outside the screen edge pattern", () => {
    for (const edgeId of [
      "",
      "overview-to-detail",
      "screen-edge:",
      "Screen-edge:overview",
      "screen-edge:has spaces",
      "screen-edge:overview/detail",
    ]) {
      expect(SCREEN_EDGE_ID_PATTERN.test(edgeId)).toBe(false);
      expect(() => screenEdge({ id: edgeId })).toThrow();
    }
  });

  it("rejects edge endpoint ids outside the screen pattern", () => {
    for (const screenId of [
      "",
      "overview",
      "screen:",
      "Screen:overview",
      "screen:has spaces",
      "screen:overview/main",
    ]) {
      expect(() => screenEdge({ fromScreenId: screenId })).toThrow();
      expect(() => screenEdge({ toScreenId: screenId })).toThrow();
    }
  });

  it("allows self-loop screen edges", () => {
    const edge = screenEdge({
      fromScreenId: "screen:overview",
      toScreenId: "screen:overview",
      kind: "replace",
    });

    expect(edge.fromScreenId).toBe("screen:overview");
    expect(edge.toScreenId).toBe("screen:overview");
  });
});
