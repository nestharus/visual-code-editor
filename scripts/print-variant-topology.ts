import { makeTrustSignal } from "../app/lib/trust";
import {
  makeVariantTopology,
  variantAxisKindFromString,
  variantCellStateFromString,
  type VariantAxisKind,
  type VariantCellState,
} from "../app/lib/variant-topology";

const variantAxisKinds = [
  "prop",
  "theme",
  "locale",
  "density",
  "a11y-state",
  "implied-state",
  "viewport",
] as const satisfies readonly VariantAxisKind[];

const variantCellStates = [
  "grounded",
  "candidate",
  "missing",
  "implied",
] as const satisfies readonly VariantCellState[];

const variantTopology = makeVariantTopology({
  id: "variant-topology:button.primary",
  widgetId: "widget:button.primary",
  axes: [
    {
      kind: "prop",
      name: "size",
      values: ["small", "large"],
    },
    {
      kind: "theme",
      name: "theme",
      values: ["dark", "light"],
    },
  ],
  cells: [
    {
      coordinates: { size: "small", theme: "dark" },
      state: "grounded",
      evidenceRenderIds: ["render:button.primary.desktop"],
      trust: makeTrustSignal("grounded", "user-confirmed"),
    },
    {
      coordinates: { size: "large", theme: "light" },
      state: "candidate",
      evidenceRenderIds: [],
      trust: makeTrustSignal("candidate", null),
    },
  ],
  computedAtMs: 1_700_000_000_000,
});

console.log(
  JSON.stringify({
    variantAxisKinds: variantAxisKinds.map(variantAxisKindFromString),
    variantCellStates: variantCellStates.map(variantCellStateFromString),
    variantTopology,
  }),
);
