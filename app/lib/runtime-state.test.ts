import { expect, test } from "@playwright/test";

import {
  RUNTIME_STATE_CAPTURE_ID_PATTERN,
  makeRuntimeStateCapture,
  makeRuntimeStateNode,
  runtimeStateKindFromString,
  runtimeStateNodeKindFromString,
  type RuntimeStateCapture,
  type RuntimeStateKind,
  type RuntimeStateNode,
  type RuntimeStateNodeKind,
} from "./runtime-state";
import { makeTrustSignal } from "./trust";

const CONTRACT_RUNTIME_STATE_KINDS = [
  ["COMPONENT_TREE", "component-tree"],
  ["PROPS_ONLY", "props-only"],
  ["SIGNAL_GRAPH", "signal-graph"],
  ["NETWORK_LOG", "network-log"],
  ["CONSOLE_LOG", "console-log"],
  ["DOM_SNAPSHOT", "dom-snapshot"],
] as const satisfies readonly (readonly [string, RuntimeStateKind])[];

const CONTRACT_RUNTIME_STATE_NODE_KINDS = [
  ["COMPONENT", "component"],
  ["ELEMENT", "element"],
  ["TEXT", "text"],
  ["FRAGMENT", "fragment"],
  ["PORTAL", "portal"],
] as const satisfies readonly (readonly [string, RuntimeStateNodeKind])[];

const CONTRACT_RUNTIME_STATE_KIND_VALUES = CONTRACT_RUNTIME_STATE_KINDS.map(
  ([, kind]) => kind,
);
const CONTRACT_RUNTIME_STATE_NODE_KIND_VALUES =
  CONTRACT_RUNTIME_STATE_NODE_KINDS.map(([, kind]) => kind);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type ContractRuntimeStateKind = (typeof CONTRACT_RUNTIME_STATE_KINDS)[number][1];
type ContractRuntimeStateNodeKind =
  (typeof CONTRACT_RUNTIME_STATE_NODE_KINDS)[number][1];
type _RuntimeStateKindMembership = Assert<
  Equal<RuntimeStateKind, ContractRuntimeStateKind>
>;
type _RuntimeStateNodeKindMembership = Assert<
  Equal<RuntimeStateNodeKind, ContractRuntimeStateNodeKind>
>;

const describe = test.describe;
const it = test;

function node(overrides: Partial<RuntimeStateNode> = {}): RuntimeStateNode {
  return makeRuntimeStateNode({
    kind: "component",
    name: "GraphCanvas",
    propsSummary: "nodes=12 edges=18",
    childrenCount: 3,
    ...overrides,
  });
}

function capture(
  overrides: Partial<RuntimeStateCapture> = {},
): RuntimeStateCapture {
  return makeRuntimeStateCapture({
    id: "runtime-capture:graph.canvas.1700000000000",
    widgetId: "widget:graph.canvas",
    screenId: null,
    kind: "component-tree",
    nodes: [node()],
    rawPayloadPath: null,
    trust: makeTrustSignal("candidate", null),
    attributionActor: "generator",
    capturedAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

describe("RuntimeStateCapture schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_RUNTIME_STATE_KINDS) {
    it(`contains contract runtime state kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(runtimeStateKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, kindValue] of CONTRACT_RUNTIME_STATE_NODE_KINDS) {
    it(`contains contract runtime state node kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(runtimeStateNodeKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 6 contract runtime state kinds", () => {
    expect(CONTRACT_RUNTIME_STATE_KIND_VALUES).toHaveLength(6);
    expect(new Set(CONTRACT_RUNTIME_STATE_KIND_VALUES).size).toBe(6);
  });

  it("contains exactly the 5 contract runtime state node kinds", () => {
    expect(CONTRACT_RUNTIME_STATE_NODE_KIND_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_RUNTIME_STATE_NODE_KIND_VALUES).size).toBe(5);
  });

  it("throws instead of silently accepting unknown runtime state kind strings", () => {
    for (const invalidValue of [
      "",
      "COMPONENT_TREE",
      "component_tree",
      "component-tree ",
      "screen",
    ]) {
      expect(
        () => runtimeStateKindFromString(invalidValue),
        `runtimeStateKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown runtime state node kind strings", () => {
    for (const invalidValue of [
      "",
      "COMPONENT",
      "component ",
      "component-tree",
      "node",
    ]) {
      expect(
        () => runtimeStateNodeKindFromString(invalidValue),
        `runtimeStateNodeKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the runtime capture pattern", () => {
    for (const captureId of [
      "runtime-capture:graph.canvas",
      "runtime-capture:Screen_123",
      "runtime-capture:system-card.1700000000000",
    ]) {
      expect(RUNTIME_STATE_CAPTURE_ID_PATTERN.test(captureId)).toBe(true);
      expect(capture({ id: captureId }).id).toBe(captureId);
    }
  });

  it("rejects ids outside the runtime capture pattern", () => {
    for (const captureId of [
      "",
      "graph.canvas",
      "runtime-capture:",
      "Runtime-capture:graph",
      "runtime-capture:has spaces",
      "runtime-capture:graph/canvas",
    ]) {
      expect(RUNTIME_STATE_CAPTURE_ID_PATTERN.test(captureId)).toBe(false);
      expect(() => capture({ id: captureId })).toThrow();
    }
  });

  it("requires at least one capture anchor", () => {
    expect(capture({ widgetId: "widget:graph.canvas", screenId: null })).toMatchObject({
      widgetId: "widget:graph.canvas",
      screenId: null,
    });
    expect(capture({ widgetId: null, screenId: "screen:overview" })).toMatchObject({
      widgetId: null,
      screenId: "screen:overview",
    });
    expect(
      capture({
        widgetId: "widget:graph.canvas",
        screenId: "screen:overview",
      }),
    ).toMatchObject({
      widgetId: "widget:graph.canvas",
      screenId: "screen:overview",
    });

    expect(() => capture({ widgetId: null, screenId: null })).toThrow();
  });

  it("rejects runtime state nodes with empty names or props summaries", () => {
    for (const overrides of [
      { name: "" },
      { name: "   " },
      { propsSummary: "" },
      { propsSummary: "   " },
    ] satisfies readonly Partial<RuntimeStateNode>[]) {
      expect(() => node(overrides)).toThrow();
    }
  });

  it("rejects negative runtime state node children counts", () => {
    expect(node({ childrenCount: 0 }).childrenCount).toBe(0);
    expect(() => node({ childrenCount: -1 })).toThrow();
  });

  it("inherits the trust signal iff grounding invariant", () => {
    expect(
      capture({
        trust: makeTrustSignal("grounded", "user-confirmed"),
      }).trust,
    ).toEqual({
      state: "grounded",
      grounding: "user-confirmed",
    });

    expect(() =>
      capture({
        trust: { state: "grounded", grounding: null },
      }),
    ).toThrow();
    expect(() =>
      capture({
        trust: { state: "candidate", grounding: "test" },
      }),
    ).toThrow();
  });
});
