import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

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

const OVERLAY_PROVIDER_IDS = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
] as const satisfies readonly OverlayProviderId[];

const OVERLAY_SIGNAL_KINDS = [
  "pass",
  "fail",
  "in-progress",
  "stale",
  "info",
] as const satisfies readonly OverlaySignalKind[];

const OVERLAY_PROVIDER_ID_SET: ReadonlySet<string> = new Set(OVERLAY_PROVIDER_IDS);
const OVERLAY_SIGNAL_KIND_SET: ReadonlySet<string> = new Set(OVERLAY_SIGNAL_KINDS);

export function overlayProviderIdFromString(value: string): OverlayProviderId {
  if (OVERLAY_PROVIDER_ID_SET.has(value)) {
    return value as OverlayProviderId;
  }

  throw new Error(`Unknown overlay provider id: ${value}`);
}

export function overlaySignalKindFromString(value: string): OverlaySignalKind {
  if (OVERLAY_SIGNAL_KIND_SET.has(value)) {
    return value as OverlaySignalKind;
  }

  throw new Error(`Unknown overlay signal kind: ${value}`);
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
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

export function makeOverlaySignal(partial: OverlaySignal): OverlaySignal {
  overlayProviderIdFromString(partial.providerId);

  if (partial.entityId === "") {
    throw new Error("OverlaySignal entityId must be non-empty");
  }

  overlaySignalKindFromString(partial.kind);

  if (partial.label === "") {
    throw new Error("OverlaySignal label must be non-empty");
  }

  validateTrustSignal(partial.trust);

  if (partial.emittedAtMs < 0) {
    throw new Error("OverlaySignal emittedAtMs must be >= 0");
  }

  return { ...partial };
}

export function makeOverlayLayer(partial: OverlayLayer): OverlayLayer {
  overlayProviderIdFromString(partial.providerId);

  const signals = partial.signals.map((signal) => makeOverlaySignal(signal));
  let previousEntityId: string | null = null;
  const seenProviderEntities = new Set<string>();

  for (const signal of signals) {
    if (signal.providerId !== partial.providerId) {
      throw new Error("OverlayLayer signals must match the layer providerId");
    }
    if (previousEntityId !== null && previousEntityId > signal.entityId) {
      throw new Error("OverlayLayer signals must be ordered by entityId");
    }
    previousEntityId = signal.entityId;

    const providerEntity = `${signal.providerId}\u0000${signal.entityId}`;
    if (seenProviderEntities.has(providerEntity)) {
      throw new Error("OverlayLayer signals must be unique by providerId/entityId");
    }
    seenProviderEntities.add(providerEntity);
  }

  if (partial.computedAtMs < 0) {
    throw new Error("OverlayLayer computedAtMs must be >= 0");
  }

  validateActor(partial.attributionActor, "OverlayLayer attributionActor");

  return {
    ...partial,
    signals,
  };
}

export function makeOperationalOverlay(
  partial: OperationalOverlay,
): OperationalOverlay {
  const layers = partial.layers.map((layer) => makeOverlayLayer(layer));
  const seenProviderIds = new Set<OverlayProviderId>();

  for (const layer of layers) {
    if (seenProviderIds.has(layer.providerId)) {
      throw new Error("OperationalOverlay layers must be unique by providerId");
    }
    seenProviderIds.add(layer.providerId);
  }

  if (partial.computedAtMs < 0) {
    throw new Error("OperationalOverlay computedAtMs must be >= 0");
  }

  return {
    ...partial,
    layers,
  };
}
