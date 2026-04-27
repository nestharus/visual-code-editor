import {
  easingKindFromString,
  makeMotion,
  motionKindFromString,
  motionRoleFromString,
  type EasingKind,
  type Motion,
  type MotionKind,
  type MotionRole,
} from "../app/lib/motion";

const motionKinds = [
  "enter",
  "exit",
  "hover",
  "press",
  "focus",
  "transition",
  "ambient",
  "attention",
] as const satisfies readonly MotionKind[];

const motionRoles = [
  "state-change",
  "affordance",
  "feedback",
  "navigation",
  "loading",
  "error",
  "celebration",
  "ambient",
] as const satisfies readonly MotionRole[];

const easingKinds = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "custom",
] as const satisfies readonly EasingKind[];

const scenarios: readonly {
  name: string;
  input: Motion;
}[] = [
  {
    name: "widget hover affordance",
    input: {
      id: "motion:button.primary-hover",
      widgetId: "widget:button.primary",
      screenId: null,
      kind: "hover",
      role: "affordance",
      durationMs: 180,
      easing: "ease-out",
      customCurve: null,
      captureAssetPath: "app/assets/animations/button-hover.webm",
      trust: { state: "candidate", grounding: null },
      attributionActor: "generator",
      createdAtMs: 1_700_000_000_000,
    },
  },
  {
    name: "screen transition navigation",
    input: {
      id: "motion:screen.overview-to-system",
      widgetId: null,
      screenId: "screen:overview",
      kind: "transition",
      role: "navigation",
      durationMs: 320,
      easing: "custom",
      customCurve: "cubic-bezier(0.22, 1, 0.36, 1)",
      captureAssetPath: null,
      trust: { state: "grounded", grounding: "user-confirmed" },
      attributionActor: "you-this-session",
      createdAtMs: 1_700_000_001_000,
    },
  },
  {
    name: "ambient loading motion",
    input: {
      id: "motion:loading.ambient-pulse",
      widgetId: "widget:loading-chip",
      screenId: "screen:dashboard",
      kind: "ambient",
      role: "loading",
      durationMs: 0,
      easing: "linear",
      customCurve: null,
      captureAssetPath: "app/assets/animations/loading-pulse.lottie",
      trust: { state: "stale", grounding: null },
      attributionActor: "agents:provider-mapper",
      createdAtMs: 0,
    },
  },
];

console.log(
  JSON.stringify({
    motionKinds: motionKinds.map(motionKindFromString),
    motionRoles: motionRoles.map(motionRoleFromString),
    easingKinds: easingKinds.map(easingKindFromString),
    motions: scenarios.map((scenario) => ({
      name: scenario.name,
      motion: makeMotion(scenario.input),
    })),
  }),
);
