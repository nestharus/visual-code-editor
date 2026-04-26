/**
 * Server-side mirror of app/lib/overlay.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/overlays-vocab-parity.spec.ts pins the overlay vocabulary.
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

export type TrustState =
  | "grounded"
  | "candidate"
  | "conflicting"
  | "stale"
  | "orphaned";

export type GroundingSource =
  | "test"
  | "lsp-type"
  | "runtime-trace"
  | "annotation"
  | "user-confirmed"
  | "provider-verified";

export type OverlayProviderId =
  | "g:test"
  | "g:pr-delta"
  | "g:deploy"
  | "g:profile"
  | "g:task-active";

export type OverlaySignalKind =
  | "pass"
  | "fail"
  | "in-progress"
  | "stale"
  | "info";

export interface TrustSignal {
  state: TrustState;
  grounding: GroundingSource | null;
}

export interface OverlaySignal {
  providerId: OverlayProviderId;
  entityId: string;
  kind: OverlaySignalKind;
  label: string;
  trust: TrustSignal;
  emittedAtMs: number;
  detailUrl: string | null;
}

export interface OverlayLayer {
  providerId: OverlayProviderId;
  signals: readonly OverlaySignal[];
  computedAtMs: number;
  attributionActor: ActorKind;
}

export interface OperationalOverlay {
  layers: readonly OverlayLayer[];
  computedAtMs: number;
}

export type SetOverlayLayerRequest = {
  providerId: OverlayProviderId;
  signals: readonly OverlaySignal[];
  computedAtMs: number;
  attributionActor: ActorKind;
  requestId: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

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

export const ALL_TRUST_STATES = [
  "grounded",
  "candidate",
  "conflicting",
  "stale",
  "orphaned",
] as const satisfies readonly TrustState[];

export const ALL_GROUNDING_SOURCES = [
  "test",
  "lsp-type",
  "runtime-trace",
  "annotation",
  "user-confirmed",
  "provider-verified",
] as const satisfies readonly GroundingSource[];

export const OVERLAY_PROVIDER_IDS = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
] as const satisfies readonly OverlayProviderId[];

export const OVERLAY_SIGNAL_KINDS = [
  "pass",
  "fail",
  "in-progress",
  "stale",
  "info",
] as const satisfies readonly OverlaySignalKind[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const TRUST_STATE_SET: ReadonlySet<string> = new Set(ALL_TRUST_STATES);
const GROUNDING_SOURCE_SET: ReadonlySet<string> = new Set(ALL_GROUNDING_SOURCES);
const OVERLAY_PROVIDER_ID_SET: ReadonlySet<string> = new Set(OVERLAY_PROVIDER_IDS);
const OVERLAY_SIGNAL_KIND_SET: ReadonlySet<string> = new Set(OVERLAY_SIGNAL_KINDS);

export function isValidProviderId(value: unknown): value is OverlayProviderId {
  return typeof value === "string" && OVERLAY_PROVIDER_ID_SET.has(value);
}

export function isValidSignalKind(value: unknown): value is OverlaySignalKind {
  return typeof value === "string" && OVERLAY_SIGNAL_KIND_SET.has(value);
}

export function overlayProviderIdFromString(value: string): OverlayProviderId {
  if (isValidProviderId(value)) return value;
  throw new Error(`Unknown overlay provider id: ${value}`);
}

export function overlaySignalKindFromString(value: string): OverlaySignalKind {
  if (isValidSignalKind(value)) return value;
  throw new Error(`Unknown overlay signal kind: ${value}`);
}

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function trustStateFromString(value: string): TrustState {
  if (TRUST_STATE_SET.has(value)) return value as TrustState;
  throw new Error(`Unknown trust state: ${value}`);
}

export function groundingSourceFromString(value: string): GroundingSource {
  if (GROUNDING_SOURCE_SET.has(value)) return value as GroundingSource;
  throw new Error(`Unknown grounding source: ${value}`);
}

export function validateSetOverlayLayerRequest(
  payload: unknown,
): ValidationResult<SetOverlayLayerRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (!isValidProviderId(candidate.provider_id)) {
    return validationError("provider_id must be an OverlayProviderId");
  }
  if (!Array.isArray(candidate.signals)) {
    return validationError("signals must be an array");
  }
  if (
    typeof candidate.computed_at_ms !== "number" ||
    !Number.isFinite(candidate.computed_at_ms) ||
    candidate.computed_at_ms < 0
  ) {
    return validationError("computed_at_ms must be a non-negative number");
  }
  if (typeof candidate.attribution_actor !== "string") {
    return validationError("attribution_actor must be an ActorKind");
  }

  let attributionActor: ActorKind;
  try {
    attributionActor = actorFromString(candidate.attribution_actor);
  } catch {
    return validationError("attribution_actor must be an ActorKind");
  }

  if (typeof candidate.request_id !== "string" || candidate.request_id.trim().length === 0) {
    return validationError("request_id must be a non-empty string");
  }

  const signals: OverlaySignal[] = [];
  let previousEntityId: string | null = null;
  const seenEntityIds = new Set<string>();

  for (const [index, signalPayload] of candidate.signals.entries()) {
    const signalValidation = validateOverlaySignal(
      signalPayload,
      candidate.provider_id,
      index,
    );
    if (!signalValidation.ok) return signalValidation;

    const signal = signalValidation.value;
    if (previousEntityId !== null && previousEntityId > signal.entityId) {
      return validationError("signals must be sorted ascending by entity_id");
    }
    previousEntityId = signal.entityId;

    if (seenEntityIds.has(signal.entityId)) {
      return validationError("signals must be unique by entity_id");
    }
    seenEntityIds.add(signal.entityId);
    signals.push(signal);
  }

  return {
    ok: true,
    value: {
      providerId: candidate.provider_id,
      signals,
      computedAtMs: candidate.computed_at_ms,
      attributionActor,
      requestId: candidate.request_id,
    },
  };
}

export function makeOverlayLayer(partial: OverlayLayer): OverlayLayer {
  overlayProviderIdFromString(partial.providerId);

  const signals = partial.signals.map((signal, index) => {
    const validation = validateOverlaySignal(signal, partial.providerId, index);
    if (!validation.ok) throw new Error(validation.error);
    return validation.value;
  });

  let previousEntityId: string | null = null;
  const seenEntityIds = new Set<string>();
  for (const signal of signals) {
    if (previousEntityId !== null && previousEntityId > signal.entityId) {
      throw new Error("OverlayLayer signals must be ordered by entityId");
    }
    previousEntityId = signal.entityId;

    if (seenEntityIds.has(signal.entityId)) {
      throw new Error("OverlayLayer signals must be unique by entityId");
    }
    seenEntityIds.add(signal.entityId);
  }

  if (!Number.isFinite(partial.computedAtMs) || partial.computedAtMs < 0) {
    throw new Error("OverlayLayer computedAtMs must be >= 0");
  }
  actorFromString(partial.attributionActor);

  return { ...partial, signals };
}

function validateOverlaySignal(
  payload: unknown,
  layerProviderId: OverlayProviderId,
  index: number,
): ValidationResult<OverlaySignal> {
  if (!payload || typeof payload !== "object") {
    return validationError(`signals[${index}] must be an object`);
  }

  const candidate = payload as Record<string, unknown>;
  if (!isValidProviderId(candidate.providerId)) {
    return validationError(`signals[${index}].providerId must be an OverlayProviderId`);
  }
  if (candidate.providerId !== layerProviderId) {
    return validationError("signals must match the layer provider_id");
  }
  if (typeof candidate.entityId !== "string" || candidate.entityId.length === 0) {
    return validationError(`signals[${index}].entityId must be a non-empty string`);
  }
  if (!isValidSignalKind(candidate.kind)) {
    return validationError(`signals[${index}].kind must be an OverlaySignalKind`);
  }
  if (typeof candidate.label !== "string" || candidate.label.length === 0) {
    return validationError(`signals[${index}].label must be a non-empty string`);
  }

  const trustValidation = validateTrustSignal(candidate.trust, index);
  if (!trustValidation.ok) return trustValidation;

  if (
    typeof candidate.emittedAtMs !== "number" ||
    !Number.isFinite(candidate.emittedAtMs) ||
    candidate.emittedAtMs < 0
  ) {
    return validationError(`signals[${index}].emittedAtMs must be a non-negative number`);
  }
  if (candidate.detailUrl !== null && typeof candidate.detailUrl !== "string") {
    return validationError(`signals[${index}].detailUrl must be a string or null`);
  }

  return {
    ok: true,
    value: {
      providerId: candidate.providerId,
      entityId: candidate.entityId,
      kind: candidate.kind,
      label: candidate.label,
      trust: trustValidation.value,
      emittedAtMs: candidate.emittedAtMs,
      detailUrl: candidate.detailUrl,
    },
  };
}

function validateTrustSignal(payload: unknown, signalIndex: number): ValidationResult<TrustSignal> {
  if (!payload || typeof payload !== "object") {
    return validationError(`signals[${signalIndex}].trust must be an object`);
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.state !== "string") {
    return validationError(`signals[${signalIndex}].trust.state must be a TrustState`);
  }

  let state: TrustState;
  try {
    state = trustStateFromString(candidate.state);
  } catch {
    return validationError(`signals[${signalIndex}].trust.state must be a TrustState`);
  }

  let grounding: GroundingSource | null;
  if (candidate.grounding === null) {
    grounding = null;
  } else if (typeof candidate.grounding === "string") {
    try {
      grounding = groundingSourceFromString(candidate.grounding);
    } catch {
      return validationError(
        `signals[${signalIndex}].trust.grounding must be a GroundingSource or null`,
      );
    }
  } else {
    return validationError(
      `signals[${signalIndex}].trust.grounding must be a GroundingSource or null`,
    );
  }

  const hasGrounding = grounding !== null;
  const isGrounded = state === "grounded";
  if (isGrounded !== hasGrounding) {
    return validationError("trust grounding must be set iff state is grounded");
  }

  return { ok: true, value: { state, grounding } };
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
