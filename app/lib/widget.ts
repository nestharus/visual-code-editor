import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

export type WidgetKind =
  | "button"
  | "input"
  | "list"
  | "modal"
  | "tab"
  | "panel"
  | "card"
  | "tooltip"
  | "banner"
  | "chip"
  | "form"
  | "table"
  | "avatar"
  | "icon"
  | "generic";

export type WidgetSurface =
  | "source"
  | "storybook"
  | "figma"
  | "design-token"
  | "runtime";

export interface WidgetReference {
  surface: WidgetSurface;
  identifier: string;
  evidenceSource: string;
}

export interface Widget {
  id: string;
  label: string;
  kind: WidgetKind;
  references: readonly WidgetReference[];
  trust: TrustSignal;
  attributionActor: ActorKind;
  createdAtMs: number;
}

export interface WidgetMapping {
  id: string;
  widgetId: string;
  reference: WidgetReference;
  confirmedBy: ActorKind;
  confirmedAtMs: number;
  notes: string | null;
}

export const WIDGET_ID_PATTERN = /^widget:[a-zA-Z0-9._-]+$/;
export const WIDGET_MAPPING_ID_PATTERN = /^widget-mapping:[a-zA-Z0-9._-]+$/;

const WIDGET_KINDS = [
  "button",
  "input",
  "list",
  "modal",
  "tab",
  "panel",
  "card",
  "tooltip",
  "banner",
  "chip",
  "form",
  "table",
  "avatar",
  "icon",
  "generic",
] as const satisfies readonly WidgetKind[];

const WIDGET_SURFACES = [
  "source",
  "storybook",
  "figma",
  "design-token",
  "runtime",
] as const satisfies readonly WidgetSurface[];

const WIDGET_KIND_SET: ReadonlySet<string> = new Set(WIDGET_KINDS);
const WIDGET_SURFACE_SET: ReadonlySet<string> = new Set(WIDGET_SURFACES);

export function widgetKindFromString(value: string): WidgetKind {
  if (WIDGET_KIND_SET.has(value)) {
    return value as WidgetKind;
  }

  throw new Error(`Unknown widget kind: ${value}`);
}

export function widgetSurfaceFromString(value: string): WidgetSurface {
  if (WIDGET_SURFACE_SET.has(value)) {
    return value as WidgetSurface;
  }

  throw new Error(`Unknown widget surface: ${value}`);
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

export function makeWidgetReference(
  partial: WidgetReference,
): WidgetReference {
  widgetSurfaceFromString(partial.surface);
  validateNonEmptyString(partial.identifier, "WidgetReference identifier");

  if (typeof partial.evidenceSource !== "string") {
    throw new Error("WidgetReference evidenceSource must be a string");
  }

  return { ...partial };
}

export function makeWidget(partial: Widget): Widget {
  if (!WIDGET_ID_PATTERN.test(partial.id)) {
    throw new Error("Widget id must match ^widget:[a-zA-Z0-9._-]+$");
  }
  validateNonEmptyString(partial.label, "Widget label");
  widgetKindFromString(partial.kind);

  if (partial.references.length === 0) {
    throw new Error("Widget references must contain at least one reference");
  }

  const references: WidgetReference[] = [];
  const seenReferenceKeys = new Set<string>();
  for (const reference of partial.references) {
    const validatedReference = makeWidgetReference(reference);
    const referenceKey = `${validatedReference.surface}\u0000${validatedReference.identifier}`;
    if (seenReferenceKeys.has(referenceKey)) {
      continue;
    }
    seenReferenceKeys.add(referenceKey);
    references.push(validatedReference);
  }

  validateTrustSignal(partial.trust);

  try {
    actorFromString(partial.attributionActor);
  } catch (error) {
    throw new Error("Widget attributionActor must be an ActorKind", {
      cause: error,
    });
  }

  if (partial.createdAtMs < 0) {
    throw new Error("Widget createdAtMs must be >= 0");
  }

  return {
    ...partial,
    references,
  };
}

export function makeWidgetMapping(partial: WidgetMapping): WidgetMapping {
  if (!WIDGET_MAPPING_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "WidgetMapping id must match ^widget-mapping:[a-zA-Z0-9._-]+$",
    );
  }
  if (!WIDGET_ID_PATTERN.test(partial.widgetId)) {
    throw new Error("WidgetMapping widgetId must match ^widget:[a-zA-Z0-9._-]+$");
  }

  const reference = makeWidgetReference(partial.reference);

  try {
    actorFromString(partial.confirmedBy);
  } catch (error) {
    throw new Error("WidgetMapping confirmedBy must be an ActorKind", {
      cause: error,
    });
  }

  if (partial.confirmedAtMs < 0) {
    throw new Error("WidgetMapping confirmedAtMs must be >= 0");
  }
  if (partial.notes !== null && typeof partial.notes !== "string") {
    throw new Error("WidgetMapping notes must be a string or null");
  }

  return {
    ...partial,
    reference,
  };
}
