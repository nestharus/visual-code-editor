import { expect, test } from "@playwright/test";

import {
  ALL_ACTORS,
  actorFromString,
  familyOf,
  type ActorFamily,
  type ActorKind,
} from "./actors";

const CONTRACT_ACTORS = [
  ["YOU_THIS_SESSION", "you-this-session", "you"],
  ["YOU_OTHER_SESSION", "you-other-session", "you"],
  ["ANOTHER_USER", "another-user", "another-user"],
  ["AGENTS_EDIT", "agents:edit", "agents"],
  ["AGENTS_DIRECT", "agents:direct", "agents"],
  ["AGENTS_SLICE_CONSTRUCTOR", "agents:slice-constructor", "agents"],
  ["AGENTS_RELEVANCE_CLASSIFIER", "agents:relevance-classifier", "agents"],
  ["AGENTS_PROVIDER_MAPPER", "agents:provider-mapper", "agents"],
  ["GENERATOR", "generator", "generator"],
  ["CI", "ci", "ci"],
  ["GIT_OP", "git-op", "git-op"],
  ["PROVIDER_GITHUB_SYNC", "provider:github:sync", "provider"],
  ["PROVIDER_GITHUB_PR_MERGE", "provider:github:pr-merge", "provider"],
  ["PRODUCT_AUTO_FOCUS", "product:auto-focus", "product"],
  ["PRODUCT_DIGEST_SURFACE", "product:digest-surface", "product"],
  ["PRODUCT_THREAD_OPEN", "product:thread-open", "product"],
  ["PRODUCT_LINEAGE_CONFIRM", "product:lineage-confirm", "product"],
  ["UNKNOWN_EXTERNAL", "unknown-external", "unknown"],
] as const satisfies readonly (readonly [string, ActorKind, ActorFamily])[];

const CONTRACT_VALUES = CONTRACT_ACTORS.map(([, actor]) => actor);

const describe = test.describe;
const it = test;

describe("ActorKind registry contract", () => {
  for (const [memberName, actorValue] of CONTRACT_ACTORS) {
    it(`contains contract actor ${memberName} with stable string value ${actorValue}`, () => {
      expect(ALL_ACTORS).toContain(actorValue);
      expect(actorValue).toBe(actorFromString(actorValue));
    });
  }

  it("keeps ALL_ACTORS in contract declaration order", () => {
    expect(ALL_ACTORS).toEqual(CONTRACT_VALUES);
  });

  it("contains exactly the 18 contract actors", () => {
    expect(ALL_ACTORS).toHaveLength(18);
    expect(new Set(ALL_ACTORS)).toEqual(new Set(CONTRACT_VALUES));
  });

  it("throws instead of silently accepting unknown actor strings", () => {
    for (const invalidValue of [
      "",
      "not-a-real-actor",
      "provider:hypothetical-test:sync",
      "agents",
      "product:",
      "YOU_THIS_SESSION",
    ]) {
      expect(
        () => actorFromString(invalidValue),
        `actorFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  for (const [memberName, actorValue, expectedFamily] of CONTRACT_ACTORS) {
    it(`maps contract actor ${memberName} to exactly one family`, () => {
      const resolvedFamily = familyOf(actorValue);

      expect(resolvedFamily).toBe(expectedFamily);
    });
  }

  it("covers every actor family and assigns each actor once", () => {
    const expectedFamilies: readonly ActorFamily[] = [
      "you",
      "another-user",
      "agents",
      "generator",
      "ci",
      "git-op",
      "provider",
      "product",
      "unknown",
    ];
    const actorsByFamily = new Map<ActorFamily, ActorKind[]>(
      expectedFamilies.map((family) => [family, []]),
    );

    for (const actor of ALL_ACTORS) {
      actorsByFamily.get(familyOf(actor))?.push(actor);
    }

    for (const family of expectedFamilies) {
      expect(
        actorsByFamily.get(family),
        `Family closure invariant violated: family ${family} must not be empty`,
      ).not.toEqual([]);
    }

    const assignedActorCount = Array.from(actorsByFamily.values()).reduce(
      (count, actors) => count + actors.length,
      0,
    );
    expect(assignedActorCount).toBe(ALL_ACTORS.length);
  });

  it("resolves hypothetical provider-prefixed actors by prefix without registering them", () => {
    const fixtureActor = "provider:hypothetical-test:sync";

    expect(CONTRACT_VALUES).not.toContain(fixtureActor);
    expect(familyOf(fixtureActor as ActorKind)).toBe("provider");
  });
});
