/**
 * Server-side mirror of app/lib/writeback.ts.
 *
 * Keep the vocabulary arrays aligned with the app substrate; the writeback
 * route accepts snake_case JSON and normalizes it to these camelCase records.
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

export type BehaviorSliceRole =
  | "entry-point"
  | "body"
  | "exit"
  | "error-path"
  | "test"
  | "fixture"
  | "annotation"
  | "guard"
  | "telemetry";

export type ChangeIntent =
  | "user-edit"
  | "agent-edit"
  | "promote-to-test"
  | "reconcile"
  | "revert";

export type ConflictKind =
  | "file-deleted"
  | "lines-changed"
  | "file-moved"
  | "whitespace-only";

export interface ChangeOrigin {
  actor: ActorKind;
  intent: ChangeIntent;
  timestampMs: number;
  requestId: string | null;
}

export interface ProposedSlice {
  filePath: string;
  startLine: number;
  endLine: number;
  newText: string;
  intentRole: BehaviorSliceRole;
}

export interface BehaviorDraft {
  id: string;
  behaviorId: string;
  proposedSlices: readonly ProposedSlice[];
  origin: ChangeOrigin;
  parentRevision: string;
  createdAtMs: number;
}

export interface WritebackPlan {
  draft: BehaviorDraft;
  effectiveDiff: string;
  appliesAgainstRevision: string;
  validatedAtMs: number;
}

export interface ConflictingFile {
  filePath: string;
  conflictKind: ConflictKind;
  sourceUnchanged: boolean;
}

export interface ConflictState {
  draftId: string;
  conflictingFiles: readonly ConflictingFile[];
  observedRevision: string;
  expectedRevision: string;
}

export type WritebackRequest = {
  draft: BehaviorDraft;
  apply: boolean;
};

export type ValidationResult =
  | { ok: true; value: WritebackRequest }
  | { ok: false; error: string; error_kind: "validation" };

export const BEHAVIOR_DRAFT_ID_PATTERN = /^draft:[a-zA-Z0-9._:-]+$/;
export const BEHAVIOR_ID_PATTERN = /^behavior:[a-zA-Z0-9._-]+$/;

export const ALL_ACTORS = [
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

export const BEHAVIOR_SLICE_ROLES = [
  "entry-point",
  "body",
  "exit",
  "error-path",
  "test",
  "fixture",
  "annotation",
  "guard",
  "telemetry",
] as const satisfies readonly BehaviorSliceRole[];

export const CHANGE_INTENTS = [
  "user-edit",
  "agent-edit",
  "promote-to-test",
  "reconcile",
  "revert",
] as const satisfies readonly ChangeIntent[];

export const CONFLICT_KINDS = [
  "file-deleted",
  "lines-changed",
  "file-moved",
  "whitespace-only",
] as const satisfies readonly ConflictKind[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const BEHAVIOR_SLICE_ROLE_SET: ReadonlySet<string> = new Set(BEHAVIOR_SLICE_ROLES);
const CHANGE_INTENT_SET: ReadonlySet<string> = new Set(CHANGE_INTENTS);
const CONFLICT_KIND_SET: ReadonlySet<string> = new Set(CONFLICT_KINDS);

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function behaviorSliceRoleFromString(value: string): BehaviorSliceRole {
  if (BEHAVIOR_SLICE_ROLE_SET.has(value)) return value as BehaviorSliceRole;
  throw new Error(`Unknown behavior slice role: ${value}`);
}

export function changeIntentFromString(value: string): ChangeIntent {
  if (CHANGE_INTENT_SET.has(value)) return value as ChangeIntent;
  throw new Error(`Unknown change intent: ${value}`);
}

export function conflictKindFromString(value: string): ConflictKind {
  if (CONFLICT_KIND_SET.has(value)) return value as ConflictKind;
  throw new Error(`Unknown conflict kind: ${value}`);
}

export function makeChangeOrigin(partial: ChangeOrigin): ChangeOrigin {
  try {
    actorFromString(partial.actor);
  } catch (error) {
    throw new Error("ChangeOrigin actor must be an ActorKind", { cause: error });
  }

  try {
    changeIntentFromString(partial.intent);
  } catch (error) {
    throw new Error("ChangeOrigin intent must be a ChangeIntent", { cause: error });
  }

  if (partial.timestampMs < 0) {
    throw new Error("ChangeOrigin timestampMs must be >= 0");
  }

  return { ...partial };
}

export function makeProposedSlice(partial: ProposedSlice): ProposedSlice {
  if (partial.startLine < 1) {
    throw new Error("ProposedSlice startLine must be >= 1");
  }
  if (partial.endLine < partial.startLine) {
    throw new Error("ProposedSlice endLine must be >= startLine");
  }
  try {
    behaviorSliceRoleFromString(partial.intentRole);
  } catch (error) {
    throw new Error("ProposedSlice intentRole must be a BehaviorSliceRole", {
      cause: error,
    });
  }

  return { ...partial };
}

export function makeBehaviorDraft(partial: BehaviorDraft): BehaviorDraft {
  if (!BEHAVIOR_DRAFT_ID_PATTERN.test(partial.id)) {
    throw new Error("BehaviorDraft id must match ^draft:[a-zA-Z0-9._:-]+$");
  }
  if (!BEHAVIOR_ID_PATTERN.test(partial.behaviorId)) {
    throw new Error("BehaviorDraft behaviorId must match Behavior id pattern");
  }
  if (partial.proposedSlices.length === 0) {
    throw new Error("BehaviorDraft proposedSlices must be non-empty");
  }

  const proposedSlices = partial.proposedSlices.map((proposedSlice) =>
    makeProposedSlice(proposedSlice),
  );
  const origin = makeChangeOrigin(partial.origin);

  if (partial.parentRevision === "") {
    throw new Error("BehaviorDraft parentRevision must be non-empty");
  }
  if (partial.createdAtMs < 0) {
    throw new Error("BehaviorDraft createdAtMs must be >= 0");
  }

  return {
    ...partial,
    proposedSlices,
    origin,
  };
}

export function makeWritebackPlan(partial: WritebackPlan): WritebackPlan {
  const draft = makeBehaviorDraft(partial.draft);

  if (draft.parentRevision !== partial.appliesAgainstRevision) {
    throw new Error(
      "WritebackPlan appliesAgainstRevision must match draft.parentRevision",
    );
  }
  if (partial.effectiveDiff === "") {
    throw new Error("WritebackPlan effectiveDiff must be non-empty");
  }
  if (partial.validatedAtMs < draft.createdAtMs) {
    throw new Error("WritebackPlan validatedAtMs must be >= draft.createdAtMs");
  }

  return { ...partial, draft };
}

export function makeConflictingFile(partial: ConflictingFile): ConflictingFile {
  try {
    conflictKindFromString(partial.conflictKind);
  } catch (error) {
    throw new Error("ConflictingFile conflictKind must be a ConflictKind", {
      cause: error,
    });
  }

  return { ...partial };
}

export function makeConflictState(partial: ConflictState): ConflictState {
  if (partial.conflictingFiles.length === 0) {
    throw new Error("ConflictState conflictingFiles must be non-empty");
  }

  const conflictingFiles = partial.conflictingFiles.map((conflictingFile) =>
    makeConflictingFile(conflictingFile),
  );

  if (partial.observedRevision === partial.expectedRevision) {
    throw new Error(
      "ConflictState observedRevision must differ from expectedRevision",
    );
  }

  return { ...partial, conflictingFiles };
}

export function validateWritebackRequest(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.apply !== "boolean") {
    return validationError("apply must be a boolean");
  }

  try {
    const draft = parseBehaviorDraft(record.draft);
    return { ok: true, value: { draft, apply: record.apply } };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "invalid draft");
  }
}

function parseBehaviorDraft(value: unknown): BehaviorDraft {
  const record = objectRecord(value, "draft");
  const proposedSlices = arrayValue(record.proposed_slices, "draft.proposed_slices")
    .map((slice, index) => parseProposedSlice(slice, index));
  const origin = parseChangeOrigin(record.origin);

  return makeBehaviorDraft({
    id: stringValue(record.id, "draft.id"),
    behaviorId: stringValue(record.behavior_id, "draft.behavior_id"),
    proposedSlices,
    origin,
    parentRevision: stringValue(record.parent_revision, "draft.parent_revision"),
    createdAtMs: numberValue(record.created_at_ms, "draft.created_at_ms"),
  });
}

function parseChangeOrigin(value: unknown): ChangeOrigin {
  const record = objectRecord(value, "draft.origin");
  const requestId = record.request_id;
  if (requestId !== null && typeof requestId !== "string") {
    throw new Error("draft.origin.request_id must be a string or null");
  }

  return makeChangeOrigin({
    actor: stringValue(record.actor, "draft.origin.actor") as ActorKind,
    intent: stringValue(record.intent, "draft.origin.intent") as ChangeIntent,
    timestampMs: numberValue(record.timestamp_ms, "draft.origin.timestamp_ms"),
    requestId,
  });
}

function parseProposedSlice(value: unknown, index: number): ProposedSlice {
  const field = `draft.proposed_slices[${index}]`;
  const record = objectRecord(value, field);
  const filePath = stringValue(record.file_path, `${field}.file_path`);
  validateRelativeWorkspacePath(filePath, `${field}.file_path`);

  return makeProposedSlice({
    filePath,
    startLine: numberValue(record.start_line, `${field}.start_line`),
    endLine: numberValue(record.end_line, `${field}.end_line`),
    newText: stringValue(record.new_text, `${field}.new_text`),
    intentRole: stringValue(record.intent_role, `${field}.intent_role`) as BehaviorSliceRole,
  });
}

export function validateRelativeWorkspacePath(filePath: string, field = "file_path"): void {
  if (filePath.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
  if (filePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filePath)) {
    throw new Error(`${field} must be relative`);
  }
  const parts = filePath.split(/[\\/]+/);
  if (parts.some((part) => part === "..")) {
    throw new Error(`${field} must not traverse outside the workspace`);
  }
}

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function numberValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function validationError(error: string): ValidationResult {
  return { ok: false, error, error_kind: "validation" };
}
