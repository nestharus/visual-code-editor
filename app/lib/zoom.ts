import type { VisualChannel } from "./channels";

export const ALL_ZOOM_BANDS = [
  "overview",
  "structure",
  "detail",
  "inspect",
  "source",
] as const;

export type ZoomBand = (typeof ALL_ZOOM_BANDS)[number];

export const ALL_LABEL_VISIBILITIES = [
  "hidden",
  "hover-only",
  "abbreviated",
  "full",
] as const;

export type LabelVisibility = (typeof ALL_LABEL_VISIBILITIES)[number];

export const ALL_OVERFLOW_MODES = [
  "collapse-to-plus-n",
  "highest-only",
  "hide-all",
] as const;

export type OverflowMode = (typeof ALL_OVERFLOW_MODES)[number];

export const ALL_LABEL_TARGETS = [
  "container-header",
  "node-label",
  "edge-label",
  "edge-artifact-chips",
  "behaviour-card-slice",
] as const;

export type LabelTarget = (typeof ALL_LABEL_TARGETS)[number];

export interface ChannelBudgetCap {
  zoomBand: ZoomBand;
  channel: VisualChannel;
  maxVisibleClaimants: number;
  overflowMode: OverflowMode;
}

export interface EdgeBundlingRule {
  zoomBand: ZoomBand;
  bundleThreshold: number;
  bundlingActive: boolean;
}

export interface HitTestPrecision {
  zoomBand: ZoomBand;
  edgeHitRadiusPx: number;
  nodeLabelHitPaddingPx: number;
}

const ZOOM_BAND_SET: ReadonlySet<string> = new Set(ALL_ZOOM_BANDS);
const LABEL_VISIBILITY_SET: ReadonlySet<string> = new Set(ALL_LABEL_VISIBILITIES);
const OVERFLOW_MODE_SET: ReadonlySet<string> = new Set(ALL_OVERFLOW_MODES);
const LABEL_TARGET_SET: ReadonlySet<string> = new Set(ALL_LABEL_TARGETS);

export const LABEL_VISIBILITY: Readonly<
  Record<ZoomBand, Readonly<Record<LabelTarget, LabelVisibility>>>
> = Object.freeze({
  overview: Object.freeze({
    "container-header": "abbreviated",
    "node-label": "hidden",
    "edge-label": "hidden",
    "edge-artifact-chips": "hidden",
    "behaviour-card-slice": "hidden",
  }),
  structure: Object.freeze({
    "container-header": "full",
    "node-label": "hover-only",
    "edge-label": "hidden",
    "edge-artifact-chips": "hidden",
    "behaviour-card-slice": "hidden",
  }),
  detail: Object.freeze({
    "container-header": "full",
    "node-label": "full",
    "edge-label": "hover-only",
    "edge-artifact-chips": "hidden",
    "behaviour-card-slice": "hidden",
  }),
  inspect: Object.freeze({
    "container-header": "full",
    "node-label": "full",
    "edge-label": "full",
    "edge-artifact-chips": "full",
    "behaviour-card-slice": "hover-only",
  }),
  source: Object.freeze({
    "container-header": "full",
    "node-label": "full",
    "edge-label": "full",
    "edge-artifact-chips": "full",
    "behaviour-card-slice": "full",
  }),
});

export const CHANNEL_BUDGET_CAPS: Readonly<
  Record<ZoomBand, Readonly<Record<VisualChannel, ChannelBudgetCap>>>
> = Object.freeze({
  overview: Object.freeze({
    border: Object.freeze({
      zoomBand: "overview",
      channel: "border",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "caption-row": Object.freeze({
      zoomBand: "overview",
      channel: "caption-row",
      maxVisibleClaimants: 0,
      overflowMode: "hide-all",
    }),
    "badge-cluster": Object.freeze({
      zoomBand: "overview",
      channel: "badge-cluster",
      maxVisibleClaimants: 0,
      overflowMode: "hide-all",
    }),
    "chevron-slot": Object.freeze({
      zoomBand: "overview",
      channel: "chevron-slot",
      maxVisibleClaimants: 0,
      overflowMode: "hide-all",
    }),
    "accent-slot": Object.freeze({
      zoomBand: "overview",
      channel: "accent-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "motion-channel": Object.freeze({
      zoomBand: "overview",
      channel: "motion-channel",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
  }),
  structure: Object.freeze({
    border: Object.freeze({
      zoomBand: "structure",
      channel: "border",
      maxVisibleClaimants: 2,
      overflowMode: "highest-only",
    }),
    "caption-row": Object.freeze({
      zoomBand: "structure",
      channel: "caption-row",
      maxVisibleClaimants: 0,
      overflowMode: "hide-all",
    }),
    "badge-cluster": Object.freeze({
      zoomBand: "structure",
      channel: "badge-cluster",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "chevron-slot": Object.freeze({
      zoomBand: "structure",
      channel: "chevron-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "accent-slot": Object.freeze({
      zoomBand: "structure",
      channel: "accent-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "motion-channel": Object.freeze({
      zoomBand: "structure",
      channel: "motion-channel",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
  }),
  detail: Object.freeze({
    border: Object.freeze({
      zoomBand: "detail",
      channel: "border",
      maxVisibleClaimants: 3,
      overflowMode: "collapse-to-plus-n",
    }),
    "caption-row": Object.freeze({
      zoomBand: "detail",
      channel: "caption-row",
      maxVisibleClaimants: 1,
      overflowMode: "collapse-to-plus-n",
    }),
    "badge-cluster": Object.freeze({
      zoomBand: "detail",
      channel: "badge-cluster",
      maxVisibleClaimants: 2,
      overflowMode: "collapse-to-plus-n",
    }),
    "chevron-slot": Object.freeze({
      zoomBand: "detail",
      channel: "chevron-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "accent-slot": Object.freeze({
      zoomBand: "detail",
      channel: "accent-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "motion-channel": Object.freeze({
      zoomBand: "detail",
      channel: "motion-channel",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
  }),
  inspect: Object.freeze({
    border: Object.freeze({
      zoomBand: "inspect",
      channel: "border",
      maxVisibleClaimants: 5,
      overflowMode: "collapse-to-plus-n",
    }),
    "caption-row": Object.freeze({
      zoomBand: "inspect",
      channel: "caption-row",
      maxVisibleClaimants: 2,
      overflowMode: "collapse-to-plus-n",
    }),
    "badge-cluster": Object.freeze({
      zoomBand: "inspect",
      channel: "badge-cluster",
      maxVisibleClaimants: 3,
      overflowMode: "collapse-to-plus-n",
    }),
    "chevron-slot": Object.freeze({
      zoomBand: "inspect",
      channel: "chevron-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "accent-slot": Object.freeze({
      zoomBand: "inspect",
      channel: "accent-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "motion-channel": Object.freeze({
      zoomBand: "inspect",
      channel: "motion-channel",
      maxVisibleClaimants: 2,
      overflowMode: "collapse-to-plus-n",
    }),
  }),
  source: Object.freeze({
    border: Object.freeze({
      zoomBand: "source",
      channel: "border",
      maxVisibleClaimants: 5,
      overflowMode: "collapse-to-plus-n",
    }),
    "caption-row": Object.freeze({
      zoomBand: "source",
      channel: "caption-row",
      maxVisibleClaimants: 3,
      overflowMode: "collapse-to-plus-n",
    }),
    "badge-cluster": Object.freeze({
      zoomBand: "source",
      channel: "badge-cluster",
      maxVisibleClaimants: 5,
      overflowMode: "collapse-to-plus-n",
    }),
    "chevron-slot": Object.freeze({
      zoomBand: "source",
      channel: "chevron-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "accent-slot": Object.freeze({
      zoomBand: "source",
      channel: "accent-slot",
      maxVisibleClaimants: 1,
      overflowMode: "highest-only",
    }),
    "motion-channel": Object.freeze({
      zoomBand: "source",
      channel: "motion-channel",
      maxVisibleClaimants: 3,
      overflowMode: "collapse-to-plus-n",
    }),
  }),
});

export const EDGE_BUNDLING: Readonly<Record<ZoomBand, EdgeBundlingRule>> =
  Object.freeze({
    overview: Object.freeze({
      zoomBand: "overview",
      bundleThreshold: 2,
      bundlingActive: true,
    }),
    structure: Object.freeze({
      zoomBand: "structure",
      bundleThreshold: 3,
      bundlingActive: true,
    }),
    detail: Object.freeze({
      zoomBand: "detail",
      bundleThreshold: 5,
      bundlingActive: true,
    }),
    inspect: Object.freeze({
      zoomBand: "inspect",
      bundleThreshold: 8,
      bundlingActive: false,
    }),
    source: Object.freeze({
      zoomBand: "source",
      bundleThreshold: 999,
      bundlingActive: false,
    }),
  });

export const HIT_TEST: Readonly<Record<ZoomBand, HitTestPrecision>> = Object.freeze({
  overview: Object.freeze({
    zoomBand: "overview",
    edgeHitRadiusPx: 12,
    nodeLabelHitPaddingPx: 4,
  }),
  structure: Object.freeze({
    zoomBand: "structure",
    edgeHitRadiusPx: 10,
    nodeLabelHitPaddingPx: 4,
  }),
  detail: Object.freeze({
    zoomBand: "detail",
    edgeHitRadiusPx: 8,
    nodeLabelHitPaddingPx: 6,
  }),
  inspect: Object.freeze({
    zoomBand: "inspect",
    edgeHitRadiusPx: 6,
    nodeLabelHitPaddingPx: 8,
  }),
  source: Object.freeze({
    zoomBand: "source",
    edgeHitRadiusPx: 4,
    nodeLabelHitPaddingPx: 8,
  }),
});

export function zoomBandFromString(value: string): ZoomBand {
  if (ZOOM_BAND_SET.has(value)) {
    return value as ZoomBand;
  }

  throw new Error(`Unknown zoom band: ${value}`);
}

export function labelVisibilityFromString(value: string): LabelVisibility {
  if (LABEL_VISIBILITY_SET.has(value)) {
    return value as LabelVisibility;
  }

  throw new Error(`Unknown label visibility: ${value}`);
}

export function overflowModeFromString(value: string): OverflowMode {
  if (OVERFLOW_MODE_SET.has(value)) {
    return value as OverflowMode;
  }

  throw new Error(`Unknown overflow mode: ${value}`);
}

export function labelTargetFromString(value: string): LabelTarget {
  if (LABEL_TARGET_SET.has(value)) {
    return value as LabelTarget;
  }

  throw new Error(`Unknown label target: ${value}`);
}

export function zoomBandForFactor(factor: number): ZoomBand {
  if (factor < 0) {
    throw new Error(`Zoom factor must be >= 0: ${factor}`);
  }
  if (factor < 0.4) {
    return "overview";
  }
  if (factor < 0.8) {
    return "structure";
  }
  if (factor < 1.4) {
    return "detail";
  }
  if (factor < 2.5) {
    return "inspect";
  }
  if (factor <= 8.0) {
    return "source";
  }

  throw new Error(`Zoom factor must be <= 8.0: ${factor}`);
}

export function labelVisibility(
  band: ZoomBand,
  target: LabelTarget,
): LabelVisibility {
  const visibility = LABEL_VISIBILITY[band]?.[target];
  if (visibility !== undefined) {
    return visibility;
  }

  throw new Error(`Unknown label visibility rule for band ${band} and target ${target}`);
}

export function channelBudgetCap(
  band: ZoomBand,
  channel: VisualChannel,
): ChannelBudgetCap {
  const cap = CHANNEL_BUDGET_CAPS[band]?.[channel];
  if (cap !== undefined) {
    return cap;
  }

  throw new Error(`Unknown channel budget cap for band ${band} and channel ${channel}`);
}

export function edgeBundling(band: ZoomBand): EdgeBundlingRule {
  const rule = EDGE_BUNDLING[band];
  if (rule !== undefined) {
    return rule;
  }

  throw new Error(`Unknown edge bundling rule for band ${band}`);
}

export function hitTestPrecision(band: ZoomBand): HitTestPrecision {
  const precision = HIT_TEST[band];
  if (precision !== undefined) {
    return precision;
  }

  throw new Error(`Unknown hit-test precision for band ${band}`);
}
