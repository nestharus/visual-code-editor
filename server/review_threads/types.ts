/**
 * Server-side mirror of app/lib/review-thread.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/review-threads-vocab-parity.spec.ts pins the review vocabulary.
 */

export type ActorKind =
  | "you-this-session"
  | "you-other-session"
  | "another-user"
  | "agents:edit"
  | "agents:direct"
  | "agents:slice-constructor"
  | "agents:relevance-classifier"
  | "agents:provider-mapper"
  | "generator"
  | "ci"
  | "git-op"
  | "provider:github:sync"
  | "provider:github:pr-merge"
  | "product:auto-focus"
  | "product:digest-surface"
  | "product:thread-open"
  | "product:lineage-confirm"
  | "unknown-external";

export type EntityKind =
  | "behavior"
  | "edge"
  | "container"
  | "store"
  | "artifact"
  | "widget"
  | "test"
  | "task";

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

export type CreateReviewThreadRequest = {
  deltaSetId: string;
  anchorKind: EntityKind;
  anchorId: string;
  anchorSide: ThreadSide;
  initialComment: string;
  actor: ActorKind;
};

export type AddReviewCommentRequest = {
  text: string;
  actor: ActorKind;
};

export type TransitionReviewThreadRequest = {
  toStatus: ThreadStatus;
  actor: ActorKind;
};

export type SubmitReviewVerdictRequest = {
  deltaSetId: string;
  decision: VerdictDecision;
  rationale: string;
  actor: ActorKind;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

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

export const ENTITY_KINDS = [
  "behavior",
  "edge",
  "container",
  "store",
  "artifact",
  "widget",
  "test",
  "task",
] as const satisfies readonly EntityKind[];

const ALL_ACTORS = [
  "you-this-session",
  "you-other-session",
  "another-user",
  "agents:edit",
  "agents:direct",
  "agents:slice-constructor",
  "agents:relevance-classifier",
  "agents:provider-mapper",
  "generator",
  "ci",
  "git-op",
  "provider:github:sync",
  "provider:github:pr-merge",
  "product:auto-focus",
  "product:digest-surface",
  "product:thread-open",
  "product:lineage-confirm",
  "unknown-external",
] as const satisfies readonly ActorKind[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);
const THREAD_STATUS_SET: ReadonlySet<string> = new Set(THREAD_STATUSES);
const THREAD_SIDE_SET: ReadonlySet<string> = new Set(THREAD_SIDES);
const VERDICT_DECISION_SET: ReadonlySet<string> = new Set(VERDICT_DECISIONS);

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function entityKindFromString(value: string): EntityKind {
  if (ENTITY_KIND_SET.has(value)) return value as EntityKind;
  throw new Error(`Unknown entity kind: ${value}`);
}

export function threadStatusFromString(value: string): ThreadStatus {
  if (THREAD_STATUS_SET.has(value)) return value as ThreadStatus;
  throw new Error(`Unknown thread status: ${value}`);
}

export function threadSideFromString(value: string): ThreadSide {
  if (THREAD_SIDE_SET.has(value)) return value as ThreadSide;
  throw new Error(`Unknown thread side: ${value}`);
}

export function verdictDecisionFromString(value: string): VerdictDecision {
  if (VERDICT_DECISION_SET.has(value)) return value as VerdictDecision;
  throw new Error(`Unknown verdict decision: ${value}`);
}

export function validateCreateReviewThreadRequest(
  payload: unknown,
): ValidationResult<CreateReviewThreadRequest> {
  if (!payload || typeof payload !== "object") return validationError("body must be an object");

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.delta_set_id !== "string" || candidate.delta_set_id.trim().length === 0) {
    return validationError("delta_set_id must be a non-empty string");
  }
  if (typeof candidate.anchor_kind !== "string") {
    return validationError("anchor_kind must be an EntityKind");
  }
  if (typeof candidate.anchor_id !== "string" || candidate.anchor_id.trim().length === 0) {
    return validationError("anchor_id must be a non-empty string");
  }
  if (typeof candidate.anchor_side !== "string") {
    return validationError("anchor_side must be a ThreadSide");
  }
  if (
    typeof candidate.initial_comment !== "string" ||
    candidate.initial_comment.trim().length === 0
  ) {
    return validationError("initial_comment must be a non-empty string");
  }

  const actorValidation = actorValue(candidate.actor);
  if (!actorValidation.ok) return actorValidation;

  try {
    return {
      ok: true,
      value: {
        deltaSetId: candidate.delta_set_id,
        anchorKind: entityKindFromString(candidate.anchor_kind),
        anchorId: candidate.anchor_id,
        anchorSide: threadSideFromString(candidate.anchor_side),
        initialComment: candidate.initial_comment.trim(),
        actor: actorValidation.value,
      },
    };
  } catch {
    return validationError("anchor_kind or anchor_side is invalid");
  }
}

export function validateAddReviewCommentRequest(
  payload: unknown,
): ValidationResult<AddReviewCommentRequest> {
  if (!payload || typeof payload !== "object") return validationError("body must be an object");

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.text !== "string" || candidate.text.trim().length === 0) {
    return validationError("text must be a non-empty string");
  }
  const actorValidation = actorValue(candidate.actor);
  if (!actorValidation.ok) return actorValidation;
  return { ok: true, value: { text: candidate.text.trim(), actor: actorValidation.value } };
}

export function validateTransitionReviewThreadRequest(
  payload: unknown,
): ValidationResult<TransitionReviewThreadRequest> {
  if (!payload || typeof payload !== "object") return validationError("body must be an object");

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.to_status !== "string") {
    return validationError("to_status must be a ThreadStatus");
  }
  const actorValidation = actorValue(candidate.actor);
  if (!actorValidation.ok) return actorValidation;

  try {
    return {
      ok: true,
      value: {
        toStatus: threadStatusFromString(candidate.to_status),
        actor: actorValidation.value,
      },
    };
  } catch {
    return validationError("to_status must be a ThreadStatus");
  }
}

export function validateSubmitReviewVerdictRequest(
  payload: unknown,
): ValidationResult<SubmitReviewVerdictRequest> {
  if (!payload || typeof payload !== "object") return validationError("body must be an object");

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.delta_set_id !== "string" || candidate.delta_set_id.trim().length === 0) {
    return validationError("delta_set_id must be a non-empty string");
  }
  if (typeof candidate.decision !== "string") {
    return validationError("decision must be a VerdictDecision");
  }
  if (typeof candidate.rationale !== "string" || candidate.rationale.trim().length === 0) {
    return validationError("rationale must be a non-empty string");
  }
  const actorValidation = actorValue(candidate.actor);
  if (!actorValidation.ok) return actorValidation;

  try {
    return {
      ok: true,
      value: {
        deltaSetId: candidate.delta_set_id,
        decision: verdictDecisionFromString(candidate.decision),
        rationale: candidate.rationale.trim(),
        actor: actorValidation.value,
      },
    };
  } catch {
    return validationError("decision must be a VerdictDecision");
  }
}

export function makeComment(partial: Comment): Comment {
  if (!COMMENT_ID_PATTERN.test(partial.id)) {
    throw new Error("Comment id must match ^comment:[a-zA-Z0-9._-]+$");
  }
  if (!REVIEW_THREAD_ID_PATTERN.test(partial.threadId)) {
    throw new Error("Comment threadId must match ^review:[a-zA-Z0-9._-]+$");
  }
  actorFromString(partial.actor);
  if (partial.text.trim().length === 0) throw new Error("Comment text must be non-empty");
  if (partial.createdAtMs < 0) throw new Error("Comment createdAtMs must be >= 0");
  return { ...partial };
}

export function makeReviewThread(partial: ReviewThread): ReviewThread {
  if (!REVIEW_THREAD_ID_PATTERN.test(partial.id)) {
    throw new Error("ReviewThread id must match ^review:[a-zA-Z0-9._-]+$");
  }
  if (partial.deltaSetId === "") throw new Error("ReviewThread deltaSetId must be non-empty");
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

  const terminal = partial.status === "resolved" || partial.status === "dismissed";
  const hasResolution = partial.resolvedAtMs !== null || partial.resolvedBy !== null;
  if (terminal) {
    if (partial.resolvedAtMs === null || partial.resolvedBy === null) {
      throw new Error("Resolved or dismissed ReviewThread requires resolution metadata");
    }
    actorFromString(partial.resolvedBy);
    if (partial.resolvedAtMs < 0) throw new Error("ReviewThread resolvedAtMs must be >= 0");
  } else if (hasResolution) {
    throw new Error("Open or frozen ReviewThread must not set resolution metadata");
  }
  if (partial.createdAtMs < 0) throw new Error("ReviewThread createdAtMs must be >= 0");

  return { ...partial, comments };
}

export function makeReviewVerdict(partial: ReviewVerdict): ReviewVerdict {
  if (partial.deltaSetId === "") throw new Error("ReviewVerdict deltaSetId must be non-empty");
  verdictDecisionFromString(partial.decision);
  actorFromString(partial.decidedBy);
  if (partial.decidedAtMs < 0) throw new Error("ReviewVerdict decidedAtMs must be >= 0");
  if (partial.rationale.trim().length === 0) {
    throw new Error("ReviewVerdict rationale must be non-empty");
  }
  return { ...partial };
}

function actorValue(value: unknown): ValidationResult<ActorKind> {
  const candidate = value ?? "you-this-session";
  if (typeof candidate !== "string") {
    return validationError("actor must be an ActorKind when supplied");
  }
  try {
    return { ok: true, value: actorFromString(candidate) };
  } catch {
    return validationError("actor must be an ActorKind when supplied");
  }
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
