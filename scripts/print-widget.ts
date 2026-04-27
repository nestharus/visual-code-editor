import {
  makeWidget,
  makeWidgetMapping,
  widgetKindFromString,
  widgetSurfaceFromString,
  type WidgetKind,
  type WidgetSurface,
} from "../app/lib/widget";
import { makeTrustSignal } from "../app/lib/trust";

const widgetKinds = [
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

const widgetSurfaces = [
  "source",
  "storybook",
  "figma",
  "design-token",
  "runtime",
] as const satisfies readonly WidgetSurface[];

const widget = makeWidget({
  id: "widget:button.primary",
  label: "Primary Button",
  kind: "button",
  references: [
    {
      surface: "source",
      identifier: "Button.tsx",
      evidenceSource: "component export scan",
    },
    {
      surface: "storybook",
      identifier: "button--primary",
      evidenceSource: "storybook index",
    },
  ],
  trust: makeTrustSignal("grounded", "user-confirmed"),
  attributionActor: "agents:provider-mapper",
  createdAtMs: 1_700_000_000_000,
});

const mapping = makeWidgetMapping({
  id: "widget-mapping:button.primary-figma",
  widgetId: "widget:button.primary",
  reference: {
    surface: "figma",
    identifier: "figma:123",
    evidenceSource: "design review",
  },
  confirmedBy: "you-this-session",
  confirmedAtMs: 1_700_000_001_000,
  notes: null,
});

console.log(
  JSON.stringify({
    widgetKinds: widgetKinds.map(widgetKindFromString),
    widgetSurfaces: widgetSurfaces.map(widgetSurfaceFromString),
    widget,
    mapping,
  }),
);
