import { expect, test } from "@playwright/test";

import type { ActorKind } from "./actors";
import type { BehaviorSliceRole } from "./behavior";
import {
  BEHAVIOR_DRAFT_ID_PATTERN,
  changeIntentFromString,
  conflictKindFromString,
  makeBehaviorDraft,
  makeChangeOrigin,
  makeConflictState,
  makeConflictingFile,
  makeProposedSlice,
  makeWritebackPlan,
  type BehaviorDraft,
  type ChangeIntent,
  type ChangeOrigin,
  type ConflictKind,
  type ConflictState,
  type ProposedSlice,
  type WritebackPlan,
} from "./writeback";

const CONTRACT_CHANGE_INTENTS = [
  ["USER_EDIT", "user-edit"],
  ["AGENT_EDIT", "agent-edit"],
  ["PROMOTE_TO_TEST", "promote-to-test"],
  ["RECONCILE", "reconcile"],
  ["REVERT", "revert"],
] as const satisfies readonly (readonly [string, ChangeIntent])[];

const CONTRACT_CONFLICT_KINDS = [
  ["FILE_DELETED", "file-deleted"],
  ["LINES_CHANGED", "lines-changed"],
  ["FILE_MOVED", "file-moved"],
  ["WHITESPACE_ONLY", "whitespace-only"],
] as const satisfies readonly (readonly [string, ConflictKind])[];

const CONTRACT_CHANGE_INTENT_VALUES = CONTRACT_CHANGE_INTENTS.map(([, intent]) => intent);
const CONTRACT_CONFLICT_KIND_VALUES = CONTRACT_CONFLICT_KINDS.map(([, kind]) => kind);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractChangeIntent = (typeof CONTRACT_CHANGE_INTENTS)[number][1];
type ContractConflictKind = (typeof CONTRACT_CONFLICT_KINDS)[number][1];
type _ChangeIntentMembership = Assert<Equal<ChangeIntent, ContractChangeIntent>>;
type _ConflictKindMembership = Assert<Equal<ConflictKind, ContractConflictKind>>;

const describe = test.describe;
const it = test;

function origin(overrides: Partial<ChangeOrigin> = {}): ChangeOrigin {
  return makeChangeOrigin({
    actor: "you-this-session",
    intent: "user-edit",
    timestampMs: 1_700_000_000_000,
    requestId: null,
    ...overrides,
  });
}

function proposedSlice(overrides: Partial<ProposedSlice> = {}): ProposedSlice {
  return makeProposedSlice({
    filePath: "app/auth/session.ts",
    startLine: 10,
    endLine: 14,
    newText: "return validateToken(request);\n",
    intentRole: "body",
    ...overrides,
  });
}

function draft(overrides: Partial<BehaviorDraft> = {}): BehaviorDraft {
  return makeBehaviorDraft({
    id: "draft:behavior:auth.validate-token:1700000000000",
    behaviorId: "behavior:auth.validate-token",
    proposedSlices: [proposedSlice()],
    origin: origin(),
    parentRevision: "abc123",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function plan(overrides: Partial<WritebackPlan> = {}): WritebackPlan {
  const baseDraft = overrides.draft ?? draft();

  return makeWritebackPlan({
    draft: baseDraft,
    effectiveDiff:
      "--- a/app/auth/session.ts\n" +
      "+++ b/app/auth/session.ts\n" +
      "@@ -10,5 +10,1 @@\n" +
      "+return validateToken(request);\n",
    appliesAgainstRevision: baseDraft.parentRevision,
    validatedAtMs: baseDraft.createdAtMs,
    ...overrides,
  });
}

function conflictingFile(
  overrides: Partial<ConflictState["conflictingFiles"][number]> = {},
): ConflictState["conflictingFiles"][number] {
  return makeConflictingFile({
    filePath: "app/auth/session.ts",
    conflictKind: "lines-changed",
    sourceUnchanged: false,
    ...overrides,
  });
}

function conflict(overrides: Partial<ConflictState> = {}): ConflictState {
  return makeConflictState({
    draftId: "draft:behavior:auth.validate-token:1700000000000",
    conflictingFiles: [conflictingFile()],
    observedRevision: "def456",
    expectedRevision: "abc123",
    ...overrides,
  });
}

describe("Writeback schema contract", () => {
  for (const [memberName, intentValue] of CONTRACT_CHANGE_INTENTS) {
    it(`contains contract change intent ${memberName} with stable string value ${intentValue}`, () => {
      expect(changeIntentFromString(intentValue)).toBe(intentValue);
    });
  }

  for (const [memberName, kindValue] of CONTRACT_CONFLICT_KINDS) {
    it(`contains contract conflict kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(conflictKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 5 contract change intents", () => {
    expect(CONTRACT_CHANGE_INTENT_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_CHANGE_INTENT_VALUES).size).toBe(5);
  });

  it("contains exactly the 4 contract conflict kinds", () => {
    expect(CONTRACT_CONFLICT_KIND_VALUES).toHaveLength(4);
    expect(new Set(CONTRACT_CONFLICT_KIND_VALUES).size).toBe(4);
  });

  it("throws instead of silently accepting unknown change intent strings", () => {
    for (const invalidValue of [
      "",
      "user_edit",
      "USER_EDIT",
      "user-edit ",
      "apply",
      "merge",
    ]) {
      expect(
        () => changeIntentFromString(invalidValue),
        `changeIntentFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown conflict kind strings", () => {
    for (const invalidValue of [
      "",
      "file_deleted",
      "FILE_DELETED",
      "lines-changed ",
      "deleted",
      "content-changed",
    ]) {
      expect(
        () => conflictKindFromString(invalidValue),
        `conflictKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid ChangeOrigin values", () => {
    for (const overrides of [
      { actor: "not-a-real-actor" as ActorKind },
      { intent: "not-a-real-intent" as ChangeIntent },
      { timestampMs: -1 },
    ] satisfies readonly Partial<ChangeOrigin>[]) {
      expect(() => origin(overrides)).toThrow();
    }
  });

  it("rejects invalid BehaviorDraft values", () => {
    for (const overrides of [
      { id: "" },
      { id: "behavior:auth.validate-token:1700000000000" },
      { id: "draft:" },
      { id: "draft:has spaces" },
      { id: "draft:has/slash" },
      { behaviorId: "" },
      { behaviorId: "auth.validate-token" },
      { behaviorId: "behavior:" },
      { behaviorId: "behavior:has spaces" },
      { behaviorId: "behavior:has/slash" },
      { proposedSlices: [] },
      { parentRevision: "" },
      { createdAtMs: -1 },
      {
        proposedSlices: [
          {
            filePath: "app/auth/session.ts",
            startLine: 0,
            endLine: 1,
            newText: "return validateToken(request);\n",
            intentRole: "body",
          },
        ],
      },
      {
        proposedSlices: [
          {
            filePath: "app/auth/session.ts",
            startLine: 8,
            endLine: 7,
            newText: "return validateToken(request);\n",
            intentRole: "body",
          },
        ],
      },
    ] satisfies readonly Partial<BehaviorDraft>[]) {
      expect(() => draft(overrides)).toThrow();
    }
  });

  for (const draftId of [
    "draft:behavior:auth.validate-token:1700000000000",
    "draft:Foo_Bar",
    "draft:a",
    "draft:agent:edit:request-123",
  ]) {
    it(`accepts contract behavior draft id ${draftId}`, () => {
      expect(BEHAVIOR_DRAFT_ID_PATTERN.test(draftId)).toBe(true);
      expect(draft({ id: draftId }).id).toBe(draftId);
    });
  }

  for (const draftId of [
    "",
    "behavior:auth.validate-token",
    "draft:",
    "draft:has spaces",
    "draft:has/slash",
  ]) {
    it(`rejects contract-invalid behavior draft id ${draftId}`, () => {
      expect(BEHAVIOR_DRAFT_ID_PATTERN.test(draftId)).toBe(false);
      expect(() => draft({ id: draftId })).toThrow();
    });
  }

  it("rejects invalid ProposedSlice line ranges", () => {
    for (const overrides of [
      { startLine: 0 },
      { startLine: -1 },
      { startLine: 8, endLine: 7 },
    ] satisfies readonly Partial<ProposedSlice>[]) {
      expect(() => proposedSlice(overrides)).toThrow();
    }
  });

  it("accepts valid ProposedSlice line ranges", () => {
    expect(proposedSlice({ startLine: 1, endLine: 1 })).toMatchObject({
      startLine: 1,
      endLine: 1,
    });
    expect(proposedSlice({ startLine: 4, endLine: 9 })).toMatchObject({
      startLine: 4,
      endLine: 9,
    });
  });

  it("rejects invalid WritebackPlan values", () => {
    for (const overrides of [
      { appliesAgainstRevision: "def456" },
      { effectiveDiff: "" },
      { validatedAtMs: 1_699_999_999_999 },
    ] satisfies readonly Partial<WritebackPlan>[]) {
      expect(() => plan(overrides)).toThrow();
    }
  });

  it("accepts WritebackPlan values with matching revision and later validation", () => {
    const baseDraft = draft({ parentRevision: "revision-1", createdAtMs: 10 });

    expect(
      plan({
        draft: baseDraft,
        appliesAgainstRevision: "revision-1",
        validatedAtMs: 11,
      }),
    ).toMatchObject({
      draft: baseDraft,
      appliesAgainstRevision: "revision-1",
      validatedAtMs: 11,
    });
  });

  it("rejects invalid ConflictState values", () => {
    for (const overrides of [
      { conflictingFiles: [] },
      { observedRevision: "abc123", expectedRevision: "abc123" },
    ] satisfies readonly Partial<ConflictState>[]) {
      expect(() => conflict(overrides)).toThrow();
    }
  });

  it("accepts ConflictState values with conflicts and revision divergence", () => {
    expect(conflict({ observedRevision: "observed", expectedRevision: "expected" }))
      .toMatchObject({
        conflictingFiles: [conflictingFile()],
        observedRevision: "observed",
        expectedRevision: "expected",
      });
  });
});
