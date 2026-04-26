import { familyOf, type ActorKind } from "./actors";
import {
  type ChangeEvent,
  type ChangeEventKind,
  type ChangeEventTier,
  type UserContext,
} from "./user-context";

export type ClassifierReason =
  | "always-immediate"
  | "always-stashed"
  | "blocking"
  | "scored";

export interface ClassifierConfig {
  recencyWindowMs: number;
  recencyWeight: number;
  onSurfaceWeight: number;
  providerWeight: number;
  actorWeight: number;
  contextMatchWeight: number;
  immediateThreshold: number;
  stashedThreshold: number;
  providerTierWeight: Readonly<Partial<Record<ActorKind, number>>>;
}

export interface ClassifierDecision {
  tier: ChangeEventTier;
  totalScore: number;
  reason: ClassifierReason;
  rulesFired: readonly string[];
}

export const ALWAYS_IMMEDIATE_KINDS: ReadonlySet<ChangeEventKind> =
  Object.freeze(
    new Set<ChangeEventKind>([
      "entity-renamed",
      "entity-split",
      "entity-merged",
      "entity-unmatched",
      "review-thread-update",
      "agents-runtime-health",
    ]),
  );

export const ALWAYS_STASHED_KINDS: ReadonlySet<ChangeEventKind> =
  Object.freeze(new Set<ChangeEventKind>(["provider-sync", "ci-run-finished"]));

const ACTOR_KINDS = [
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

export const ACTOR_TIER_WEIGHT: Readonly<Record<ActorKind, number>> =
  Object.freeze(
    Object.fromEntries(
      ACTOR_KINDS.map((actor) => [actor, actorTierWeight(actor)]),
    ) as Record<ActorKind, number>,
  );

export const DEFAULT_CONFIG: ClassifierConfig = makeClassifierConfig();

export function makeClassifierConfig(
  partial: Partial<ClassifierConfig> = {},
): ClassifierConfig {
  const config: ClassifierConfig = {
    recencyWindowMs: 600_000,
    recencyWeight: 0.30,
    onSurfaceWeight: 0.25,
    providerWeight: 0.10,
    actorWeight: 0.20,
    contextMatchWeight: 0.15,
    immediateThreshold: 0.55,
    stashedThreshold: 0.20,
    providerTierWeight: {},
    ...partial,
  };

  validateClassifierConfig(config);

  return Object.freeze({
    ...config,
    providerTierWeight: Object.freeze({ ...config.providerTierWeight }),
  });
}

export function classify(
  event: ChangeEvent,
  context: UserContext,
  config: ClassifierConfig,
  nowMs: number,
): ClassifierDecision {
  if (ALWAYS_IMMEDIATE_KINDS.has(event.kind)) {
    return Object.freeze({
      tier: "immediate",
      totalScore: 1.0,
      reason: "always-immediate",
      rulesFired: Object.freeze(["always-immediate"]),
    });
  }

  if (ALWAYS_STASHED_KINDS.has(event.kind)) {
    return Object.freeze({
      tier: "stashed",
      totalScore: 0.0,
      reason: "always-stashed",
      rulesFired: Object.freeze(["always-stashed"]),
    });
  }

  if (event.blocking) {
    return Object.freeze({
      tier: "immediate",
      totalScore: 1.0,
      reason: "blocking",
      rulesFired: Object.freeze(["blocking"]),
    });
  }

  const affectedEntityIds = new Set(event.affectedEntityIds);
  const openedSurfaceIds = new Set(
    context.openedSurfaces.map((surface) => surface.entityId),
  );
  const activeContextIds = new Set([
    ...context.activeTaskIds,
    ...context.activeSliceIds,
  ]);

  const recencyScore = clamp(
    (nowMs - event.timestampMs) / config.recencyWindowMs,
    0.0,
    1.0,
  );
  const onSurfaceScore = intersects(affectedEntityIds, openedSurfaceIds)
    ? 1.0
    : 0.0;
  const providerTierScore = config.providerTierWeight[event.actor] ?? 0.0;
  const actorTierScore = ACTOR_TIER_WEIGHT[event.actor];
  const contextMatchScore = intersects(affectedEntityIds, activeContextIds)
    ? 0.5
    : 0.0;

  const rawScore =
    (1 - recencyScore) * config.recencyWeight +
    onSurfaceScore * config.onSurfaceWeight +
    providerTierScore * config.providerWeight +
    actorTierScore * config.actorWeight +
    contextMatchScore * config.contextMatchWeight;
  const weightSum =
    config.recencyWeight +
    config.onSurfaceWeight +
    config.providerWeight +
    config.actorWeight +
    config.contextMatchWeight;
  const totalScore =
    weightSum > 0 ? clamp(rawScore / weightSum, 0.0, 1.0) : 0.0;

  let tier: ChangeEventTier;
  if (totalScore >= config.immediateThreshold) {
    tier = "immediate";
  } else if (totalScore >= config.stashedThreshold) {
    tier = "stashed";
  } else {
    tier = "suppressed";
  }

  return Object.freeze({
    tier,
    totalScore,
    reason: "scored",
    rulesFired: Object.freeze(
      scoredRulesFired({
        recencyScore,
        onSurfaceScore,
        providerTierScore,
        actorTierScore,
        contextMatchScore,
        config,
      }),
    ),
  });
}

function validateClassifierConfig(config: ClassifierConfig): void {
  if (config.recencyWindowMs <= 0) {
    throw new Error("ClassifierConfig recencyWindowMs must be > 0");
  }

  for (const [fieldName, value] of [
    ["recencyWeight", config.recencyWeight],
    ["onSurfaceWeight", config.onSurfaceWeight],
    ["providerWeight", config.providerWeight],
    ["actorWeight", config.actorWeight],
    ["contextMatchWeight", config.contextMatchWeight],
  ] as const) {
    if (value < 0) {
      throw new Error(`ClassifierConfig ${fieldName} must be >= 0`);
    }
  }

  if (!inUnitInterval(config.immediateThreshold)) {
    throw new Error(
      "ClassifierConfig immediateThreshold must be between 0 and 1",
    );
  }
  if (!inUnitInterval(config.stashedThreshold)) {
    throw new Error(
      "ClassifierConfig stashedThreshold must be between 0 and 1",
    );
  }
  if (config.immediateThreshold < config.stashedThreshold) {
    throw new Error(
      "ClassifierConfig immediateThreshold must be >= stashedThreshold",
    );
  }

  for (const weight of Object.values(config.providerTierWeight)) {
    if (weight === undefined) {
      continue;
    }
    if (weight < 0) {
      throw new Error(
        "ClassifierConfig providerTierWeight values must be >= 0",
      );
    }
    if (weight > 1) {
      throw new Error(
        "ClassifierConfig providerTierWeight values must be <= 1",
      );
    }
  }
}

function actorTierWeight(actor: ActorKind): number {
  if (actor === "you-other-session") {
    return 1.0;
  }
  if (actor === "you-this-session") {
    return 0.1;
  }
  if (actor === "another-user") {
    return 0.9;
  }
  if (actor === "unknown-external") {
    return 0.5;
  }

  switch (familyOf(actor)) {
    case "agents":
      return 0.7;
    case "product":
      return 0.5;
    case "provider":
      return 0.4;
    case "ci":
      return 0.3;
    case "git-op":
      return 0.3;
    case "generator":
      return 0.2;
    default:
      throw new Error(`Unknown actor kind: ${actor}`);
  }
}

function scoredRulesFired({
  recencyScore,
  onSurfaceScore,
  providerTierScore,
  actorTierScore,
  contextMatchScore,
  config,
}: {
  recencyScore: number;
  onSurfaceScore: number;
  providerTierScore: number;
  actorTierScore: number;
  contextMatchScore: number;
  config: ClassifierConfig;
}): string[] {
  const rules: string[] = [];
  if (config.recencyWeight > 0 && 1 - recencyScore > 0) {
    rules.push("recency");
  }
  if (config.onSurfaceWeight > 0 && onSurfaceScore > 0) {
    rules.push("on-surface");
  }
  if (config.providerWeight > 0 && providerTierScore > 0) {
    rules.push("provider-tier");
  }
  if (config.actorWeight > 0 && actorTierScore > 0) {
    rules.push("actor-tier");
  }
  if (config.contextMatchWeight > 0 && contextMatchScore > 0) {
    rules.push("context-match");
  }
  return rules;
}

function intersects<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function inUnitInterval(value: number): boolean {
  return value >= 0 && value <= 1;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}
