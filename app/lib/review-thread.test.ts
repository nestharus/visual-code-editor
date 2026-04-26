import { expect, test } from "@playwright/test";

import type { ActorKind } from "./actors";
import type { EntityKind } from "./pr-delta";
import {
  COMMENT_ID_PATTERN,
  REVIEW_THREAD_ID_PATTERN,
  makeComment,
  makeReviewThread,
  makeReviewVerdict,
  threadSideFromString,
  threadStatusFromString,
  verdictDecisionFromString,
  type Comment,
  type ReviewThread,
  type ReviewVerdict,
  type ThreadSide,
  type ThreadStatus,
  type VerdictDecision,
} from "./review-thread";

const CONTRACT_THREAD_STATUSES = [
  ["OPEN", "open"],
  ["RESOLVED", "resolved"],
  ["DISMISSED", "dismissed"],
  ["FROZEN", "frozen"],
] as const satisfies readonly (readonly [string, ThreadStatus])[];

const CONTRACT_THREAD_SIDES = [
  ["BASE", "base"],
  ["HEAD", "head"],
] as const satisfies readonly (readonly [string, ThreadSide])[];

const CONTRACT_VERDICT_DECISIONS = [
  ["APPROVED", "approved"],
  ["CHANGES_REQUESTED", "changes-requested"],
  ["REJECTED", "rejected"],
] as const satisfies readonly (readonly [string, VerdictDecision])[];

const CONTRACT_THREAD_STATUS_VALUES = CONTRACT_THREAD_STATUSES.map(([, status]) => status);
const CONTRACT_THREAD_SIDE_VALUES = CONTRACT_THREAD_SIDES.map(([, side]) => side);
const CONTRACT_VERDICT_DECISION_VALUES = CONTRACT_VERDICT_DECISIONS.map(
  ([, decision]) => decision,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractThreadStatus = (typeof CONTRACT_THREAD_STATUSES)[number][1];
type ContractThreadSide = (typeof CONTRACT_THREAD_SIDES)[number][1];
type ContractVerdictDecision = (typeof CONTRACT_VERDICT_DECISIONS)[number][1];
type _ThreadStatusMembership = Assert<Equal<ThreadStatus, ContractThreadStatus>>;
type _ThreadSideMembership = Assert<Equal<ThreadSide, ContractThreadSide>>;
type _VerdictDecisionMembership = Assert<Equal<VerdictDecision, ContractVerdictDecision>>;

const describe = test.describe;
const it = test;

function comment(overrides: Partial<Comment> = {}): Comment {
  return makeComment({
    id: "comment:review-thread.1",
    threadId: "review:auth-thread.1",
    actor: "you-this-session",
    text: "This needs a reviewer decision.",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  const status = overrides.status ?? "open";
  return makeReviewThread({
    id: "review:auth-thread.1",
    deltaSetId: "prdelta:repo.42",
    anchorKind: "behavior",
    anchorId: "behavior:auth.validate-token",
    anchorSide: "head",
    status,
    comments: [comment()],
    createdAtMs: 1_700_000_000_000,
    resolvedAtMs: null,
    resolvedBy: null,
    ...overrides,
  });
}

function verdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
  return makeReviewVerdict({
    deltaSetId: "prdelta:repo.42",
    decision: "approved",
    decidedBy: "you-this-session",
    decidedAtMs: 1_700_000_000_000,
    rationale: "The reviewed delta is acceptable.",
    ...overrides,
  });
}

describe("ReviewThread schema contract", () => {
  for (const [memberName, statusValue] of CONTRACT_THREAD_STATUSES) {
    it(`contains contract thread status ${memberName} with stable string value ${statusValue}`, () => {
      expect(threadStatusFromString(statusValue)).toBe(statusValue);
    });
  }

  it("contains exactly the 4 contract thread statuses", () => {
    expect(CONTRACT_THREAD_STATUS_VALUES).toEqual([
      "open",
      "resolved",
      "dismissed",
      "frozen",
    ]);
    expect(new Set(CONTRACT_THREAD_STATUS_VALUES).size).toBe(4);
  });

  for (const [memberName, sideValue] of CONTRACT_THREAD_SIDES) {
    it(`contains contract thread side ${memberName} with stable string value ${sideValue}`, () => {
      expect(threadSideFromString(sideValue)).toBe(sideValue);
    });
  }

  it("contains exactly the 2 contract thread sides", () => {
    expect(CONTRACT_THREAD_SIDE_VALUES).toEqual(["base", "head"]);
    expect(new Set(CONTRACT_THREAD_SIDE_VALUES).size).toBe(2);
  });

  for (const [memberName, decisionValue] of CONTRACT_VERDICT_DECISIONS) {
    it(`contains contract verdict decision ${memberName} with stable string value ${decisionValue}`, () => {
      expect(verdictDecisionFromString(decisionValue)).toBe(decisionValue);
    });
  }

  it("contains exactly the 3 contract verdict decisions", () => {
    expect(CONTRACT_VERDICT_DECISION_VALUES).toEqual([
      "approved",
      "changes-requested",
      "rejected",
    ]);
    expect(new Set(CONTRACT_VERDICT_DECISION_VALUES).size).toBe(3);
  });

  it("throws instead of silently accepting unknown vocabulary strings", () => {
    for (const invalidValue of ["", "OPEN", "resolved ", "unknown"]) {
      expect(() => threadStatusFromString(invalidValue)).toThrow();
    }
    for (const invalidValue of ["", "BASE", "left", "head "]) {
      expect(() => threadSideFromString(invalidValue)).toThrow();
    }
    for (const invalidValue of ["", "approved ", "changes_requested", "blocked"]) {
      expect(() => verdictDecisionFromString(invalidValue)).toThrow();
    }
  });

  for (const threadId of [
    "review:auth-thread.1",
    "review:owner.repo_42",
    "review:a-b_c.123",
  ]) {
    it(`accepts contract review thread id ${threadId}`, () => {
      expect(REVIEW_THREAD_ID_PATTERN.test(threadId)).toBe(true);
      expect(thread({ id: threadId, comments: [comment({ threadId })] }).id).toBe(threadId);
    });
  }

  for (const threadId of [
    "",
    "thread:auth",
    "review:",
    "review:has spaces",
    "review:has/slash",
  ]) {
    it(`rejects contract-invalid review thread id ${threadId}`, () => {
      expect(REVIEW_THREAD_ID_PATTERN.test(threadId)).toBe(false);
      expect(() => thread({ id: threadId })).toThrow();
    });
  }

  for (const commentId of [
    "comment:auth-thread.1",
    "comment:owner.repo_42",
    "comment:a-b_c.123",
  ]) {
    it(`accepts contract comment id ${commentId}`, () => {
      expect(COMMENT_ID_PATTERN.test(commentId)).toBe(true);
      expect(comment({ id: commentId }).id).toBe(commentId);
    });
  }

  for (const commentId of [
    "",
    "reply:auth",
    "comment:",
    "comment:has spaces",
    "comment:has/slash",
  ]) {
    it(`rejects contract-invalid comment id ${commentId}`, () => {
      expect(COMMENT_ID_PATTERN.test(commentId)).toBe(false);
      expect(() => comment({ id: commentId })).toThrow();
    });
  }

  it("rejects empty comments and empty comment text", () => {
    expect(() => thread({ comments: [] })).toThrow();

    for (const text of ["", "   ", "\n\t"]) {
      expect(() => comment({ text })).toThrow();
    }
  });

  it("enforces terminal status resolution metadata", () => {
    for (const status of ["resolved", "dismissed"] as const satisfies readonly ThreadStatus[]) {
      expect(() =>
        thread({ status, resolvedAtMs: null, resolvedBy: "you-this-session" }),
      ).toThrow();
      expect(() => thread({ status, resolvedAtMs: 1_700_000_000_100, resolvedBy: null }))
        .toThrow();
      expect(
        thread({
          status,
          resolvedAtMs: 1_700_000_000_100,
          resolvedBy: "you-this-session",
        }),
      ).toMatchObject({
        status,
        resolvedAtMs: 1_700_000_000_100,
        resolvedBy: "you-this-session",
      });
    }
  });

  it("enforces open and frozen status resolution metadata", () => {
    for (const status of ["open", "frozen"] as const satisfies readonly ThreadStatus[]) {
      expect(() => thread({ status, resolvedAtMs: 1_700_000_000_100 })).toThrow();
      expect(() => thread({ status, resolvedBy: "you-this-session" })).toThrow();
      expect(thread({ status, resolvedAtMs: null, resolvedBy: null })).toMatchObject({
        status,
        resolvedAtMs: null,
        resolvedBy: null,
      });
    }
  });

  it("rejects empty anchor ids and empty verdict rationales", () => {
    for (const anchorId of ["", "   ", "\n\t"]) {
      expect(() => thread({ anchorId })).toThrow();
    }

    for (const rationale of ["", "   ", "\n\t"]) {
      expect(() => verdict({ rationale })).toThrow();
    }
  });

  it("rejects non-registry actors", () => {
    expect(() => comment({ actor: "not-a-real-actor" as ActorKind })).toThrow();
    expect(() => verdict({ decidedBy: "not-a-real-actor" as ActorKind })).toThrow();
  });

  it("rejects non-contract entity kinds", () => {
    expect(() => thread({ anchorKind: "file" as EntityKind })).toThrow();
  });
});
