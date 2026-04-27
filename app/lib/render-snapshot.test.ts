import { expect, test } from "@playwright/test";

import {
  RENDER_ID_PATTERN,
  makeRenderSnapshot,
  renderSurfaceFromString,
  renderViewportFromString,
  type RenderSnapshot,
  type RenderSurface,
  type RenderViewport,
} from "./render-snapshot";
import { makeTrustSignal } from "./trust";

const CONTRACT_RENDER_SURFACES = [
  ["STATIC_IMAGE", "static-image"],
  ["WIREFRAME", "wireframe"],
  ["ANIMATED", "animated"],
] as const satisfies readonly (readonly [string, RenderSurface])[];

const CONTRACT_RENDER_VIEWPORTS = [
  ["MOBILE_PORTRAIT", "mobile-portrait"],
  ["MOBILE_LANDSCAPE", "mobile-landscape"],
  ["TABLET", "tablet"],
  ["DESKTOP", "desktop"],
  ["DESKTOP_WIDE", "desktop-wide"],
] as const satisfies readonly (readonly [string, RenderViewport])[];

const CONTRACT_RENDER_SURFACE_VALUES = CONTRACT_RENDER_SURFACES.map(
  ([, surface]) => surface,
);
const CONTRACT_RENDER_VIEWPORT_VALUES = CONTRACT_RENDER_VIEWPORTS.map(
  ([, viewport]) => viewport,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type ContractRenderSurface = (typeof CONTRACT_RENDER_SURFACES)[number][1];
type ContractRenderViewport = (typeof CONTRACT_RENDER_VIEWPORTS)[number][1];
type _RenderSurfaceMembership = Assert<Equal<RenderSurface, ContractRenderSurface>>;
type _RenderViewportMembership = Assert<Equal<RenderViewport, ContractRenderViewport>>;

const describe = test.describe;
const it = test;

function snapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  return makeRenderSnapshot({
    id: "render:button.primary.desktop",
    widgetId: "widget:button.primary",
    surface: "static-image",
    viewport: "desktop",
    theme: "dark",
    locale: "en-US",
    assetPath: "public/data/widget-renders/button.primary/desktop.png",
    capturedAtMs: 1_700_000_000_000,
    trust: makeTrustSignal("candidate", null),
    ...overrides,
  });
}

describe("RenderSnapshot schema contract", () => {
  for (const [memberName, surfaceValue] of CONTRACT_RENDER_SURFACES) {
    it(`contains contract render surface ${memberName} with stable string value ${surfaceValue}`, () => {
      expect(renderSurfaceFromString(surfaceValue)).toBe(surfaceValue);
    });
  }

  for (const [memberName, viewportValue] of CONTRACT_RENDER_VIEWPORTS) {
    it(`contains contract render viewport ${memberName} with stable string value ${viewportValue}`, () => {
      expect(renderViewportFromString(viewportValue)).toBe(viewportValue);
    });
  }

  it("contains exactly the 3 contract render surfaces", () => {
    expect(CONTRACT_RENDER_SURFACE_VALUES).toHaveLength(3);
    expect(new Set(CONTRACT_RENDER_SURFACE_VALUES).size).toBe(3);
  });

  it("contains exactly the 5 contract render viewports", () => {
    expect(CONTRACT_RENDER_VIEWPORT_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_RENDER_VIEWPORT_VALUES).size).toBe(5);
  });

  it("throws instead of silently accepting unknown render surface strings", () => {
    for (const invalidValue of [
      "",
      "STATIC_IMAGE",
      "static_image",
      "static-image ",
      "video",
    ]) {
      expect(
        () => renderSurfaceFromString(invalidValue),
        `renderSurfaceFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown render viewport strings", () => {
    for (const invalidValue of [
      "",
      "DESKTOP",
      "desktop_wide",
      "desktop-wide ",
      "phone",
    ]) {
      expect(
        () => renderViewportFromString(invalidValue),
        `renderViewportFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the render pattern", () => {
    for (const renderId of [
      "render:button.primary.desktop",
      "render:Button_123",
      "render:system-card",
    ]) {
      expect(RENDER_ID_PATTERN.test(renderId)).toBe(true);
      expect(snapshot({ id: renderId }).id).toBe(renderId);
    }
  });

  it("rejects ids outside the render pattern", () => {
    for (const renderId of [
      "",
      "button.primary.desktop",
      "render:",
      "Render:button",
      "render:has spaces",
      "render:button/primary",
    ]) {
      expect(RENDER_ID_PATTERN.test(renderId)).toBe(false);
      expect(() => snapshot({ id: renderId })).toThrow();
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
      expect(() => snapshot({ widgetId })).toThrow();
    }
  });

  it("rejects empty asset path, theme, and locale values", () => {
    for (const overrides of [
      { assetPath: "" },
      { assetPath: "   " },
      { theme: "" },
      { theme: "   " },
      { locale: "" },
      { locale: "   " },
    ] satisfies readonly Partial<RenderSnapshot>[]) {
      expect(() => snapshot(overrides)).toThrow();
    }
  });

  it("inherits the trust signal iff grounding invariant", () => {
    expect(
      snapshot({
        trust: makeTrustSignal("grounded", "user-confirmed"),
      }).trust,
    ).toEqual({
      state: "grounded",
      grounding: "user-confirmed",
    });

    expect(() =>
      snapshot({
        trust: { state: "grounded", grounding: null },
      }),
    ).toThrow();
  });

  it("rejects negative capture timestamps", () => {
    expect(() => snapshot({ capturedAtMs: -1 })).toThrow();
  });
});
