import { expect, test } from "@playwright/test";

import {
  SLICE_ID_PATTERN,
  makeNeighbourhoodRule,
  makeSlice,
  neighbourhoodKindFromString,
  sliceLifecycleStateFromString,
  type NeighbourhoodKind,
  type NeighbourhoodRule,
  type Slice,
  type SliceLifecycleState,
} from "./slice";
import type { TrustSignal } from "./trust";

const CONTRACT_NEIGHBOURHOOD_KINDS = [
  ["DIRECT_NEIGHBOURS", "direct-neighbours"],
  ["TRANSITIVE_BY_EDGE_KIND", "transitive-by-edge-kind"],
  ["SHARED_BEHAVIOUR", "shared-behaviour"],
  ["SHARED_CONTAINER", "shared-container"],
  ["EXACT", "exact"],
] as const satisfies readonly (readonly [string, NeighbourhoodKind])[];

const CONTRACT_LIFECYCLE_STATES = [
  ["ACTIVE", "active"],
  ["PINNED", "pinned"],
  ["EXPIRING", "expiring"],
  ["TOMBSTONED", "tombstoned"],
  ["RECOVERED", "recovered"],
  ["DISMISSED", "dismissed"],
] as const satisfies readonly (readonly [string, SliceLifecycleState])[];

const CONTRACT_NEIGHBOURHOOD_KIND_VALUES = CONTRACT_NEIGHBOURHOOD_KINDS.map(
  ([, kind]) => kind,
);
const CONTRACT_LIFECYCLE_STATE_VALUES = CONTRACT_LIFECYCLE_STATES.map(
  ([, state]) => state,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type ContractNeighbourhoodKind = (typeof CONTRACT_NEIGHBOURHOOD_KINDS)[number][1];
type ContractSliceLifecycleState = (typeof CONTRACT_LIFECYCLE_STATES)[number][1];
type _NeighbourhoodKindMembership = Assert<
  Equal<NeighbourhoodKind, ContractNeighbourhoodKind>
>;
type _SliceLifecycleStateMembership = Assert<
  Equal<SliceLifecycleState, ContractSliceLifecycleState>
>;

const describe = test.describe;
const it = test;

function trust(): TrustSignal {
  return { state: "grounded", grounding: "lsp-type" };
}

function rule(overrides: Partial<NeighbourhoodRule> = {}): NeighbourhoodRule {
  return makeNeighbourhoodRule({
    kind: "exact",
    edgeKinds: [],
    maxHops: 0,
    ...overrides,
  });
}

function slice(overrides: Partial<Slice> = {}): Slice {
  return makeSlice({
    id: "slice:auth-search",
    query: "auth",
    matchedEntityIds: ["system:auth"],
    neighbourhoodEntityIds: ["module:auth.session"],
    rule: rule(),
    lifecycleState: "active",
    ttlMs: 1_700_000_900_000,
    createdBy: "you-this-session",
    createdAtMs: 1_700_000_000_000,
    pinnedAtMs: null,
    trust: trust(),
    ...overrides,
  });
}

describe("Slice schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_NEIGHBOURHOOD_KINDS) {
    it(`contains contract neighbourhood kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(neighbourhoodKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 5 contract neighbourhood kinds", () => {
    expect(CONTRACT_NEIGHBOURHOOD_KIND_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_NEIGHBOURHOOD_KIND_VALUES).size).toBe(5);
  });

  for (const [memberName, stateValue] of CONTRACT_LIFECYCLE_STATES) {
    it(`contains contract lifecycle state ${memberName} with stable string value ${stateValue}`, () => {
      expect(sliceLifecycleStateFromString(stateValue)).toBe(stateValue);
    });
  }

  it("contains exactly the 6 contract lifecycle states", () => {
    expect(CONTRACT_LIFECYCLE_STATE_VALUES).toHaveLength(6);
    expect(new Set(CONTRACT_LIFECYCLE_STATE_VALUES).size).toBe(6);
  });

  it("throws instead of silently accepting unknown neighbourhood kind strings", () => {
    for (const invalidValue of [
      "",
      "direct_neighbors",
      "DIRECT_NEIGHBOURS",
      "direct-neighbours ",
      "shared-container-extra",
    ]) {
      expect(
        () => neighbourhoodKindFromString(invalidValue),
        `neighbourhoodKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown lifecycle state strings", () => {
    for (const invalidValue of ["", "ACTIVE", "active ", "tombstone", "deleted"]) {
      expect(
        () => sliceLifecycleStateFromString(invalidValue),
        `sliceLifecycleStateFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid NeighbourhoodRule values", () => {
    for (const overrides of [
      { kind: "transitive-by-edge-kind", edgeKinds: [] },
      { kind: "transitive-by-edge-kind", edgeKinds: ["imports"], maxHops: 0 },
      { kind: "direct-neighbours", edgeKinds: ["imports"], maxHops: 0 },
      { kind: "direct-neighbours", maxHops: 2 },
    ] satisfies readonly Partial<NeighbourhoodRule>[]) {
      expect(() => rule(overrides)).toThrow();
    }
  });

  for (const sliceId of ["slice:auth", "slice:Foo_Bar-1.2"]) {
    it(`accepts contract slice id ${sliceId}`, () => {
      expect(SLICE_ID_PATTERN.test(sliceId)).toBe(true);
      expect(slice({ id: sliceId }).id).toBe(sliceId);
    });
  }

  for (const sliceId of [
    "",
    "auth",
    "slice:",
    "slice:has spaces",
    "slice:has/slash",
  ]) {
    it(`rejects contract-invalid slice id ${sliceId}`, () => {
      expect(SLICE_ID_PATTERN.test(sliceId)).toBe(false);
      expect(() => slice({ id: sliceId })).toThrow();
    });
  }

  it("rejects empty query and empty matched entity ids", () => {
    for (const overrides of [
      { query: "" },
      { matchedEntityIds: [] },
    ] satisfies readonly Partial<Slice>[]) {
      expect(() => slice(overrides)).toThrow();
    }
  });

  it("rejects neighbourhood duplicates and overlap with matched entity ids", () => {
    for (const neighbourhoodEntityIds of [
      ["module:auth.session", "module:auth.session"],
      ["system:auth", "module:auth.session"],
    ]) {
      expect(() => slice({ neighbourhoodEntityIds })).toThrow();
    }
  });

  it("rejects invalid lifecycle, ttl, and pinned combinations", () => {
    for (const overrides of [
      { lifecycleState: "pinned", ttlMs: 1_700_000_900_000 },
      { lifecycleState: "pinned", ttlMs: null },
      { lifecycleState: "active", ttlMs: null },
    ] satisfies readonly Partial<Slice>[]) {
      expect(() => slice(overrides)).toThrow();
    }
  });

  it("requires historical ttl for non-active, non-pinned lifecycle states", () => {
    for (const lifecycleState of [
      "expiring",
      "tombstoned",
      "recovered",
      "dismissed",
    ] as const satisfies readonly SliceLifecycleState[]) {
      expect(() => slice({ lifecycleState, ttlMs: null })).toThrow();
    }
  });

  it("rejects invalid created and pinned timestamps", () => {
    for (const overrides of [
      { createdAtMs: -1 },
      { pinnedAtMs: 1_699_999_999_999 },
    ] satisfies readonly Partial<Slice>[]) {
      expect(() => slice(overrides)).toThrow();
    }
  });

  it("accepts contract-valid pinned state", () => {
    const createdAtMs = 1_700_000_000_000;

    expect(
      slice({
        lifecycleState: "pinned",
        ttlMs: null,
        createdAtMs,
        pinnedAtMs: createdAtMs,
      }),
    ).toMatchObject({
      lifecycleState: "pinned",
      ttlMs: null,
      pinnedAtMs: createdAtMs,
    });
  });
});
