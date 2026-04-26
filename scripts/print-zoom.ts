import {
  channelBudgetCap,
  edgeBundling,
  hitTestPrecision,
  labelVisibility,
  zoomBandForFactor,
  type LabelTarget,
  type ZoomBand,
} from "../app/lib/zoom";
import type { VisualChannel } from "../app/lib/channels";

type Scenario = {
  name: string;
  factor: number;
  label: readonly [ZoomBand, LabelTarget];
  channel: readonly [ZoomBand, VisualChannel];
  edge: ZoomBand;
  hit: ZoomBand;
};

const scenarios = [
  {
    name: "overview orientation",
    factor: 0.0,
    label: ["overview", "container-header"],
    channel: ["overview", "border"],
    edge: "overview",
    hit: "overview",
  },
  {
    name: "overview suppressed node label",
    factor: 0.399,
    label: ["overview", "node-label"],
    channel: ["overview", "caption-row"],
    edge: "overview",
    hit: "overview",
  },
  {
    name: "structure boundary",
    factor: 0.4,
    label: ["structure", "node-label"],
    channel: ["structure", "badge-cluster"],
    edge: "structure",
    hit: "structure",
  },
  {
    name: "structure chevron",
    factor: 0.799,
    label: ["structure", "edge-label"],
    channel: ["structure", "chevron-slot"],
    edge: "structure",
    hit: "structure",
  },
  {
    name: "detail boundary",
    factor: 0.8,
    label: ["detail", "edge-label"],
    channel: ["detail", "border"],
    edge: "detail",
    hit: "detail",
  },
  {
    name: "detail caption",
    factor: 1.399,
    label: ["detail", "node-label"],
    channel: ["detail", "caption-row"],
    edge: "detail",
    hit: "detail",
  },
  {
    name: "inspect boundary",
    factor: 1.4,
    label: ["inspect", "edge-artifact-chips"],
    channel: ["inspect", "motion-channel"],
    edge: "inspect",
    hit: "inspect",
  },
  {
    name: "inspect behaviour slice",
    factor: 2.499,
    label: ["inspect", "behaviour-card-slice"],
    channel: ["inspect", "badge-cluster"],
    edge: "inspect",
    hit: "inspect",
  },
  {
    name: "source boundary",
    factor: 2.5,
    label: ["source", "behaviour-card-slice"],
    channel: ["source", "caption-row"],
    edge: "source",
    hit: "source",
  },
  {
    name: "source max",
    factor: 8.0,
    label: ["source", "edge-label"],
    channel: ["source", "motion-channel"],
    edge: "source",
    hit: "source",
  },
] as const satisfies readonly Scenario[];

console.log(
  JSON.stringify({
    scenarios: scenarios.map((scenario) => {
      const cap = channelBudgetCap(...scenario.channel);
      const bundling = edgeBundling(scenario.edge);
      const hitTest = hitTestPrecision(scenario.hit);

      return {
        name: scenario.name,
        zoomBandForFactor: zoomBandForFactor(scenario.factor),
        labelVisibility: labelVisibility(...scenario.label),
        channelBudgetCap: cap,
        edgeBundling: bundling,
        hitTestPrecision: hitTest,
      };
    }),
  }),
);
