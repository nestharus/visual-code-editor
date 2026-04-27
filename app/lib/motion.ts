import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";
import { WIDGET_ID_PATTERN } from "./widget";

export type MotionKind =
  | "enter"
  | "exit"
  | "hover"
  | "press"
  | "focus"
  | "transition"
  | "ambient"
  | "attention";

export type MotionRole =
  | "state-change"
  | "affordance"
  | "feedback"
  | "navigation"
  | "loading"
  | "error"
  | "celebration"
  | "ambient";

export type EasingKind =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step-start"
  | "step-end"
  | "custom";

export interface Motion {
  id: string;
  widgetId: string | null;
  screenId: string | null;
  kind: MotionKind;
  role: MotionRole;
  durationMs: number;
  easing: EasingKind;
  customCurve: string | null;
  captureAssetPath: string | null;
  trust: TrustSignal;
  attributionActor: ActorKind;
  createdAtMs: number;
}

export const MOTION_ID_PATTERN = /^motion:[a-zA-Z0-9._-]+$/;
export const SCREEN_ID_PATTERN = /^screen:[a-zA-Z0-9._-]+$/;

const MOTION_KINDS = [
  "enter",
  "exit",
  "hover",
  "press",
  "focus",
  "transition",
  "ambient",
  "attention",
] as const satisfies readonly MotionKind[];

const MOTION_ROLES = [
  "state-change",
  "affordance",
  "feedback",
  "navigation",
  "loading",
  "error",
  "celebration",
  "ambient",
] as const satisfies readonly MotionRole[];

const EASING_KINDS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "custom",
] as const satisfies readonly EasingKind[];

const MOTION_KIND_SET: ReadonlySet<string> = new Set(MOTION_KINDS);
const MOTION_ROLE_SET: ReadonlySet<string> = new Set(MOTION_ROLES);
const EASING_KIND_SET: ReadonlySet<string> = new Set(EASING_KINDS);

export function motionKindFromString(value: string): MotionKind {
  if (MOTION_KIND_SET.has(value)) {
    return value as MotionKind;
  }

  throw new Error(`Unknown motion kind: ${value}`);
}

export function motionRoleFromString(value: string): MotionRole {
  if (MOTION_ROLE_SET.has(value)) {
    return value as MotionRole;
  }

  throw new Error(`Unknown motion role: ${value}`);
}

export function easingKindFromString(value: string): EasingKind {
  if (EASING_KIND_SET.has(value)) {
    return value as EasingKind;
  }

  throw new Error(`Unknown easing kind: ${value}`);
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

export function makeMotion(partial: Motion): Motion {
  if (!MOTION_ID_PATTERN.test(partial.id)) {
    throw new Error("Motion id must match ^motion:[a-zA-Z0-9._-]+$");
  }
  if (partial.widgetId !== null && !WIDGET_ID_PATTERN.test(partial.widgetId)) {
    throw new Error("Motion widgetId must match ^widget:[a-zA-Z0-9._-]+$");
  }
  if (partial.screenId !== null && !SCREEN_ID_PATTERN.test(partial.screenId)) {
    throw new Error("Motion screenId must match ^screen:[a-zA-Z0-9._-]+$");
  }

  motionKindFromString(partial.kind);
  motionRoleFromString(partial.role);

  if (partial.durationMs < 0) {
    throw new Error("Motion durationMs must be >= 0");
  }

  easingKindFromString(partial.easing);
  const hasCustomCurve =
    typeof partial.customCurve === "string" && partial.customCurve.trim() !== "";
  const isCustomEasing = partial.easing === "custom";
  if (isCustomEasing !== hasCustomCurve) {
    throw new Error("Motion customCurve must be set iff easing is custom");
  }

  if (
    partial.captureAssetPath !== null &&
    typeof partial.captureAssetPath !== "string"
  ) {
    throw new Error("Motion captureAssetPath must be a string or null");
  }

  validateTrustSignal(partial.trust);

  try {
    actorFromString(partial.attributionActor);
  } catch (error) {
    throw new Error("Motion attributionActor must be an ActorKind", {
      cause: error,
    });
  }

  if (partial.createdAtMs < 0) {
    throw new Error("Motion createdAtMs must be >= 0");
  }

  return { ...partial };
}
