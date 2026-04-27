import { expect, test } from "@playwright/test";

import type { ActorKind } from "./actors";
import type { TrustSignal } from "./trust";
import {
  ALL_UI_FAILURE_KINDS,
  ALL_UI_FAILURE_SEVERITIES,
  makeUiFailure,
  uiFailureKindFromString,
  uiFailureSeverityFromString,
  type UiFailure,
  type UiFailureKind,
  type UiFailureSeverity,
} from "./ui-failure";

const CONTRACT_UI_FAILURE_KINDS = [
  ["TEST_FAILURE", "test-failure"],
  ["RUNTIME_ERROR", "runtime-error"],
  ["A11Y_VIOLATION", "a11y-violation"],
  ["CONTRAST_VIOLATION", "contrast-violation"],
  ["RENDER_ERROR", "render-error"],
  ["PERFORMANCE_BUDGET", "performance-budget"],
] as const satisfies readonly (readonly [string, UiFailureKind])[];

const CONTRACT_UI_FAILURE_SEVERITIES = [
  ["BLOCKER", "blocker"],
  ["CRITICAL", "critical"],
  ["MAJOR", "major"],
  ["MINOR", "minor"],
  ["INFO", "info"],
] as const satisfies readonly (readonly [string, UiFailureSeverity])[];

const CONTRACT_UI_FAILURE_KIND_VALUES = CONTRACT_UI_FAILURE_KINDS.map(([, kind]) => kind);
const CONTRACT_UI_FAILURE_SEVERITY_VALUES = CONTRACT_UI_FAILURE_SEVERITIES.map(
  ([, severity]) => severity,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractUiFailureKind = (typeof CONTRACT_UI_FAILURE_KINDS)[number][1];
type ContractUiFailureSeverity = (typeof CONTRACT_UI_FAILURE_SEVERITIES)[number][1];
type _UiFailureKindMembership = Assert<Equal<UiFailureKind, ContractUiFailureKind>>;
type _UiFailureSeverityMembership = Assert<
  Equal<UiFailureSeverity, ContractUiFailureSeverity>
>;

const describe = test.describe;
const it = test;

function trust(
  state: TrustSignal["state"] = "grounded",
  grounding: TrustSignal["grounding"] = "test",
): TrustSignal {
  return { state, grounding };
}

function failure(overrides: Partial<UiFailure> = {}): UiFailure {
  return makeUiFailure({
    id: "ui-failure:checkout.submit.visual",
    widgetId: "widget:checkout.submit-button",
    screenId: null,
    variantCellId: null,
    kind: "test-failure",
    severity: "major",
    message: "Checkout submit button visual test failed",
    evidenceUrl: "https://ci.example.test/reports/checkout-submit",
    trust: trust(),
    attributionActor: "ci" satisfies ActorKind,
    detectedAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

describe("UiFailure schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_UI_FAILURE_KINDS) {
    it(`contains contract UI failure kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(ALL_UI_FAILURE_KINDS).toContain(kindValue);
      expect(uiFailureKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 6 contract UI failure kinds in declaration order", () => {
    expect(ALL_UI_FAILURE_KINDS).toHaveLength(6);
    expect(ALL_UI_FAILURE_KINDS).toEqual(CONTRACT_UI_FAILURE_KIND_VALUES);
  });

  for (const [memberName, severityValue] of CONTRACT_UI_FAILURE_SEVERITIES) {
    it(`contains contract UI failure severity ${memberName} with stable string value ${severityValue}`, () => {
      expect(ALL_UI_FAILURE_SEVERITIES).toContain(severityValue);
      expect(uiFailureSeverityFromString(severityValue)).toBe(severityValue);
    });
  }

  it("contains exactly the 5 contract UI failure severities in declaration order", () => {
    expect(ALL_UI_FAILURE_SEVERITIES).toHaveLength(5);
    expect(ALL_UI_FAILURE_SEVERITIES).toEqual(CONTRACT_UI_FAILURE_SEVERITY_VALUES);
  });

  it("throws instead of silently accepting unknown UI failure kind strings", () => {
    for (const invalidValue of [
      "",
      "test_failure",
      "TEST_FAILURE",
      "test-failure ",
      "error",
      "a11y",
    ]) {
      expect(
        () => uiFailureKindFromString(invalidValue),
        `uiFailureKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown UI failure severity strings", () => {
    for (const invalidValue of ["", "BLOCKER", "major ", "warning", "error"]) {
      expect(
        () => uiFailureSeverityFromString(invalidValue),
        `uiFailureSeverityFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the contract pattern", () => {
    for (const id of ["ui-failure:a", "ui-failure:Checkout.Submit_01-visual"]) {
      expect(failure({ id }).id).toBe(id);
    }
  });

  it("rejects ids outside the contract pattern", () => {
    for (const id of [
      "",
      "ui_failure:a",
      "ui-failure:",
      "ui-failure:has space",
      "ui-failure:bad/slash",
      "failure:a",
    ]) {
      expect(() => failure({ id })).toThrow();
    }
  });

  it("requires at least one anchor", () => {
    expect(() =>
      failure({ widgetId: null, screenId: null, variantCellId: null }),
    ).toThrow();
  });

  it("accepts each anchor field", () => {
    expect(
      failure({
        widgetId: "widget:checkout.submit-button",
        screenId: null,
        variantCellId: null,
      }),
    ).toBeTruthy();
    expect(
      failure({
        widgetId: null,
        screenId: "screen:checkout",
        variantCellId: null,
      }),
    ).toBeTruthy();
    expect(
      failure({
        widgetId: null,
        screenId: null,
        variantCellId: "variant-cell:checkout.dark",
      }),
    ).toBeTruthy();
  });

  it("requires a non-empty message", () => {
    expect(() => failure({ message: "" })).toThrow();
  });

  it("preserves the transitive trust signal", () => {
    const signal = trust("grounded", "test");

    expect(failure({ trust: signal }).trust).toBe(signal);
  });

  it("rejects transitively invalid trust signal", () => {
    expect(() => failure({ trust: trust("candidate", "test") })).toThrow();
  });
});
