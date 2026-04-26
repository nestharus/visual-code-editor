import { actorFromString, type ActorKind } from "./actors";
import { entityKindFromString, type EntityKind } from "./pr-delta";

export type ThreadStatus = "open" | "resolved" | "dismissed" | "frozen";
export type ThreadSide = "base" | "head";
export type VerdictDecision = "approved" | "changes-requested" | "rejected";

export interface Comment {
  id: string;
  threadId: string;
  actor: ActorKind;
  text: string;
  createdAtMs: number;
}

export interface ReviewThread {
  id: string;
  deltaSetId: string;
  anchorKind: EntityKind;
  anchorId: string;
  anchorSide: ThreadSide;
  status: ThreadStatus;
  comments: readonly Comment[];
  createdAtMs: number;
  resolvedAtMs: number | null;
  resolvedBy: ActorKind | null;
}

export interface ReviewVerdict {
  deltaSetId: string;
  decision: VerdictDecision;
  decidedBy: ActorKind;
  decidedAtMs: number;
  rationale: string;
}

export const REVIEW_THREAD_ID_PATTERN = /^review:[a-zA-Z0-9._-]+$/;
export const COMMENT_ID_PATTERN = /^comment:[a-zA-Z0-9._-]+$/;

export const THREAD_STATUSES = [
  "open",
  "resolved",
  "dismissed",
  "frozen",
] as const satisfies readonly ThreadStatus[];

export const THREAD_SIDES = ["base", "head"] as const satisfies readonly ThreadSide[];

export const VERDICT_DECISIONS = [
  "approved",
  "changes-requested",
  "rejected",
] as const satisfies readonly VerdictDecision[];

const THREAD_STATUS_SET: ReadonlySet<string> = new Set(THREAD_STATUSES);
const THREAD_SIDE_SET: ReadonlySet<string> = new Set(THREAD_SIDES);
const VERDICT_DECISION_SET: ReadonlySet<string> = new Set(VERDICT_DECISIONS);

export function threadStatusFromString(value: string): ThreadStatus {
  if (THREAD_STATUS_SET.has(value)) {
    return value as ThreadStatus;
  }
  throw new Error(`Unknown thread status: ${value}`);
}

export function threadSideFromString(value: string): ThreadSide {
  if (THREAD_SIDE_SET.has(value)) {
    return value as ThreadSide;
  }
  throw new Error(`Unknown thread side: ${value}`);
}

export function verdictDecisionFromString(value: string): VerdictDecision {
  if (VERDICT_DECISION_SET.has(value)) {
    return value as VerdictDecision;
  }
  throw new Error(`Unknown verdict decision: ${value}`);
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
  }
}

export function makeComment(partial: Comment): Comment {
  if (!COMMENT_ID_PATTERN.test(partial.id)) {
    throw new Error("Comment id must match ^comment:[a-zA-Z0-9._-]+$");
  }
  if (!REVIEW_THREAD_ID_PATTERN.test(partial.threadId)) {
    throw new Error("Comment threadId must match ^review:[a-zA-Z0-9._-]+$");
  }
  validateActor(partial.actor, "Comment actor");
  if (partial.text.trim().length === 0) {
    throw new Error("Comment text must be non-empty");
  }
  if (partial.createdAtMs < 0) {
    throw new Error("Comment createdAtMs must be >= 0");
  }
  return { ...partial };
}

export function makeReviewThread(partial: ReviewThread): ReviewThread {
  if (!REVIEW_THREAD_ID_PATTERN.test(partial.id)) {
    throw new Error("ReviewThread id must match ^review:[a-zA-Z0-9._-]+$");
  }
  if (partial.deltaSetId === "") {
    throw new Error("ReviewThread deltaSetId must be non-empty");
  }
  entityKindFromString(partial.anchorKind);
  if (partial.anchorId.trim().length === 0) {
    throw new Error("ReviewThread anchorId must be non-empty");
  }
  threadSideFromString(partial.anchorSide);
  threadStatusFromString(partial.status);

  if (partial.comments.length === 0) {
    throw new Error("ReviewThread comments must be non-empty");
  }
  const comments = partial.comments.map((comment) => makeComment(comment));

  if (partial.createdAtMs < 0) {
    throw new Error("ReviewThread createdAtMs must be >= 0");
  }

  const terminal = partial.status === "resolved" || partial.status === "dismissed";
  const hasResolution = partial.resolvedAtMs !== null || partial.resolvedBy !== null;
  if (terminal) {
    if (partial.resolvedAtMs === null || partial.resolvedBy === null) {
      throw new Error("Resolved or dismissed ReviewThread requires resolution metadata");
    }
    validateActor(partial.resolvedBy, "ReviewThread resolvedBy");
    if (partial.resolvedAtMs < 0) {
      throw new Error("ReviewThread resolvedAtMs must be >= 0");
    }
  } else if (hasResolution) {
    throw new Error("Open or frozen ReviewThread must not set resolution metadata");
  }

  return {
    ...partial,
    comments,
  };
}

export function makeReviewVerdict(partial: ReviewVerdict): ReviewVerdict {
  if (partial.deltaSetId === "") {
    throw new Error("ReviewVerdict deltaSetId must be non-empty");
  }
  verdictDecisionFromString(partial.decision);
  validateActor(partial.decidedBy, "ReviewVerdict decidedBy");
  if (partial.decidedAtMs < 0) {
    throw new Error("ReviewVerdict decidedAtMs must be >= 0");
  }
  if (partial.rationale.trim().length === 0) {
    throw new Error("ReviewVerdict rationale must be non-empty");
  }
  return { ...partial };
}
