import { expect, test } from "@playwright/test";

import {
  ALL_LABEL_TARGETS,
  ALL_LABEL_VISIBILITIES,
  ALL_OVERFLOW_MODES,
  ALL_ZOOM_BANDS,
  CHANNEL_BUDGET_CAPS,
  EDGE_BUNDLING,
  HIT_TEST,
  LABEL_VISIBILITY,
  channelBudgetCap,
  edgeBundling,
  hitTestPrecision,
  labelTargetFromString,
  labelVisibility,
  labelVisibilityFromString,
  overflowModeFromString,
  zoomBandForFactor,
  zoomBandFromString,
  type LabelTarget,
  type LabelVisibility,
  type OverflowMode,
  type ZoomBand,
} from "./zoom";
import type { VisualChannel } from "./channels";

const CONTRACT_ZOOM_BANDS = [
  ["OVERVIEW", "overview"],
  ["STRUCTURE", "structure"],
  ["DETAIL", "detail"],
  ["INSPECT", "inspect"],
  ["SOURCE", "source"],
] as const satisfies readonly (readonly [string, ZoomBand])[];

const CONTRACT_LABEL_VISIBILITIES = [
  ["HIDDEN", "hidden"],
  ["HOVER_ONLY", "hover-only"],
  ["ABBREVIATED", "abbreviated"],
  ["FULL", "full"],
] as const satisfies readonly (readonly [string, LabelVisibility])[];

const CONTRACT_OVERFLOW_MODES = [
  ["COLLAPSE_TO_PLUS_N", "collapse-to-plus-n"],
  ["HIGHEST_ONLY", "highest-only"],
  ["HIDE_ALL", "hide-all"],
] as const satisfies readonly (readonly [string, OverflowMode])[];

const CONTRACT_LABEL_TARGETS = [
  ["CONTAINER_HEADER", "container-header"],
  ["NODE_LABEL", "node-label"],
  ["EDGE_LABEL", "edge-label"],
  ["EDGE_ARTIFACT_CHIPS", "edge-artifact-chips"],
  ["BEHAVIOUR_CARD_SLICE", "behaviour-card-slice"],
] as const satisfies readonly (readonly [string, LabelTarget])[];

const CONTRACT_ZOOM_BAND_VALUES = CONTRACT_ZOOM_BANDS.map(([, value]) => value);
const CONTRACT_LABEL_VISIBILITY_VALUES = CONTRACT_LABEL_VISIBILITIES.map(([, value]) => value);
const CONTRACT_OVERFLOW_MODE_VALUES = CONTRACT_OVERFLOW_MODES.map(([, value]) => value);
const CONTRACT_LABEL_TARGET_VALUES = CONTRACT_LABEL_TARGETS.map(([, value]) => value);

const CONTRACT_LABEL_VISIBILITY = [
  ["overview", "container-header", "abbreviated"],
  ["overview", "node-label", "hidden"],
  ["overview", "edge-label", "hidden"],
  ["overview", "edge-artifact-chips", "hidden"],
  ["overview", "behaviour-card-slice", "hidden"],
  ["structure", "container-header", "full"],
  ["structure", "node-label", "hover-only"],
  ["structure", "edge-label", "hidden"],
  ["structure", "edge-artifact-chips", "hidden"],
  ["structure", "behaviour-card-slice", "hidden"],
  ["detail", "container-header", "full"],
  ["detail", "node-label", "full"],
  ["detail", "edge-label", "hover-only"],
  ["detail", "edge-artifact-chips", "hidden"],
  ["detail", "behaviour-card-slice", "hidden"],
  ["inspect", "container-header", "full"],
  ["inspect", "node-label", "full"],
  ["inspect", "edge-label", "full"],
  ["inspect", "edge-artifact-chips", "full"],
  ["inspect", "behaviour-card-slice", "hover-only"],
  ["source", "container-header", "full"],
  ["source", "node-label", "full"],
  ["source", "edge-label", "full"],
  ["source", "edge-artifact-chips", "full"],
  ["source", "behaviour-card-slice", "full"],
] as const satisfies readonly (readonly [ZoomBand, LabelTarget, LabelVisibility])[];

const CONTRACT_CHANNEL_BUDGET_CAPS = [
  ["overview", "border", 1, "highest-only"],
  ["overview", "caption-row", 0, "hide-all"],
  ["overview", "badge-cluster", 0, "hide-all"],
  ["overview", "chevron-slot", 0, "hide-all"],
  ["overview", "accent-slot", 1, "highest-only"],
  ["overview", "motion-channel", 1, "highest-only"],
  ["structure", "border", 2, "highest-only"],
  ["structure", "caption-row", 0, "hide-all"],
  ["structure", "badge-cluster", 1, "highest-only"],
  ["structure", "chevron-slot", 1, "highest-only"],
  ["structure", "accent-slot", 1, "highest-only"],
  ["structure", "motion-channel", 1, "highest-only"],
  ["detail", "border", 3, "collapse-to-plus-n"],
  ["detail", "caption-row", 1, "collapse-to-plus-n"],
  ["detail", "badge-cluster", 2, "collapse-to-plus-n"],
  ["detail", "chevron-slot", 1, "highest-only"],
  ["detail", "accent-slot", 1, "highest-only"],
  ["detail", "motion-channel", 1, "highest-only"],
  ["inspect", "border", 5, "collapse-to-plus-n"],
  ["inspect", "caption-row", 2, "collapse-to-plus-n"],
  ["inspect", "badge-cluster", 3, "collapse-to-plus-n"],
  ["inspect", "chevron-slot", 1, "highest-only"],
  ["inspect", "accent-slot", 1, "highest-only"],
  ["inspect", "motion-channel", 2, "collapse-to-plus-n"],
  ["source", "border", 5, "collapse-to-plus-n"],
  ["source", "caption-row", 3, "collapse-to-plus-n"],
  ["source", "badge-cluster", 5, "collapse-to-plus-n"],
  ["source", "chevron-slot", 1, "highest-only"],
  ["source", "accent-slot", 1, "highest-only"],
  ["source", "motion-channel", 3, "collapse-to-plus-n"],
] as const satisfies readonly (readonly [
  ZoomBand,
  VisualChannel,
  number,
  OverflowMode,
])[];

const CONTRACT_EDGE_BUNDLING = [
  ["overview", 2, true],
  ["structure", 3, true],
  ["detail", 5, true],
  ["inspect", 8, false],
  ["source", 999, false],
] as const satisfies readonly (readonly [ZoomBand, number, boolean])[];

const CONTRACT_HIT_TEST = [
  ["overview", 12, 4],
  ["structure", 10, 4],
  ["detail", 8, 6],
  ["inspect", 6, 8],
  ["source", 4, 8],
] as const satisfies readonly (readonly [ZoomBand, number, number])[];

const describe = test.describe;
const it = test;

describe("Zoom projection contract", () => {
  for (const [memberName, bandValue] of CONTRACT_ZOOM_BANDS) {
    it(`contains contract zoom band ${memberName} with stable string value ${bandValue}`, () => {
      expect(ALL_ZOOM_BANDS).toContain(bandValue);
      expect(zoomBandFromString(bandValue)).toBe(bandValue);
    });
  }

  for (const [memberName, visibilityValue] of CONTRACT_LABEL_VISIBILITIES) {
    it(`contains contract label visibility ${memberName} with stable string value ${visibilityValue}`, () => {
      expect(ALL_LABEL_VISIBILITIES).toContain(visibilityValue);
      expect(labelVisibilityFromString(visibilityValue)).toBe(visibilityValue);
    });
  }

  for (const [memberName, modeValue] of CONTRACT_OVERFLOW_MODES) {
    it(`contains contract overflow mode ${memberName} with stable string value ${modeValue}`, () => {
      expect(ALL_OVERFLOW_MODES).toContain(modeValue);
      expect(overflowModeFromString(modeValue)).toBe(modeValue);
    });
  }

  for (const [memberName, targetValue] of CONTRACT_LABEL_TARGETS) {
    it(`contains contract label target ${memberName} with stable string value ${targetValue}`, () => {
      expect(ALL_LABEL_TARGETS).toContain(targetValue);
      expect(labelTargetFromString(targetValue)).toBe(targetValue);
    });
  }

  it("contains exactly the contract enum values in declaration order", () => {
    expect(ALL_ZOOM_BANDS).toEqual(CONTRACT_ZOOM_BAND_VALUES);
    expect(ALL_LABEL_VISIBILITIES).toEqual(CONTRACT_LABEL_VISIBILITY_VALUES);
    expect(ALL_OVERFLOW_MODES).toEqual(CONTRACT_OVERFLOW_MODE_VALUES);
    expect(ALL_LABEL_TARGETS).toEqual(CONTRACT_LABEL_TARGET_VALUES);
  });

  it("throws instead of silently accepting unknown zoom band strings", () => {
    for (const invalidValue of ["", "overview ", "OVERVIEW", "detailish", "source-plus"]) {
      expect(() => zoomBandFromString(invalidValue)).toThrow();
    }
  });

  it("throws instead of silently accepting unknown label visibility strings", () => {
    for (const invalidValue of ["", "hover_only", "HIDDEN", "visible", "full "]) {
      expect(() => labelVisibilityFromString(invalidValue)).toThrow();
    }
  });

  it("throws instead of silently accepting unknown overflow mode strings", () => {
    for (const invalidValue of [
      "",
      "collapse_to_plus_n",
      "HIGHEST_ONLY",
      "show-all",
      "hide-all ",
    ]) {
      expect(() => overflowModeFromString(invalidValue)).toThrow();
    }
  });

  it("throws instead of silently accepting unknown label target strings", () => {
    for (const invalidValue of ["", "container_header", "NODE_LABEL", "card-slice", "node-label "]) {
      expect(() => labelTargetFromString(invalidValue)).toThrow();
    }
  });

  for (const [factor, expectedBand] of [
    [0.0, "overview"],
    [0.399, "overview"],
    [0.4, "structure"],
    [0.799, "structure"],
    [0.8, "detail"],
    [1.399, "detail"],
    [1.4, "inspect"],
    [2.499, "inspect"],
    [2.5, "source"],
    [8.0, "source"],
  ] as const satisfies readonly (readonly [number, ZoomBand])[]) {
    it(`maps zoom factor ${factor} to ${expectedBand}`, () => {
      expect(zoomBandForFactor(factor)).toBe(expectedBand);
    });
  }

  it("throws for zoom factors outside the contract range", () => {
    for (const invalidFactor of [-0.001, -1.0, 8.001, 9.0]) {
      expect(() => zoomBandForFactor(invalidFactor)).toThrow();
    }
  });

  for (const [band, target, expectedVisibility] of CONTRACT_LABEL_VISIBILITY) {
    it(`sets ${band} ${target} label visibility to ${expectedVisibility}`, () => {
      expect(LABEL_VISIBILITY[band][target]).toBe(expectedVisibility);
      expect(labelVisibility(band, target)).toBe(expectedVisibility);
    });
  }

  for (const [band, channel, expectedMaxVisible, expectedOverflow] of CONTRACT_CHANNEL_BUDGET_CAPS) {
    it(`sets ${band} ${channel} channel cap to ${expectedMaxVisible} ${expectedOverflow}`, () => {
      const cap = channelBudgetCap(band, channel);

      expect(CHANNEL_BUDGET_CAPS[band][channel]).toEqual(cap);
      expect(cap.zoomBand).toBe(band);
      expect(cap.channel).toBe(channel);
      expect(cap.maxVisibleClaimants).toBe(expectedMaxVisible);
      expect(cap.maxVisibleClaimants).toBeGreaterThanOrEqual(0);
      expect(cap.overflowMode).toBe(expectedOverflow);
    });
  }

  for (const [band, expectedThreshold, expectedActive] of CONTRACT_EDGE_BUNDLING) {
    it(`sets ${band} edge bundling to threshold ${expectedThreshold} and active ${expectedActive}`, () => {
      const rule = edgeBundling(band);

      expect(EDGE_BUNDLING[band]).toEqual(rule);
      expect(rule.zoomBand).toBe(band);
      expect(rule.bundleThreshold).toBe(expectedThreshold);
      expect(rule.bundlingActive).toBe(expectedActive);
    });
  }

  for (const [band, expectedEdgeRadius, expectedLabelPadding] of CONTRACT_HIT_TEST) {
    it(`sets ${band} hit-test precision to edge ${expectedEdgeRadius} and label ${expectedLabelPadding}`, () => {
      const precision = hitTestPrecision(band);

      expect(HIT_TEST[band]).toEqual(precision);
      expect(precision.zoomBand).toBe(band);
      expect(precision.edgeHitRadiusPx).toBe(expectedEdgeRadius);
      expect(precision.nodeLabelHitPaddingPx).toBe(expectedLabelPadding);
    });
  }
});
