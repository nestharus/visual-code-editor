import { expect, test } from "@playwright/test";

import { makeTrustSignal } from "./trust";
import {
  VARIANT_TOPOLOGY_ID_PATTERN,
  makeVariantAxis,
  makeVariantCell,
  makeVariantTopology,
  variantAxisKindFromString,
  variantCellStateFromString,
  type VariantAxis,
  type VariantAxisKind,
  type VariantCell,
  type VariantCellState,
  type VariantTopology,
} from "./variant-topology";

const CONTRACT_AXIS_KINDS = [
  ["PROP", "prop"],
  ["THEME", "theme"],
  ["LOCALE", "locale"],
  ["DENSITY", "density"],
  ["A11Y_STATE", "a11y-state"],
  ["IMPLIED_STATE", "implied-state"],
  ["VIEWPORT", "viewport"],
] as const satisfies readonly (readonly [string, VariantAxisKind])[];

const CONTRACT_CELL_STATES = [
  ["GROUNDED", "grounded"],
  ["CANDIDATE", "candidate"],
  ["MISSING", "missing"],
  ["IMPLIED", "implied"],
] as const satisfies readonly (readonly [string, VariantCellState])[];

const CONTRACT_AXIS_KIND_VALUES = CONTRACT_AXIS_KINDS.map(([, kind]) => kind);
const CONTRACT_CELL_STATE_VALUES = CONTRACT_CELL_STATES.map(([, state]) => state);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type ContractAxisKind = (typeof CONTRACT_AXIS_KINDS)[number][1];
type ContractCellState = (typeof CONTRACT_CELL_STATES)[number][1];
type _VariantAxisKindMembership = Assert<Equal<VariantAxisKind, ContractAxisKind>>;
type _VariantCellStateMembership = Assert<Equal<VariantCellState, ContractCellState>>;

const describe = test.describe;
const it = test;

function axis(overrides: Partial<VariantAxis> = {}): VariantAxis {
  return makeVariantAxis({
    kind: "prop",
    name: "size",
    values: ["small", "large"],
    ...overrides,
  });
}

function cell(overrides: Partial<VariantCell> = {}): VariantCell {
  return makeVariantCell({
    coordinates: { size: "small" },
    state: "candidate",
    evidenceRenderIds: [],
    trust: makeTrustSignal("candidate", null),
    ...overrides,
  });
}

function topology(overrides: Partial<VariantTopology> = {}): VariantTopology {
  return makeVariantTopology({
    id: "variant-topology:button.primary",
    widgetId: "widget:button.primary",
    axes: [axis()],
    cells: [cell()],
    computedAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

describe("VariantTopology schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_AXIS_KINDS) {
    it(`contains contract variant axis kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(variantAxisKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, stateValue] of CONTRACT_CELL_STATES) {
    it(`contains contract variant cell state ${memberName} with stable string value ${stateValue}`, () => {
      expect(variantCellStateFromString(stateValue)).toBe(stateValue);
    });
  }

  it("contains exactly the 7 contract variant axis kinds", () => {
    expect(CONTRACT_AXIS_KIND_VALUES).toHaveLength(7);
    expect(new Set(CONTRACT_AXIS_KIND_VALUES).size).toBe(7);
  });

  it("contains exactly the 4 contract variant cell states", () => {
    expect(CONTRACT_CELL_STATE_VALUES).toHaveLength(4);
    expect(new Set(CONTRACT_CELL_STATE_VALUES).size).toBe(4);
  });

  it("throws instead of silently accepting unknown variant axis kind strings", () => {
    for (const invalidValue of ["", "PROP", "a11y_state", "viewport ", "state"]) {
      expect(
        () => variantAxisKindFromString(invalidValue),
        `variantAxisKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown variant cell state strings", () => {
    for (const invalidValue of [
      "",
      "GROUNDED",
      "not-covered",
      "candidate ",
      "covered",
    ]) {
      expect(
        () => variantCellStateFromString(invalidValue),
        `variantCellStateFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the variant topology pattern", () => {
    for (const topologyId of [
      "variant-topology:button.primary",
      "variant-topology:Button_123",
      "variant-topology:system-card",
    ]) {
      expect(VARIANT_TOPOLOGY_ID_PATTERN.test(topologyId)).toBe(true);
      expect(topology({ id: topologyId }).id).toBe(topologyId);
    }
  });

  it("rejects ids outside the variant topology pattern", () => {
    for (const topologyId of [
      "",
      "button.primary",
      "variant-topology:",
      "Variant-topology:button",
      "variant-topology:has spaces",
      "variant-topology:button/primary",
    ]) {
      expect(VARIANT_TOPOLOGY_ID_PATTERN.test(topologyId)).toBe(false);
      expect(() => topology({ id: topologyId })).toThrow();
    }
  });

  it("rejects widget ids outside the widget pattern", () => {
    for (const widgetId of [
      "",
      "button.primary",
      "widget:",
      "Widget:button",
      "widget:has spaces",
      "widget:button/primary",
    ]) {
      expect(() => topology({ widgetId })).toThrow();
    }
  });

  it("requires at least one axis", () => {
    expect(() => topology({ axes: [] })).toThrow();
  });

  it("rejects empty axis names", () => {
    for (const name of ["", "   ", "\n\t"]) {
      expect(() => axis({ name })).toThrow();
    }
  });

  it("rejects empty axis values", () => {
    expect(() => axis({ values: [] })).toThrow();
  });

  it("rejects duplicated axis values", () => {
    expect(() => axis({ values: ["small", "small"] })).toThrow();
  });

  it("requires cell coordinates to cover every axis", () => {
    const axes = [
      axis({ name: "size", values: ["small", "large"] }),
      axis({ kind: "theme", name: "theme", values: ["dark", "light"] }),
    ];

    expect(() =>
      topology({
        axes,
        cells: [cell({ coordinates: { size: "small" } })],
      }),
    ).toThrow();
  });

  it("requires cell coordinate values to exist on the matching axis", () => {
    expect(() =>
      topology({
        axes: [axis({ name: "size", values: ["small", "large"] })],
        cells: [cell({ coordinates: { size: "medium" } })],
      }),
    ).toThrow();
  });

  it("requires evidence render ids to match the render id pattern", () => {
    expect(
      cell({
        state: "grounded",
        evidenceRenderIds: ["render:button.primary.desktop"],
      }).evidenceRenderIds,
    ).toEqual(["render:button.primary.desktop"]);

    expect(() =>
      cell({
        state: "grounded",
        evidenceRenderIds: ["button.primary.desktop"],
      }),
    ).toThrow();
  });

  it("allows non-empty evidence render ids only when grounded", () => {
    expect(
      cell({
        state: "grounded",
        evidenceRenderIds: ["render:button.primary.desktop"],
      }).evidenceRenderIds,
    ).toEqual(["render:button.primary.desktop"]);

    for (const state of ["candidate", "missing", "implied"] as const) {
      expect(() =>
        cell({
          state,
          evidenceRenderIds: ["render:button.primary.desktop"],
        }),
      ).toThrow();
    }
  });

  it("inherits the trust signal iff grounding invariant", () => {
    expect(
      cell({
        trust: makeTrustSignal("grounded", "user-confirmed"),
      }).trust,
    ).toEqual({
      state: "grounded",
      grounding: "user-confirmed",
    });

    expect(() =>
      cell({
        trust: { state: "grounded", grounding: null },
      }),
    ).toThrow();
  });
});
