import { expect, test } from "@playwright/test";

import {
  PR_DELTA_ID_PATTERN,
  deltaKindFromString,
  entityKindFromString,
  makeEntityDelta,
  makePRDeltaSet,
  type DeltaKind,
  type EntityDelta,
  type EntityKind,
  type PRDeltaSet,
} from "./pr-delta";
import type { TrustSignal, TrustState } from "./trust";

const CONTRACT_DELTA_KINDS = [
  ["ADDED", "added"],
  ["REMOVED", "removed"],
  ["RENAMED", "renamed"],
  ["RESHAPED", "reshaped"],
  ["UNCHANGED", "unchanged"],
  ["SPLIT", "split"],
  ["MERGED", "merged"],
  ["UNMATCHED", "unmatched"],
] as const satisfies readonly (readonly [string, DeltaKind])[];

const CONTRACT_ENTITY_KINDS = [
  ["BEHAVIOR", "behavior"],
  ["EDGE", "edge"],
  ["CONTAINER", "container"],
  ["STORE", "store"],
  ["ARTIFACT", "artifact"],
  ["WIDGET", "widget"],
  ["TEST", "test"],
  ["TASK", "task"],
] as const satisfies readonly (readonly [string, EntityKind])[];

const CONTRACT_DELTA_KIND_VALUES = CONTRACT_DELTA_KINDS.map(([, kind]) => kind);
const CONTRACT_ENTITY_KIND_VALUES = CONTRACT_ENTITY_KINDS.map(([, kind]) => kind);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractDeltaKind = (typeof CONTRACT_DELTA_KINDS)[number][1];
type ContractEntityKind = (typeof CONTRACT_ENTITY_KINDS)[number][1];
type _DeltaKindMembership = Assert<Equal<DeltaKind, ContractDeltaKind>>;
type _EntityKindMembership = Assert<Equal<EntityKind, ContractEntityKind>>;

const describe = test.describe;
const it = test;

function trust(
  state: TrustState = "grounded",
  grounding: TrustSignal["grounding"] = "lsp-type",
): TrustSignal {
  return { state, grounding };
}

function entityDelta(overrides: Partial<EntityDelta> = {}): EntityDelta {
  return makeEntityDelta({
    deltaKind: "reshaped",
    entityKind: "behavior",
    baseId: "behavior:auth.validate-token",
    headId: "behavior:auth.validate-token",
    relatedIds: [],
    trust: trust(),
    attributionActor: "generator",
    ...overrides,
  });
}

function prDeltaSet(overrides: Partial<PRDeltaSet> = {}): PRDeltaSet {
  return makePRDeltaSet({
    id: "prdelta:repo.42",
    baseRevision: "abc123",
    headRevision: "def456",
    baseBranch: "main",
    headBranch: "feature/auth",
    prNumber: 42,
    taskId: null,
    deltas: [entityDelta()],
    computedAtMs: 1_700_000_000_000,
    attributionActor: "generator",
    ...overrides,
  });
}

describe("PRDeltaSet schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_DELTA_KINDS) {
    it(`contains contract delta kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(deltaKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 8 contract delta kinds", () => {
    expect(CONTRACT_DELTA_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_DELTA_KIND_VALUES).size).toBe(8);
  });

  for (const [memberName, kindValue] of CONTRACT_ENTITY_KINDS) {
    it(`contains contract entity kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(entityKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 8 contract entity kinds", () => {
    expect(CONTRACT_ENTITY_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_ENTITY_KIND_VALUES).size).toBe(8);
  });

  it("throws instead of silently accepting unknown delta kind strings", () => {
    for (const invalidValue of [
      "",
      "ADD",
      "ADDED",
      "added ",
      "re-shaped",
      "unknown",
    ]) {
      expect(
        () => deltaKindFromString(invalidValue),
        `deltaKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown entity kind strings", () => {
    for (const invalidValue of [
      "",
      "BEHAVIOR",
      "behaviour",
      "behavior ",
      "file",
      "work-item",
    ]) {
      expect(
        () => entityKindFromString(invalidValue),
        `entityKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid EntityDelta values", () => {
    for (const overrides of [
      { deltaKind: "added", baseId: "behavior:base-added" },
      { deltaKind: "added", baseId: null, headId: null },
      { deltaKind: "removed", headId: "behavior:head-removed" },
      { deltaKind: "renamed", baseId: "behavior:same", headId: "behavior:same" },
      { deltaKind: "renamed", baseId: null },
      { deltaKind: "split", relatedIds: [] },
      { deltaKind: "merged", relatedIds: [] },
      { deltaKind: "unmatched", baseId: null, headId: null },
      { deltaKind: "unchanged", baseId: "behavior:old", headId: "behavior:new" },
    ] satisfies readonly Partial<EntityDelta>[]) {
      expect(() => entityDelta(overrides)).toThrow();
    }
  });

  it("accepts contract-valid EntityDelta values", () => {
    for (const overrides of [
      { deltaKind: "added", baseId: null, headId: "behavior:new" },
      { deltaKind: "removed", baseId: "behavior:old", headId: null },
      { deltaKind: "renamed", baseId: "behavior:old", headId: "behavior:new" },
      {
        deltaKind: "split",
        baseId: "behavior:old",
        headId: "behavior:new-primary",
        relatedIds: ["behavior:new-secondary"],
      },
      {
        deltaKind: "merged",
        baseId: "behavior:old-primary",
        headId: "behavior:new",
        relatedIds: ["behavior:old-secondary"],
      },
      { deltaKind: "unmatched", baseId: "behavior:old", headId: null },
    ] satisfies readonly Partial<EntityDelta>[]) {
      expect(entityDelta(overrides).deltaKind).toBe(overrides.deltaKind);
    }
  });

  for (const prDeltaId of [
    "prdelta:repo.42",
    "prdelta:task-abc_123",
    "prdelta:owner.repo:pull-42",
  ]) {
    it(`accepts contract pr delta id ${prDeltaId}`, () => {
      expect(PR_DELTA_ID_PATTERN.test(prDeltaId)).toBe(true);
      expect(prDeltaSet({ id: prDeltaId }).id).toBe(prDeltaId);
    });
  }

  for (const prDeltaId of [
    "",
    "repo.42",
    "prdelta:",
    "prdelta:has spaces",
    "prdelta:has/slash",
  ]) {
    it(`rejects contract-invalid pr delta id ${prDeltaId}`, () => {
      expect(PR_DELTA_ID_PATTERN.test(prDeltaId)).toBe(false);
      expect(() => prDeltaSet({ id: prDeltaId })).toThrow();
    });
  }

  it("rejects invalid PRDeltaSet values", () => {
    for (const overrides of [
      { baseRevision: "" },
      { headRevision: "" },
      { baseRevision: "abc123", headRevision: "abc123" },
      { baseBranch: "" },
      { headBranch: "" },
      { prNumber: 42, taskId: "task:t1" },
      { prNumber: null, taskId: null },
      { computedAtMs: -1 },
    ] satisfies readonly Partial<PRDeltaSet>[]) {
      expect(() => prDeltaSet(overrides)).toThrow();
    }
  });

  it("allows an empty delta list for no-op pull requests", () => {
    expect(prDeltaSet({ deltas: [] }).deltas).toEqual([]);
  });

  it("accepts task id instead of pr number", () => {
    expect(prDeltaSet({ prNumber: null, taskId: "task:t1" })).toMatchObject({
      prNumber: null,
      taskId: "task:t1",
    });
  });
});
