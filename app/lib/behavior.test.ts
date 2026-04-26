import { expect, test } from "@playwright/test";

import {
  BEHAVIOR_ID_PATTERN,
  behaviorSliceRoleFromString,
  makeBehavior,
  makeBehaviorSourceSlice,
  type Behavior,
  type BehaviorSliceRole,
  type BehaviorSourceSlice,
} from "./behavior";
import type { TrustSignal, TrustState } from "./trust";

const CONTRACT_BEHAVIOR_SLICE_ROLES = [
  ["ENTRY_POINT", "entry-point"],
  ["BODY", "body"],
  ["EXIT", "exit"],
  ["ERROR_PATH", "error-path"],
  ["TEST", "test"],
  ["FIXTURE", "fixture"],
  ["ANNOTATION", "annotation"],
  ["GUARD", "guard"],
  ["TELEMETRY", "telemetry"],
] as const satisfies readonly (readonly [string, BehaviorSliceRole])[];

const CONTRACT_ROLE_VALUES = CONTRACT_BEHAVIOR_SLICE_ROLES.map(([, role]) => role);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractBehaviorSliceRole = (typeof CONTRACT_BEHAVIOR_SLICE_ROLES)[number][1];
type _BehaviorSliceRoleMembership = Assert<
  Equal<BehaviorSliceRole, ContractBehaviorSliceRole>
>;

const describe = test.describe;
const it = test;

function trust(
  state: TrustState = "candidate",
  grounding: TrustSignal["grounding"] = null,
): TrustSignal {
  return { state, grounding };
}

function sourceSlice(overrides: Partial<BehaviorSourceSlice> = {}): BehaviorSourceSlice {
  return makeBehaviorSourceSlice({
    filePath: "app/auth/session.ts",
    startLine: 10,
    endLine: 14,
    startCol: null,
    endCol: null,
    sliceRole: "body",
    discoveredBy: "generator",
    confirmedBy: null,
    ...overrides,
  });
}

function behavior(overrides: Partial<Behavior> = {}): Behavior {
  return makeBehavior({
    id: "behavior:auth.validate-token",
    label: "Validate token",
    description: "Confirms a request token before session access.",
    sourceSlices: [sourceSlice()],
    trust: trust(),
    parentBehaviorId: null,
    attributionActor: "generator",
    ...overrides,
  });
}

describe("Behavior contract", () => {
  for (const [memberName, roleValue] of CONTRACT_BEHAVIOR_SLICE_ROLES) {
    it(`contains contract slice role ${memberName} with stable string value ${roleValue}`, () => {
      expect(behaviorSliceRoleFromString(roleValue)).toBe(roleValue);
    });
  }

  it("contains exactly the 9 contract slice roles", () => {
    expect(CONTRACT_ROLE_VALUES).toHaveLength(9);
    expect(new Set(CONTRACT_ROLE_VALUES).size).toBe(9);
  });

  it("throws instead of silently accepting unknown slice role strings", () => {
    for (const invalidValue of [
      "",
      "entry_point",
      "ENTRY_POINT",
      "body ",
      "happy-path",
      "error",
    ]) {
      expect(
        () => behaviorSliceRoleFromString(invalidValue),
        `behaviorSliceRoleFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid BehaviorSourceSlice values", () => {
    for (const overrides of [
      { filePath: "" },
      { startLine: 0 },
      { startLine: -1 },
      { startLine: 4, endLine: 3 },
      { startCol: 1, endCol: null },
      { startCol: null, endCol: 1 },
      { startCol: 0, endCol: 1 },
      { startCol: 1, endCol: 0 },
      { startLine: 4, endLine: 4, startCol: 8, endCol: 7 },
      { discoveredBy: "generator" as never },
      { confirmedBy: "generator" as never },
    ] satisfies readonly Partial<BehaviorSourceSlice>[]) {
      expect(() => sourceSlice(overrides)).toThrow();
    }
  });

  it("accepts valid BehaviorSourceSlice column and actor combinations", () => {
    expect(sourceSlice({ startCol: null, endCol: null })).toMatchObject({
      filePath: "app/auth/session.ts",
      discoveredBy: "generator",
    });
    expect(sourceSlice({ startLine: 4, endLine: 4, startCol: 2, endCol: 2 })).toMatchObject({
      startCol: 2,
      endCol: 2,
    });
    expect(sourceSlice({ startLine: 4, endLine: 4, startCol: 2, endCol: 9 })).toMatchObject({
      startCol: 2,
      endCol: 9,
    });
    expect(sourceSlice({ startLine: 4, endLine: 5, startCol: 9, endCol: 2 })).toMatchObject({
      startCol: 9,
      endCol: 2,
    });
    expect(sourceSlice({ confirmedBy: "you-this-session" })).toMatchObject({
      confirmedBy: "you-this-session",
    });
  });

  it("rejects invalid Behavior values", () => {
    for (const overrides of [
      { id: "" },
      { id: "auth.validate-token" },
      { id: "behavior:" },
      { id: "behavior:has spaces" },
      { id: "behavior:has/slash" },
      { label: "" },
      { sourceSlices: [] },
      { parentBehaviorId: "auth.parent" },
      { parentBehaviorId: "behavior:" },
      { attributionActor: "generator" as never },
    ] satisfies readonly Partial<Behavior>[]) {
      expect(() => behavior(overrides)).toThrow();
    }
  });

  it("allows repeated file paths across source slices", () => {
    const value = behavior({
      sourceSlices: [
        sourceSlice({ startLine: 1, endLine: 3, sliceRole: "entry-point" }),
        sourceSlice({ startLine: 8, endLine: 12, sliceRole: "body" }),
      ],
    });

    expect(value.sourceSlices.map((entry) => entry.filePath)).toEqual([
      "app/auth/session.ts",
      "app/auth/session.ts",
    ]);
  });

  for (const behaviorId of [
    "behavior:auth.validate-token",
    "behavior:Foo_Bar",
    "behavior:a",
  ]) {
    it(`accepts contract behavior id ${behaviorId}`, () => {
      expect(BEHAVIOR_ID_PATTERN.test(behaviorId)).toBe(true);
      expect(behavior({ id: behaviorId }).id).toBe(behaviorId);
    });
  }

  for (const behaviorId of [
    "auth.validate-token",
    "behavior:",
    "behavior:has spaces",
    "behavior:has/slash",
  ]) {
    it(`rejects contract-invalid behavior id ${behaviorId}`, () => {
      expect(BEHAVIOR_ID_PATTERN.test(behaviorId)).toBe(false);
      expect(() => behavior({ id: behaviorId })).toThrow();
    });
  }

  it("reasserts that grounded behavior trust requires grounding", () => {
    expect(() => behavior({ trust: { state: "grounded", grounding: null } })).toThrow();
  });

  it("accepts grounded behavior trust with grounding", () => {
    expect(behavior({ trust: trust("grounded", "test") }).trust).toEqual({
      state: "grounded",
      grounding: "test",
    });
  });
});
