import { expect, test } from "@playwright/test";

import {
  WIDGET_ID_PATTERN,
  WIDGET_MAPPING_ID_PATTERN,
  makeWidget,
  makeWidgetMapping,
  makeWidgetReference,
  widgetKindFromString,
  widgetSurfaceFromString,
  type Widget,
  type WidgetKind,
  type WidgetMapping,
  type WidgetSurface,
} from "./widget";
import { makeTrustSignal } from "./trust";

const CONTRACT_WIDGET_KINDS = [
  ["BUTTON", "button"],
  ["INPUT", "input"],
  ["LIST", "list"],
  ["MODAL", "modal"],
  ["TAB", "tab"],
  ["PANEL", "panel"],
  ["CARD", "card"],
  ["TOOLTIP", "tooltip"],
  ["BANNER", "banner"],
  ["CHIP", "chip"],
  ["FORM", "form"],
  ["TABLE", "table"],
  ["AVATAR", "avatar"],
  ["ICON", "icon"],
  ["GENERIC", "generic"],
] as const satisfies readonly (readonly [string, WidgetKind])[];

const CONTRACT_WIDGET_SURFACES = [
  ["SOURCE", "source"],
  ["STORYBOOK", "storybook"],
  ["FIGMA", "figma"],
  ["DESIGN_TOKEN", "design-token"],
  ["RUNTIME", "runtime"],
] as const satisfies readonly (readonly [string, WidgetSurface])[];

const CONTRACT_WIDGET_KIND_VALUES = CONTRACT_WIDGET_KINDS.map(([, kind]) => kind);
const CONTRACT_WIDGET_SURFACE_VALUES = CONTRACT_WIDGET_SURFACES.map(
  ([, surface]) => surface,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractWidgetKind = (typeof CONTRACT_WIDGET_KINDS)[number][1];
type ContractWidgetSurface = (typeof CONTRACT_WIDGET_SURFACES)[number][1];
type _WidgetKindMembership = Assert<Equal<WidgetKind, ContractWidgetKind>>;
type _WidgetSurfaceMembership = Assert<Equal<WidgetSurface, ContractWidgetSurface>>;

const describe = test.describe;
const it = test;

function reference(
  overrides: Partial<ReturnType<typeof makeWidgetReference>> = {},
): ReturnType<typeof makeWidgetReference> {
  return makeWidgetReference({
    surface: "source",
    identifier: "Button.tsx",
    evidenceSource: "component export scan",
    ...overrides,
  });
}

function widget(overrides: Partial<Widget> = {}): Widget {
  return makeWidget({
    id: "widget:button.primary",
    label: "Primary Button",
    kind: "button",
    references: [reference()],
    trust: makeTrustSignal("candidate", null),
    attributionActor: "you-this-session",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function mapping(overrides: Partial<WidgetMapping> = {}): WidgetMapping {
  return makeWidgetMapping({
    id: "widget-mapping:button.primary-source",
    widgetId: "widget:button.primary",
    reference: reference({ surface: "figma", identifier: "figma:123" }),
    confirmedBy: "you-this-session",
    confirmedAtMs: 1_700_000_001_000,
    notes: null,
    ...overrides,
  });
}

describe("Widget schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_WIDGET_KINDS) {
    it(`contains contract widget kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(widgetKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, surfaceValue] of CONTRACT_WIDGET_SURFACES) {
    it(`contains contract widget surface ${memberName} with stable string value ${surfaceValue}`, () => {
      expect(widgetSurfaceFromString(surfaceValue)).toBe(surfaceValue);
    });
  }

  it("contains exactly the 15 contract widget kinds", () => {
    expect(CONTRACT_WIDGET_KIND_VALUES).toHaveLength(15);
    expect(new Set(CONTRACT_WIDGET_KIND_VALUES).size).toBe(15);
  });

  it("contains exactly the 5 contract widget surfaces", () => {
    expect(CONTRACT_WIDGET_SURFACE_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_WIDGET_SURFACE_VALUES).size).toBe(5);
  });

  it("throws instead of silently accepting unknown widget kind strings", () => {
    for (const invalidValue of ["", "BUTTON", "text-input", "generic ", "component"]) {
      expect(
        () => widgetKindFromString(invalidValue),
        `widgetKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown widget surface strings", () => {
    for (const invalidValue of ["", "SOURCE", "design_token", "runtime ", "code"]) {
      expect(
        () => widgetSurfaceFromString(invalidValue),
        `widgetSurfaceFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the widget pattern", () => {
    for (const widgetId of [
      "widget:button.primary",
      "widget:Button_123",
      "widget:system-card",
    ]) {
      expect(WIDGET_ID_PATTERN.test(widgetId)).toBe(true);
      expect(widget({ id: widgetId }).id).toBe(widgetId);
    }
  });

  it("rejects ids outside the widget pattern", () => {
    for (const widgetId of [
      "",
      "button.primary",
      "widget:",
      "Widget:button",
      "widget:has spaces",
      "widget:button/primary",
    ]) {
      expect(WIDGET_ID_PATTERN.test(widgetId)).toBe(false);
      expect(() => widget({ id: widgetId })).toThrow();
    }
  });

  it("rejects empty widget labels", () => {
    for (const label of ["", "   ", "\n\t"]) {
      expect(() => widget({ label })).toThrow();
    }
  });

  it("requires at least one widget reference", () => {
    expect(() => widget({ references: [] })).toThrow();
  });

  it("dedupes widget references by surface and identifier", () => {
    const source = reference({
      surface: "source",
      identifier: "Button.tsx",
      evidenceSource: "component export scan",
    });
    const duplicate = reference({
      surface: "source",
      identifier: "Button.tsx",
      evidenceSource: "manual review",
    });
    const distinct = reference({
      surface: "storybook",
      identifier: "button--primary",
      evidenceSource: "storybook index",
    });

    expect(widget({ references: [source, duplicate, distinct] }).references).toEqual([
      source,
      distinct,
    ]);
  });

  it("rejects empty widget reference identifiers", () => {
    for (const identifier of ["", "   ", "\n\t"]) {
      expect(() => reference({ identifier })).toThrow();
    }
  });

  it("accepts ids matching the widget mapping pattern", () => {
    for (const mappingId of [
      "widget-mapping:button.primary-source",
      "widget-mapping:Button_123",
      "widget-mapping:system-card",
    ]) {
      expect(WIDGET_MAPPING_ID_PATTERN.test(mappingId)).toBe(true);
      expect(mapping({ id: mappingId }).id).toBe(mappingId);
    }
  });

  it("rejects ids outside the widget mapping pattern", () => {
    for (const mappingId of [
      "",
      "button.primary-source",
      "widget-mapping:",
      "Widget-mapping:button",
      "widget-mapping:has spaces",
      "widget-mapping:button/primary",
    ]) {
      expect(WIDGET_MAPPING_ID_PATTERN.test(mappingId)).toBe(false);
      expect(() => mapping({ id: mappingId })).toThrow();
    }
  });

  it("rejects widget mappings whose widget ids do not match the widget pattern", () => {
    for (const widgetId of [
      "",
      "button.primary",
      "widget:",
      "Widget:button",
      "widget:has spaces",
      "widget:button/primary",
    ]) {
      expect(() => mapping({ widgetId })).toThrow();
    }
  });

  it("inherits the trust signal iff grounding invariant for widgets", () => {
    expect(
      widget({
        trust: makeTrustSignal("grounded", "user-confirmed"),
      }).trust,
    ).toEqual({
      state: "grounded",
      grounding: "user-confirmed",
    });

    expect(() =>
      widget({
        trust: makeTrustSignal("grounded", null),
      }),
    ).toThrow();
  });

  it("rejects negative timestamps", () => {
    expect(() => widget({ createdAtMs: -1 })).toThrow();
    expect(() => mapping({ confirmedAtMs: -1 })).toThrow();
  });
});
