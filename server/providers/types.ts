/**
 * Server-side mirror of app/lib/provider.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/providers-vocab-parity.spec.ts pins the provider vocabulary.
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

export interface TrustSignal {
  state: TrustState;
  grounding: GroundingSource | null;
}

export type ProviderKind =
  | "github"
  | "gitlab"
  | "jira"
  | "linear"
  | "generic-http";

export type ProviderHealthState = "grounded" | "stale" | "conflicting";

export interface ProviderEntityMapping {
  providerField: string;
  workspaceField: string;
  trust: TrustSignal;
  evidenceSource: string;
}

export interface Provider {
  id: string;
  kind: ProviderKind;
  label: string;
  workspaceId: string;
  config: Record<string, string | undefined>;
  mappings: readonly ProviderEntityMapping[];
  attributionActor: ActorKind;
  createdAtMs: number;
}

export interface ProviderConnection {
  providerId: string;
  health: ProviderHealthState;
  lastSuccessfulSyncMs: number | null;
  lastFailureMs: number | null;
  lastFailureReason: string | null;
  pendingRequestCount: number;
}

export type CreateProviderRequest = {
  kind: ProviderKind;
  label: string;
  workspaceId: string;
  config: Record<string, string>;
  mappings: readonly ProviderEntityMapping[];
  actor: ActorKind;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

export class ProviderAdapterValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderAdapterValidationError";
  }
}

export const PROVIDER_ID_PATTERN = /^provider:[a-zA-Z0-9._-]+$/;

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

export const PROVIDER_KINDS = [
  "github",
  "gitlab",
  "jira",
  "linear",
  "generic-http",
] as const satisfies readonly ProviderKind[];

export const PROVIDER_HEALTH_STATES = [
  "grounded",
  "stale",
  "conflicting",
] as const satisfies readonly ProviderHealthState[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const TRUST_STATE_SET: ReadonlySet<string> = new Set(ALL_TRUST_STATES);
const GROUNDING_SOURCE_SET: ReadonlySet<string> = new Set(ALL_GROUNDING_SOURCES);
const PROVIDER_KIND_SET: ReadonlySet<string> = new Set(PROVIDER_KINDS);
const PROVIDER_HEALTH_STATE_SET: ReadonlySet<string> = new Set(
  PROVIDER_HEALTH_STATES,
);

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

export function providerKindFromString(value: string): ProviderKind {
  if (PROVIDER_KIND_SET.has(value)) return value as ProviderKind;
  throw new Error(`Unknown provider kind: ${value}`);
}

export function providerHealthStateFromString(
  value: string,
): ProviderHealthState {
  if (PROVIDER_HEALTH_STATE_SET.has(value)) {
    return value as ProviderHealthState;
  }
  throw new Error(`Unknown provider health state: ${value}`);
}

export function validateCreateProviderRequest(
  payload: unknown,
): ValidationResult<CreateProviderRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.kind !== "string") {
    return validationError("kind must be a ProviderKind");
  }

  let kind: ProviderKind;
  try {
    kind = providerKindFromString(candidate.kind);
  } catch {
    return validationError("kind must be a ProviderKind");
  }

  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) {
    return validationError("label must be a non-empty string");
  }

  if (
    typeof candidate.workspace_id !== "string" ||
    candidate.workspace_id.trim().length === 0
  ) {
    return validationError("workspace_id must be a non-empty string");
  }

  const configValidation = validateProviderConfig(candidate.config);
  if (!configValidation.ok) return configValidation;

  const mappingsPayload = candidate.mappings ?? [];
  if (!Array.isArray(mappingsPayload)) {
    return validationError("mappings must be an array when supplied");
  }

  const mappings: ProviderEntityMapping[] = [];
  for (const [index, mappingPayload] of mappingsPayload.entries()) {
    const mappingValidation = validateProviderEntityMapping(mappingPayload, index);
    if (!mappingValidation.ok) return mappingValidation;
    mappings.push(mappingValidation.value);
  }

  const actorValue = candidate.actor ?? "you-this-session";
  if (typeof actorValue !== "string") {
    return validationError("actor must be an ActorKind when supplied");
  }

  let actor: ActorKind;
  try {
    actor = actorFromString(actorValue);
  } catch {
    return validationError("actor must be an ActorKind when supplied");
  }

  return {
    ok: true,
    value: {
      kind,
      label: candidate.label.trim(),
      workspaceId: candidate.workspace_id.trim(),
      config: configValidation.value,
      mappings,
      actor,
    },
  };
}

export function makeProvider(partial: Provider): Provider {
  if (!PROVIDER_ID_PATTERN.test(partial.id)) {
    throw new Error("Provider id must match ^provider:[a-zA-Z0-9._-]+$");
  }
  providerKindFromString(partial.kind);
  validateNonEmptyString(partial.label, "Provider label");
  validateNonEmptyString(partial.workspaceId, "Provider workspaceId");

  for (const key of Object.keys(partial.config)) {
    validateNonEmptyString(key, "Provider config keys");
  }

  const mappings = partial.mappings.map((mapping) =>
    makeProviderEntityMapping(mapping),
  );

  actorFromString(partial.attributionActor);

  return {
    ...partial,
    config: { ...partial.config },
    mappings,
  };
}

export function makeProviderEntityMapping(
  partial: ProviderEntityMapping,
): ProviderEntityMapping {
  validateNonEmptyString(
    partial.providerField,
    "ProviderEntityMapping providerField",
  );
  validateNonEmptyString(
    partial.workspaceField,
    "ProviderEntityMapping workspaceField",
  );
  validateTrustSignal(partial.trust);
  validateNonEmptyString(
    partial.evidenceSource,
    "ProviderEntityMapping evidenceSource",
  );

  return { ...partial };
}

export function makeProviderConnection(
  partial: ProviderConnection,
): ProviderConnection {
  if (!PROVIDER_ID_PATTERN.test(partial.providerId)) {
    throw new Error(
      "ProviderConnection providerId must match ^provider:[a-zA-Z0-9._-]+$",
    );
  }
  providerHealthStateFromString(partial.health);

  if (partial.pendingRequestCount < 0) {
    throw new Error("ProviderConnection pendingRequestCount must be >= 0");
  }

  return { ...partial };
}

function validateProviderConfig(
  payload: unknown,
): ValidationResult<Record<string, string>> {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return validationError("config must be an object");
  }

  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.trim().length === 0) {
      return validationError("config keys must be non-empty strings");
    }
    if (typeof value !== "string") {
      return validationError("config values must be strings");
    }
    config[key] = value;
  }

  return { ok: true, value: config };
}

function validateProviderEntityMapping(
  payload: unknown,
  index: number,
): ValidationResult<ProviderEntityMapping> {
  if (!payload || typeof payload !== "object") {
    return validationError(`mappings[${index}] must be an object`);
  }

  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.providerField !== "string" ||
    candidate.providerField.trim().length === 0
  ) {
    return validationError(`mappings[${index}].providerField must be a non-empty string`);
  }
  if (
    typeof candidate.workspaceField !== "string" ||
    candidate.workspaceField.trim().length === 0
  ) {
    return validationError(`mappings[${index}].workspaceField must be a non-empty string`);
  }
  if (
    typeof candidate.evidenceSource !== "string" ||
    candidate.evidenceSource.trim().length === 0
  ) {
    return validationError(`mappings[${index}].evidenceSource must be a non-empty string`);
  }

  const trustValidation = validateTrustSignal(candidate.trust);
  if (!trustValidation.ok) return trustValidation;

  return {
    ok: true,
    value: {
      providerField: candidate.providerField.trim(),
      workspaceField: candidate.workspaceField.trim(),
      trust: trustValidation.value,
      evidenceSource: candidate.evidenceSource.trim(),
    },
  };
}

function validateTrustSignal(payload: unknown): ValidationResult<TrustSignal> {
  if (!payload || typeof payload !== "object") {
    return validationError("trust must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.state !== "string") {
    return validationError("trust.state must be a TrustState");
  }

  let state: TrustState;
  try {
    state = trustStateFromString(candidate.state);
  } catch {
    return validationError("trust.state must be a TrustState");
  }

  let grounding: GroundingSource | null;
  if (candidate.grounding === null) {
    grounding = null;
  } else if (typeof candidate.grounding === "string") {
    try {
      grounding = groundingSourceFromString(candidate.grounding);
    } catch {
      return validationError("trust.grounding must be a GroundingSource or null");
    }
  } else {
    return validationError("trust.grounding must be a GroundingSource or null");
  }

  const hasGrounding = grounding !== null;
  const isGrounded = state === "grounded";
  if (isGrounded !== hasGrounding) {
    return validationError("trust grounding must be set iff state is grounded");
  }

  return { ok: true, value: { state, grounding } };
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
