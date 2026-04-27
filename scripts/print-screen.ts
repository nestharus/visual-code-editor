import {
  makeScreen,
  makeScreenEdge,
  screenEdgeKindFromString,
  screenEdgeTriggerFromString,
  screenKindFromString,
  type ScreenEdgeKind,
  type ScreenEdgeTrigger,
  type ScreenKind,
} from "../app/lib/screen";
import { makeTrustSignal } from "../app/lib/trust";

const screenKinds = [
  "page",
  "modal",
  "overlay",
  "dialog",
  "popover",
  "drawer",
  "sidepanel",
  "toast",
] as const satisfies readonly ScreenKind[];

const screenEdgeKinds = [
  "navigate",
  "open-modal",
  "close-modal",
  "push",
  "pop",
  "replace",
  "redirect",
  "user-back",
] as const satisfies readonly ScreenEdgeKind[];

const screenEdgeTriggers = [
  "click",
  "keyboard",
  "auto",
  "route",
  "parent-request",
] as const satisfies readonly ScreenEdgeTrigger[];

const screen = makeScreen({
  id: "screen:overview",
  label: "Overview",
  kind: "page",
  route: "/",
  widgetIds: [
    "widget:nav.primary",
    "widget:graph.canvas",
    "widget:nav.primary",
  ],
  trust: makeTrustSignal("grounded", "user-confirmed"),
  attributionActor: "generator",
  createdAtMs: 1_700_000_000_000,
});

const screenEdge = makeScreenEdge({
  id: "screen-edge:overview-to-detail",
  fromScreenId: "screen:overview",
  toScreenId: "screen:detail",
  kind: "navigate",
  trigger: "click",
  trust: makeTrustSignal("candidate", null),
  attributionActor: "you-this-session",
  observedAtMs: 1_700_000_001_000,
});

console.log(
  JSON.stringify({
    screenKinds: screenKinds.map(screenKindFromString),
    screenEdgeKinds: screenEdgeKinds.map(screenEdgeKindFromString),
    screenEdgeTriggers: screenEdgeTriggers.map(screenEdgeTriggerFromString),
    screen,
    screenEdge,
  }),
);
