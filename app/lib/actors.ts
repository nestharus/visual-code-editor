/**
 * Canonical actor registry for workspace state changes.
 *
 * New actors must be added through proposal cycles, not ad hoc.
 */

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
] as const;

export type ActorKind = (typeof ALL_ACTORS)[number];

export type ActorFamily =
  | "you"
  | "another-user"
  | "agents"
  | "generator"
  | "ci"
  | "git-op"
  | "provider"
  | "product"
  | "unknown";

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);

export function familyOf(actor: ActorKind): ActorFamily {
  if (actor.startsWith("you-")) {
    return "you";
  }
  if (actor === "another-user") {
    return "another-user";
  }
  if (actor.startsWith("agents:")) {
    return "agents";
  }
  if (actor === "generator") {
    return "generator";
  }
  if (actor === "ci") {
    return "ci";
  }
  if (actor === "git-op") {
    return "git-op";
  }
  if (actor.startsWith("provider:")) {
    return "provider";
  }
  if (actor.startsWith("product:")) {
    return "product";
  }
  if (actor === "unknown-external") {
    return "unknown";
  }

  throw new Error(`Unknown actor kind: ${actor}`);
}

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) {
    return value as ActorKind;
  }

  throw new Error(`Unknown actor kind: ${value}`);
}
