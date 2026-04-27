import {
  makeRuntimeStateCapture,
  makeRuntimeStateNode,
  runtimeStateKindFromString,
  runtimeStateNodeKindFromString,
  type RuntimeStateKind,
  type RuntimeStateNodeKind,
} from "../app/lib/runtime-state";
import { makeTrustSignal } from "../app/lib/trust";

const runtimeStateKinds = [
  "component-tree",
  "props-only",
  "signal-graph",
  "network-log",
  "console-log",
  "dom-snapshot",
] as const satisfies readonly RuntimeStateKind[];

const runtimeStateNodeKinds = [
  "component",
  "element",
  "text",
  "fragment",
  "portal",
] as const satisfies readonly RuntimeStateNodeKind[];

const runtimeStateCapture = makeRuntimeStateCapture({
  id: "runtime-capture:graph.canvas.1700000000000",
  widgetId: "widget:graph.canvas",
  screenId: "screen:overview",
  kind: "component-tree",
  nodes: [
    makeRuntimeStateNode({
      kind: "component",
      name: "GraphCanvas",
      propsSummary: "nodes=12 edges=18",
      childrenCount: 3,
    }),
    makeRuntimeStateNode({
      kind: "element",
      name: "div",
      propsSummary: "class=graph-surface",
      childrenCount: 0,
    }),
  ],
  rawPayloadPath: "public/data/runtime/graph.canvas/dom.json",
  trust: makeTrustSignal("grounded", "runtime-trace"),
  attributionActor: "generator",
  capturedAtMs: 1_700_000_000_000,
});

console.log(
  JSON.stringify({
    runtimeStateKinds: runtimeStateKinds.map(runtimeStateKindFromString),
    runtimeStateNodeKinds: runtimeStateNodeKinds.map(
      runtimeStateNodeKindFromString,
    ),
    runtimeStateCapture,
  }),
);
