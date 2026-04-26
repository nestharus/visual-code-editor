import {
  sliceLifecycleStateFromString,
  type SliceLifecycleState,
} from "./slice";

export const ALL_LIFECYCLE_REASONS = [
  "still-active",
  "entered-expiring",
  "entered-tombstoned",
  "tombstone-purgeable",
  "still-pinned",
  "still-recovered",
  "dismissed-terminal",
] as const;

export type LifecycleReason = (typeof ALL_LIFECYCLE_REASONS)[number];

export interface LifecycleConfig {
  expiringWarningMs: number;
  tombstoneGraceMs: number;
  tombstoneRetentionMs: number;
}

export interface ArtifactSnapshot {
  artifactId: string;
  currentState: SliceLifecycleState;
  createdAtMs: number;
  ttlMs: number | null;
  tombstonedAtMs: number | null;
}

export interface LifecycleDecision {
  nextState: SliceLifecycleState;
  changed: boolean;
  reason: LifecycleReason;
}

export const DEFAULT_CONFIG: LifecycleConfig = Object.freeze({
  expiringWarningMs: 300_000,
  tombstoneGraceMs: 0,
  tombstoneRetentionMs: 86_400_000,
});

const LIFECYCLE_REASON_SET: ReadonlySet<string> = new Set(
  ALL_LIFECYCLE_REASONS,
);

function requireInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
}

export function lifecycleReasonFromString(value: string): LifecycleReason {
  if (LIFECYCLE_REASON_SET.has(value)) {
    return value as LifecycleReason;
  }

  throw new Error(`Unknown lifecycle reason: ${value}`);
}

export function makeLifecycleConfig(
  partial: Partial<LifecycleConfig> = {},
): LifecycleConfig {
  const config = {
    ...DEFAULT_CONFIG,
    ...partial,
  };

  requireInteger(config.expiringWarningMs, "expiringWarningMs");
  requireInteger(config.tombstoneGraceMs, "tombstoneGraceMs");
  requireInteger(config.tombstoneRetentionMs, "tombstoneRetentionMs");

  if (config.expiringWarningMs < 0) {
    throw new Error("expiringWarningMs must be >= 0");
  }
  if (config.tombstoneGraceMs < 0) {
    throw new Error("tombstoneGraceMs must be >= 0");
  }
  if (config.tombstoneRetentionMs < 0) {
    throw new Error("tombstoneRetentionMs must be >= 0");
  }

  return Object.freeze(config);
}

export function makeArtifactSnapshot(
  snapshot: ArtifactSnapshot,
): ArtifactSnapshot {
  if (typeof snapshot.artifactId !== "string" || snapshot.artifactId === "") {
    throw new Error("artifactId must be a non-empty string");
  }

  sliceLifecycleStateFromString(snapshot.currentState);

  requireInteger(snapshot.createdAtMs, "createdAtMs");
  if (snapshot.createdAtMs < 0) {
    throw new Error("createdAtMs must be >= 0");
  }

  if (snapshot.ttlMs !== null) {
    requireInteger(snapshot.ttlMs, "ttlMs");
  }
  if (snapshot.tombstonedAtMs !== null) {
    requireInteger(snapshot.tombstonedAtMs, "tombstonedAtMs");
  }

  if (snapshot.currentState === "pinned") {
    if (snapshot.ttlMs !== null) {
      throw new Error("PINNED snapshots require ttlMs null");
    }
  } else if (snapshot.ttlMs === null) {
    throw new Error("non-PINNED snapshots require ttlMs");
  }

  if (
    snapshot.currentState === "tombstoned" &&
    snapshot.tombstonedAtMs === null
  ) {
    throw new Error("TOMBSTONED snapshots require tombstonedAtMs");
  }

  if (
    (snapshot.currentState === "active" ||
      snapshot.currentState === "expiring" ||
      snapshot.currentState === "recovered") &&
    snapshot.ttlMs === null
  ) {
    throw new Error("ACTIVE, EXPIRING, and RECOVERED snapshots require ttlMs");
  }

  return Object.freeze({ ...snapshot });
}

export function makeLifecycleDecision(
  decision: LifecycleDecision,
): LifecycleDecision {
  sliceLifecycleStateFromString(decision.nextState);
  if (typeof decision.changed !== "boolean") {
    throw new Error("changed must be a boolean");
  }
  lifecycleReasonFromString(decision.reason);

  return Object.freeze({ ...decision });
}

export function evaluate(
  rawSnapshot: ArtifactSnapshot,
  nowMs: number,
  rawConfig: LifecycleConfig,
): LifecycleDecision {
  requireInteger(nowMs, "nowMs");

  const snapshot = makeArtifactSnapshot(rawSnapshot);
  const config = makeLifecycleConfig(rawConfig);
  const currentState = snapshot.currentState;

  if (currentState === "dismissed") {
    return decision(currentState, "dismissed", "dismissed-terminal");
  }

  if (currentState === "pinned") {
    return decision(currentState, "pinned", "still-pinned");
  }

  if (currentState === "tombstoned") {
    if (snapshot.tombstonedAtMs === null) {
      throw new Error("tombstonedAtMs required for TOMBSTONED");
    }
    if (
      nowMs - snapshot.tombstonedAtMs >=
      config.tombstoneRetentionMs
    ) {
      return decision(currentState, "tombstoned", "tombstone-purgeable");
    }
    return decision(currentState, "tombstoned", "still-recovered");
  }

  if (snapshot.ttlMs === null) {
    throw new Error("ttlMs required for non-PINNED non-TOMBSTONED");
  }

  const timeUntilTtl = snapshot.ttlMs - nowMs;

  if (timeUntilTtl <= -config.tombstoneGraceMs) {
    return decision(currentState, "tombstoned", "entered-tombstoned");
  }

  if (timeUntilTtl <= config.expiringWarningMs) {
    return decision(currentState, "expiring", "entered-expiring");
  }

  if (currentState === "recovered") {
    return decision(currentState, "recovered", "still-recovered");
  }

  return decision(currentState, "active", "still-active");
}

function decision(
  currentState: SliceLifecycleState,
  nextState: SliceLifecycleState,
  reason: LifecycleReason,
): LifecycleDecision {
  return makeLifecycleDecision({
    nextState,
    changed: nextState !== currentState,
    reason,
  });
}
