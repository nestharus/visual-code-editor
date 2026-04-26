import { actorFromString, type ActorKind } from "./actors";
import {
  BEHAVIOR_ID_PATTERN,
  behaviorSliceRoleFromString,
  type BehaviorSliceRole,
} from "./behavior";

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

export const BEHAVIOR_DRAFT_ID_PATTERN = /^draft:[a-zA-Z0-9._:-]+$/;

const CHANGE_INTENTS = [
  "user-edit",
  "agent-edit",
  "promote-to-test",
  "reconcile",
  "revert",
] as const satisfies readonly ChangeIntent[];

const CONFLICT_KINDS = [
  "file-deleted",
  "lines-changed",
  "file-moved",
  "whitespace-only",
] as const satisfies readonly ConflictKind[];

const CHANGE_INTENT_SET: ReadonlySet<string> = new Set(CHANGE_INTENTS);
const CONFLICT_KIND_SET: ReadonlySet<string> = new Set(CONFLICT_KINDS);

export function changeIntentFromString(value: string): ChangeIntent {
  if (CHANGE_INTENT_SET.has(value)) {
    return value as ChangeIntent;
  }

  throw new Error(`Unknown change intent: ${value}`);
}

export function conflictKindFromString(value: string): ConflictKind {
  if (CONFLICT_KIND_SET.has(value)) {
    return value as ConflictKind;
  }

  throw new Error(`Unknown conflict kind: ${value}`);
}

function validateProposedSliceLineRange(proposedSlice: ProposedSlice): void {
  if (proposedSlice.startLine < 1) {
    throw new Error("ProposedSlice startLine must be >= 1");
  }
  if (proposedSlice.endLine < proposedSlice.startLine) {
    throw new Error("ProposedSlice endLine must be >= startLine");
  }
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
    throw new Error("ChangeOrigin intent must be a ChangeIntent", {
      cause: error,
    });
  }

  if (partial.timestampMs < 0) {
    throw new Error("ChangeOrigin timestampMs must be >= 0");
  }

  return { ...partial };
}

export function makeProposedSlice(partial: ProposedSlice): ProposedSlice {
  validateProposedSliceLineRange(partial);
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

  return {
    ...partial,
    draft,
  };
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

  return {
    ...partial,
    conflictingFiles,
  };
}
