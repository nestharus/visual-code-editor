import { randomUUID } from "node:crypto";
import {
  makeComment,
  makeReviewThread,
  makeReviewVerdict,
  type AddReviewCommentRequest,
  type CreateReviewThreadRequest,
  type ReviewThread,
  type ReviewVerdict,
  type SubmitReviewVerdictRequest,
  type ThreadStatus,
  type TransitionReviewThreadRequest,
} from "./types";

export type ReviewThreadErrorKind =
  | "validation"
  | "not-found"
  | "invalid-transition"
  | "internal";

export class ReviewThreadManagerError extends Error {
  readonly errorKind: ReviewThreadErrorKind;

  constructor(errorKind: ReviewThreadErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReviewThreadManagerError";
    this.errorKind = errorKind;
  }
}

export type ReviewThreadManager = {
  createThread(request: CreateReviewThreadRequest): ReviewThread;
  addComment(id: string, request: AddReviewCommentRequest): ReviewThread;
  transition(id: string, request: TransitionReviewThreadRequest): ReviewThread;
  list(deltaSetId: string): readonly ReviewThread[];
  submitVerdict(request: SubmitReviewVerdictRequest): ReviewVerdict;
  verdicts(deltaSetId: string): readonly ReviewVerdict[];
};

const TRANSITIONS: Readonly<Record<ThreadStatus, ReadonlySet<ThreadStatus>>> = Object.freeze({
  open: new Set(["resolved", "dismissed", "frozen"]),
  resolved: new Set(),
  dismissed: new Set(),
  frozen: new Set(["open"]),
});

export function createReviewThreadManager(): ReviewThreadManager {
  const threads = new Map<string, ReviewThread>();
  const verdictsByDeltaSet = new Map<string, ReviewVerdict[]>();

  return {
    createThread(request: CreateReviewThreadRequest): ReviewThread {
      const createdAtMs = Date.now();
      const id = buildReviewThreadId();
      const thread = makeReviewThread({
        id,
        deltaSetId: request.deltaSetId,
        anchorKind: request.anchorKind,
        anchorId: request.anchorId,
        anchorSide: request.anchorSide,
        status: "open",
        comments: [
          makeComment({
            id: buildCommentId(),
            threadId: id,
            actor: request.actor,
            text: request.initialComment,
            createdAtMs,
          }),
        ],
        createdAtMs,
        resolvedAtMs: null,
        resolvedBy: null,
      });

      threads.set(id, thread);
      return thread;
    },

    addComment(id: string, request: AddReviewCommentRequest): ReviewThread {
      const thread = threads.get(id);
      if (!thread) throw new ReviewThreadManagerError("not-found", "not found");

      const updated = makeReviewThread({
        ...thread,
        comments: [
          ...thread.comments,
          makeComment({
            id: buildCommentId(),
            threadId: thread.id,
            actor: request.actor,
            text: request.text,
            createdAtMs: Date.now(),
          }),
        ],
      });

      threads.set(id, updated);
      return updated;
    },

    transition(id: string, request: TransitionReviewThreadRequest): ReviewThread {
      const thread = threads.get(id);
      if (!thread) throw new ReviewThreadManagerError("not-found", "not found");

      const allowed = TRANSITIONS[thread.status];
      if (!allowed.has(request.toStatus)) {
        throw new ReviewThreadManagerError(
          "invalid-transition",
          `invalid transition from ${thread.status} to ${request.toStatus}`,
        );
      }

      const terminal = request.toStatus === "resolved" || request.toStatus === "dismissed";
      const updated = makeReviewThread({
        ...thread,
        status: request.toStatus,
        resolvedAtMs: terminal ? Date.now() : null,
        resolvedBy: terminal ? request.actor : null,
      });

      threads.set(id, updated);
      return updated;
    },

    list(deltaSetId: string): readonly ReviewThread[] {
      return Array.from(threads.values()).filter((thread) => thread.deltaSetId === deltaSetId);
    },

    submitVerdict(request: SubmitReviewVerdictRequest): ReviewVerdict {
      const verdict = makeReviewVerdict({
        deltaSetId: request.deltaSetId,
        decision: request.decision,
        decidedBy: request.actor,
        decidedAtMs: Date.now(),
        rationale: request.rationale,
      });

      const verdicts = verdictsByDeltaSet.get(request.deltaSetId) ?? [];
      verdicts.push(verdict);
      verdictsByDeltaSet.set(request.deltaSetId, verdicts);
      return verdict;
    },

    verdicts(deltaSetId: string): readonly ReviewVerdict[] {
      return verdictsByDeltaSet.get(deltaSetId) ?? [];
    },
  };
}

function buildReviewThreadId(): string {
  return `review:auto-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function buildCommentId(): string {
  return `comment:auto-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
