import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

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

export const PROVIDER_ID_PATTERN = /^provider:[a-zA-Z0-9._-]+$/;

const PROVIDER_KINDS = [
  "github",
  "gitlab",
  "jira",
  "linear",
  "generic-http",
] as const satisfies readonly ProviderKind[];

const PROVIDER_HEALTH_STATES = [
  "grounded",
  "stale",
  "conflicting",
] as const satisfies readonly ProviderHealthState[];

const PROVIDER_KIND_SET: ReadonlySet<string> = new Set(PROVIDER_KINDS);
const PROVIDER_HEALTH_STATE_SET: ReadonlySet<string> = new Set(
  PROVIDER_HEALTH_STATES,
);

export function providerKindFromString(value: string): ProviderKind {
  if (PROVIDER_KIND_SET.has(value)) {
    return value as ProviderKind;
  }

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

function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function validateTrustSignal(trust: TrustSignal): void {
  trustStateFromString(trust.state);
  if (trust.grounding !== null) {
    groundingSourceFromString(trust.grounding);
  }

  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
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

  return { ...partial };
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

  try {
    actorFromString(partial.attributionActor);
  } catch (error) {
    throw new Error("Provider attributionActor must be an ActorKind", {
      cause: error,
    });
  }

  return {
    ...partial,
    config: { ...partial.config },
    mappings,
  };
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
