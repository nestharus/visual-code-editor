import { expect, test } from "@playwright/test";

import {
  MOTION_ID_PATTERN,
  SCREEN_ID_PATTERN,
  easingKindFromString,
  makeMotion,
  motionKindFromString,
  motionRoleFromString,
  type EasingKind,
  type Motion,
  type MotionKind,
  type MotionRole,
} from "./motion";
import { makeTrustSignal, type TrustSignal } from "./trust";

const CONTRACT_MOTION_KINDS = [
  ["ENTER", "enter"],
  ["EXIT", "exit"],
  ["HOVER", "hover"],
  ["PRESS", "press"],
  ["FOCUS", "focus"],
  ["TRANSITION", "transition"],
  ["AMBIENT", "ambient"],
  ["ATTENTION", "attention"],
] as const satisfies readonly (readonly [string, MotionKind])[];

const CONTRACT_MOTION_ROLES = [
  ["STATE_CHANGE", "state-change"],
  ["AFFORDANCE", "affordance"],
  ["FEEDBACK", "feedback"],
  ["NAVIGATION", "navigation"],
  ["LOADING", "loading"],
  ["ERROR", "error"],
  ["CELEBRATION", "celebration"],
  ["AMBIENT", "ambient"],
] as const satisfies readonly (readonly [string, MotionRole])[];

const CONTRACT_EASING_KINDS = [
  ["LINEAR", "linear"],
  ["EASE", "ease"],
  ["EASE_IN", "ease-in"],
  ["EASE_OUT", "ease-out"],
  ["EASE_IN_OUT", "ease-in-out"],
  ["STEP_START", "step-start"],
  ["STEP_END", "step-end"],
  ["CUSTOM", "custom"],
] as const satisfies readonly (readonly [string, EasingKind])[];

const CONTRACT_MOTION_KIND_VALUES = CONTRACT_MOTION_KINDS.map(([, kind]) => kind);
const CONTRACT_MOTION_ROLE_VALUES = CONTRACT_MOTION_ROLES.map(([, role]) => role);
const CONTRACT_EASING_KIND_VALUES = CONTRACT_EASING_KINDS.map(
  ([, easing]) => easing,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractMotionKind = (typeof CONTRACT_MOTION_KINDS)[number][1];
type ContractMotionRole = (typeof CONTRACT_MOTION_ROLES)[number][1];
type ContractEasingKind = (typeof CONTRACT_EASING_KINDS)[number][1];
type _MotionKindMembership = Assert<Equal<MotionKind, ContractMotionKind>>;
type _MotionRoleMembership = Assert<Equal<MotionRole, ContractMotionRole>>;
type _EasingKindMembership = Assert<Equal<EasingKind, ContractEasingKind>>;

const describe = test.describe;
const it = test;

function motion(overrides: Partial<Motion> = {}): Motion {
  return makeMotion({
    id: "motion:button.primary-hover",
    widgetId: "widget:button.primary",
    screenId: null,
    kind: "hover",
    role: "affordance",
    durationMs: 180,
    easing: "ease-out",
    customCurve: null,
    captureAssetPath: "app/assets/animations/button-hover.webm",
    trust: makeTrustSignal("candidate", null),
    attributionActor: "generator",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

describe("Motion schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_MOTION_KINDS) {
    it(`contains contract motion kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(motionKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, roleValue] of CONTRACT_MOTION_ROLES) {
    it(`contains contract motion role ${memberName} with stable string value ${roleValue}`, () => {
      expect(motionRoleFromString(roleValue)).toBe(roleValue);
    });
  }

  for (const [memberName, easingValue] of CONTRACT_EASING_KINDS) {
    it(`contains contract easing kind ${memberName} with stable string value ${easingValue}`, () => {
      expect(easingKindFromString(easingValue)).toBe(easingValue);
    });
  }

  it("contains exactly the 8 contract motion kinds", () => {
    expect(CONTRACT_MOTION_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_MOTION_KIND_VALUES).size).toBe(8);
  });

  it("contains exactly the 8 contract motion roles", () => {
    expect(CONTRACT_MOTION_ROLE_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_MOTION_ROLE_VALUES).size).toBe(8);
  });

  it("contains exactly the 8 contract easing kinds", () => {
    expect(CONTRACT_EASING_KIND_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_EASING_KIND_VALUES).size).toBe(8);
  });

  it("throws instead of silently accepting unknown motion kind strings", () => {
    for (const invalidValue of ["", "ENTER", "hover ", "tap", "state-change"]) {
      expect(
        () => motionKindFromString(invalidValue),
        `motionKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown motion role strings", () => {
    for (const invalidValue of [
      "",
      "STATE_CHANGE",
      "state_change",
      "navigation ",
      "hover",
    ]) {
      expect(
        () => motionRoleFromString(invalidValue),
        `motionRoleFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown easing kind strings", () => {
    for (const invalidValue of ["", "EASE_IN", "ease_in", "spring", "ease-out "]) {
      expect(
        () => easingKindFromString(invalidValue),
        `easingKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the motion pattern", () => {
    for (const motionId of [
      "motion:button.primary-hover",
      "motion:Screen_123",
      "motion:system-card",
    ]) {
      expect(MOTION_ID_PATTERN.test(motionId)).toBe(true);
      expect(motion({ id: motionId }).id).toBe(motionId);
    }
  });

  it("rejects ids outside the motion pattern", () => {
    for (const motionId of [
      "",
      "button.primary-hover",
      "motion:",
      "Motion:hover",
      "motion:has spaces",
      "motion:button/hover",
    ]) {
      expect(MOTION_ID_PATTERN.test(motionId)).toBe(false);
      expect(() => motion({ id: motionId })).toThrow();
    }
  });

  it("accepts null widget ids and ids matching the widget pattern", () => {
    for (const widgetId of [
      null,
      "widget:button.primary",
      "widget:Button_123",
      "widget:system-card",
    ]) {
      expect(motion({ widgetId }).widgetId).toBe(widgetId);
    }
  });

  it("rejects widget ids outside the widget pattern", () => {
    for (const widgetId of [
      "",
      "button.primary",
      "widget:",
      "Widget:button",
      "widget:has spaces",
      "widget:button/primary",
    ]) {
      expect(() => motion({ widgetId })).toThrow();
    }
  });

  it("accepts null screen ids and ids matching the screen pattern", () => {
    for (const screenId of [
      null,
      "screen:overview",
      "screen:Screen_123",
      "screen:system-card",
    ]) {
      if (screenId !== null) {
        expect(SCREEN_ID_PATTERN.test(screenId)).toBe(true);
      }
      expect(motion({ screenId }).screenId).toBe(screenId);
    }
  });

  it("rejects screen ids outside the screen pattern", () => {
    for (const screenId of [
      "",
      "overview",
      "screen:",
      "Screen:overview",
      "screen:has spaces",
      "screen:overview/main",
    ]) {
      expect(SCREEN_ID_PATTERN.test(screenId)).toBe(false);
      expect(() => motion({ screenId })).toThrow();
    }
  });

  it("requires a custom curve exactly when easing is custom", () => {
    expect(() => motion({ easing: "custom", customCurve: null })).toThrow();

    expect(
      motion({
        easing: "custom",
        customCurve: "cubic-bezier(0.2, 0, 0, 1)",
      }).customCurve,
    ).toBe("cubic-bezier(0.2, 0, 0, 1)");

    for (const easing of CONTRACT_EASING_KIND_VALUES.filter(
      (value) => value !== "custom",
    )) {
      expect(() =>
        motion({
          easing,
          customCurve: "cubic-bezier(0.2, 0, 0, 1)",
        }),
      ).toThrow();
    }
  });

  it("rejects negative durations", () => {
    expect(motion({ durationMs: 0 }).durationMs).toBe(0);
    expect(motion({ durationMs: 180 }).durationMs).toBe(180);
    expect(() => motion({ durationMs: -1 })).toThrow();
  });

  it("rejects negative creation timestamps", () => {
    expect(motion({ createdAtMs: 0 }).createdAtMs).toBe(0);
    expect(motion({ createdAtMs: 1_700_000_000_000 }).createdAtMs).toBe(
      1_700_000_000_000,
    );
    expect(() => motion({ createdAtMs: -1 })).toThrow();
  });

  it("reasserts the trust signal grounding iff grounded invariant", () => {
    const validGrounded = makeTrustSignal("grounded", "user-confirmed");
    expect(motion({ trust: validGrounded }).trust).toEqual(validGrounded);

    const invalidGrounded: TrustSignal = { state: "grounded", grounding: null };
    const invalidUngrounded: TrustSignal = { state: "candidate", grounding: "test" };

    expect(() => motion({ trust: invalidGrounded })).toThrow();
    expect(() => motion({ trust: invalidUngrounded })).toThrow();
  });
});
