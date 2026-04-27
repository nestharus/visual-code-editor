import {
  colorRoleFromString,
  contrastLevelFromString,
  makeColorPalette,
  makeColorToken,
  makeContrastPair,
  type ColorRole,
  type ContrastLevel,
} from "../app/lib/color";
import { makeTrustSignal } from "../app/lib/trust";

const colorRoles = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "surface",
  "background",
  "text",
  "border",
  "success",
  "warning",
  "error",
  "info",
  "muted",
  "decorative",
] as const satisfies readonly ColorRole[];

const contrastLevels = [
  "pass-aa",
  "pass-aaa",
  "fail",
  "not-text",
] as const satisfies readonly ContrastLevel[];

const palette = makeColorPalette({
  id: "color-palette:workspace.default",
  workspaceId: "workspace:main",
  tokens: [
    makeColorToken({
      id: "color-token:text.primary",
      name: "Primary text",
      role: "text",
      hexValue: "#FFFFFF",
      description: "Primary foreground text.",
      trust: makeTrustSignal("candidate", null),
      attributionActor: "generator",
      createdAtMs: 1_700_000_000_000,
    }),
    makeColorToken({
      id: "color-token:bg.default",
      name: "Default background",
      role: "background",
      hexValue: "#0D1117",
      description: null,
      trust: makeTrustSignal("grounded", "user-confirmed"),
      attributionActor: "you-this-session",
      createdAtMs: 1_700_000_000_001,
    }),
  ],
  contrastPairs: [
    makeContrastPair({
      id: "contrast-pair:text-on-bg",
      foregroundTokenId: "color-token:text.primary",
      backgroundTokenId: "color-token:bg.default",
      ratio: 7.5,
      levelNormalText: "pass-aa",
      levelLargeText: "pass-aaa",
      levelUiComponent: "pass-aa",
      computedAtMs: 1_700_000_000_002,
    }),
  ],
  computedAtMs: 1_700_000_000_003,
});

console.log(
  JSON.stringify({
    colorRoles: colorRoles.map(colorRoleFromString),
    contrastLevels: contrastLevels.map(contrastLevelFromString),
    palette,
  }),
);
