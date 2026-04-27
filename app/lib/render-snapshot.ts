import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";
import { WIDGET_ID_PATTERN } from "./widget";

export type RenderSurface = "static-image" | "wireframe" | "animated";

export type RenderViewport =
  | "mobile-portrait"
  | "mobile-landscape"
  | "tablet"
  | "desktop"
  | "desktop-wide";

export interface RenderSnapshot {
  id: string;
  widgetId: string;
  surface: RenderSurface;
  viewport: RenderViewport;
  theme: string;
  locale: string;
  assetPath: string;
  capturedAtMs: number;
  trust: TrustSignal;
}

export const RENDER_ID_PATTERN = /^render:[a-zA-Z0-9._-]+$/;

const RENDER_SURFACES = [
  "static-image",
  "wireframe",
  "animated",
] as const satisfies readonly RenderSurface[];

const RENDER_VIEWPORTS = [
  "mobile-portrait",
  "mobile-landscape",
  "tablet",
  "desktop",
  "desktop-wide",
] as const satisfies readonly RenderViewport[];

const RENDER_SURFACE_SET: ReadonlySet<string> = new Set(RENDER_SURFACES);
const RENDER_VIEWPORT_SET: ReadonlySet<string> = new Set(RENDER_VIEWPORTS);

export function renderSurfaceFromString(value: string): RenderSurface {
  if (RENDER_SURFACE_SET.has(value)) {
    return value as RenderSurface;
  }

  throw new Error(`Unknown render surface: ${value}`);
}

export function renderViewportFromString(value: string): RenderViewport {
  if (RENDER_VIEWPORT_SET.has(value)) {
    return value as RenderViewport;
  }

  throw new Error(`Unknown render viewport: ${value}`);
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

export function makeRenderSnapshot(partial: RenderSnapshot): RenderSnapshot {
  if (!RENDER_ID_PATTERN.test(partial.id)) {
    throw new Error("RenderSnapshot id must match ^render:[a-zA-Z0-9._-]+$");
  }
  if (!WIDGET_ID_PATTERN.test(partial.widgetId)) {
    throw new Error(
      "RenderSnapshot widgetId must match ^widget:[a-zA-Z0-9._-]+$",
    );
  }

  renderSurfaceFromString(partial.surface);
  renderViewportFromString(partial.viewport);
  validateNonEmptyString(partial.theme, "RenderSnapshot theme");
  validateNonEmptyString(partial.locale, "RenderSnapshot locale");
  validateNonEmptyString(partial.assetPath, "RenderSnapshot assetPath");

  if (partial.capturedAtMs < 0) {
    throw new Error("RenderSnapshot capturedAtMs must be >= 0");
  }

  validateTrustSignal(partial.trust);

  return { ...partial };
}
