import { expect, test } from "@playwright/test";

import {
  colorRoleFromString,
  contrastLevelFromString,
  makeColorPalette,
  makeColorToken,
  makeContrastPair,
  type ColorPalette,
  type ColorRole,
  type ColorToken,
  type ContrastLevel,
  type ContrastPair,
} from "./color";
import { makeTrustSignal } from "./trust";

const CONTRACT_COLOR_ROLES = [
  ["PRIMARY", "primary"],
  ["SECONDARY", "secondary"],
  ["ACCENT", "accent"],
  ["NEUTRAL", "neutral"],
  ["SURFACE", "surface"],
  ["BACKGROUND", "background"],
  ["TEXT", "text"],
  ["BORDER", "border"],
  ["SUCCESS", "success"],
  ["WARNING", "warning"],
  ["ERROR", "error"],
  ["INFO", "info"],
  ["MUTED", "muted"],
  ["DECORATIVE", "decorative"],
] as const satisfies readonly (readonly [string, ColorRole])[];

const CONTRACT_CONTRAST_LEVELS = [
  ["PASS_AA", "pass-aa"],
  ["PASS_AAA", "pass-aaa"],
  ["FAIL", "fail"],
  ["NOT_TEXT", "not-text"],
] as const satisfies readonly (readonly [string, ContrastLevel])[];

const CONTRACT_COLOR_ROLE_VALUES = CONTRACT_COLOR_ROLES.map(([, role]) => role);
const CONTRACT_CONTRAST_LEVEL_VALUES = CONTRACT_CONTRAST_LEVELS.map(
  ([, level]) => level,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractColorRole = (typeof CONTRACT_COLOR_ROLES)[number][1];
type ContractContrastLevel = (typeof CONTRACT_CONTRAST_LEVELS)[number][1];
type _ColorRoleMembership = Assert<Equal<ColorRole, ContractColorRole>>;
type _ContrastLevelMembership = Assert<Equal<ContrastLevel, ContractContrastLevel>>;

const describe = test.describe;
const it = test;

function token(overrides: Partial<ColorToken> = {}): ColorToken {
  return makeColorToken({
    id: "color-token:text.primary",
    name: "Primary text",
    role: "text",
    hexValue: "#FFFFFF",
    description: "Primary foreground text.",
    trust: makeTrustSignal("candidate", null),
    attributionActor: "generator",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function contrastPair(overrides: Partial<ContrastPair> = {}): ContrastPair {
  return makeContrastPair({
    id: "contrast-pair:text-on-bg",
    foregroundTokenId: "color-token:text.primary",
    backgroundTokenId: "color-token:bg.default",
    ratio: 7.5,
    levelNormalText: "pass-aa",
    levelLargeText: "pass-aaa",
    levelUiComponent: "pass-aa",
    computedAtMs: 1_700_000_000_001,
    ...overrides,
  });
}

function palette(overrides: Partial<ColorPalette> = {}): ColorPalette {
  return makeColorPalette({
    id: "color-palette:workspace.default",
    workspaceId: "workspace:main",
    tokens: [
      token({ id: "color-token:text.primary" }),
      token({
        id: "color-token:bg.default",
        name: "Default background",
        role: "background",
        hexValue: "#0D1117",
      }),
    ],
    contrastPairs: [contrastPair()],
    computedAtMs: 1_700_000_000_002,
    ...overrides,
  });
}

describe("Color schema contract", () => {
  for (const [memberName, roleValue] of CONTRACT_COLOR_ROLES) {
    it(`contains contract color role ${memberName} with stable string value ${roleValue}`, () => {
      expect(colorRoleFromString(roleValue)).toBe(roleValue);
    });
  }

  for (const [memberName, levelValue] of CONTRACT_CONTRAST_LEVELS) {
    it(`contains contract contrast level ${memberName} with stable string value ${levelValue}`, () => {
      expect(contrastLevelFromString(levelValue)).toBe(levelValue);
    });
  }

  it("contains exactly the 14 contract color roles", () => {
    expect(CONTRACT_COLOR_ROLE_VALUES).toHaveLength(14);
    expect(new Set(CONTRACT_COLOR_ROLE_VALUES).size).toBe(14);
  });

  it("contains exactly the 4 contract contrast levels", () => {
    expect(CONTRACT_CONTRAST_LEVEL_VALUES).toHaveLength(4);
    expect(new Set(CONTRACT_CONTRAST_LEVEL_VALUES).size).toBe(4);
  });

  it("throws instead of silently accepting unknown color role strings", () => {
    for (const invalidValue of ["", "PRIMARY", "primary ", "brand", "pass-aa"]) {
      expect(
        () => colorRoleFromString(invalidValue),
        `colorRoleFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown contrast level strings", () => {
    for (const invalidValue of ["", "PASS_AA", "pass_aa", "aa", "text"]) {
      expect(
        () => contrastLevelFromString(invalidValue),
        `contrastLevelFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts color token ids matching the contract pattern", () => {
    for (const tokenId of [
      "color-token:text.primary",
      "color-token:Brand_123",
      "color-token:surface-muted",
    ]) {
      expect(token({ id: tokenId }).id).toBe(tokenId);
    }
  });

  it("rejects color token ids outside the contract pattern", () => {
    for (const tokenId of [
      "",
      "text.primary",
      "color-token:",
      "Color-token:text",
      "color-token:has spaces",
      "color-token:text/primary",
    ]) {
      expect(() => token({ id: tokenId })).toThrow();
    }
  });

  it("accepts six- or eight-digit hex values with a leading hash", () => {
    for (const hexValue of ["#FFFFFF", "#FFFFFFFF", "#00ffaa", "#00ffaa80"]) {
      expect(token({ hexValue }).hexValue).toBe(hexValue);
    }
  });

  it("rejects hex values outside the contract regex", () => {
    for (const hexValue of [
      "",
      "FFFFFF",
      "#fff",
      "#FFFFF",
      "#FFFFFFF",
      "#FFFFFFFFF",
      "#GGGGGG",
    ]) {
      expect(() => token({ hexValue })).toThrow();
    }
  });

  it("accepts contrast pair ids matching the contract pattern", () => {
    for (const pairId of [
      "contrast-pair:text-on-bg",
      "contrast-pair:Pair_123",
      "contrast-pair:foreground.background",
    ]) {
      expect(contrastPair({ id: pairId }).id).toBe(pairId);
    }
  });

  it("rejects contrast pair ids outside the contract pattern", () => {
    for (const pairId of [
      "",
      "text-on-bg",
      "contrast-pair:",
      "Contrast-pair:text-on-bg",
      "contrast-pair:has spaces",
      "contrast-pair:text/bg",
    ]) {
      expect(() => contrastPair({ id: pairId })).toThrow();
    }
  });

  it("accepts color-token ids for contrast pair endpoints", () => {
    for (const tokenId of [
      "color-token:text.primary",
      "color-token:Brand_123",
      "color-token:surface-muted",
    ]) {
      expect(contrastPair({ foregroundTokenId: tokenId }).foregroundTokenId).toBe(
        tokenId,
      );
      const backgroundOverrides: Partial<ContrastPair> =
        tokenId === "color-token:text.primary"
          ? {
              foregroundTokenId: "color-token:other.foreground",
              backgroundTokenId: tokenId,
            }
          : { backgroundTokenId: tokenId };
      expect(contrastPair(backgroundOverrides).backgroundTokenId).toBe(tokenId);
    }
  });

  it("rejects invalid contrast pair endpoint token ids", () => {
    for (const tokenId of [
      "",
      "text.primary",
      "color-token:",
      "Color-token:text",
      "color-token:has spaces",
      "color-token:text/primary",
    ]) {
      expect(() => contrastPair({ foregroundTokenId: tokenId })).toThrow();
      expect(() => contrastPair({ backgroundTokenId: tokenId })).toThrow();
    }
  });

  it("rejects contrast pairs with equal foreground and background token ids", () => {
    expect(() =>
      contrastPair({
        foregroundTokenId: "color-token:text.primary",
        backgroundTokenId: "color-token:text.primary",
      }),
    ).toThrow();
  });

  it("accepts contrast ratios greater than or equal to 1.0", () => {
    expect(contrastPair({ ratio: 1.0 }).ratio).toBe(1.0);
    expect(contrastPair({ ratio: 4.5 }).ratio).toBe(4.5);
  });

  it("rejects contrast ratios below 1.0", () => {
    expect(() => contrastPair({ ratio: 0.999 })).toThrow();
  });

  it("accepts color palette ids matching the contract pattern", () => {
    for (const paletteId of [
      "color-palette:workspace.default",
      "color-palette:Palette_123",
      "color-palette:theme-dark",
    ]) {
      expect(palette({ id: paletteId }).id).toBe(paletteId);
    }
  });

  it("rejects color palette ids outside the contract pattern", () => {
    for (const paletteId of [
      "",
      "workspace.default",
      "color-palette:",
      "Color-palette:workspace",
      "color-palette:has spaces",
      "color-palette:workspace/default",
    ]) {
      expect(() => palette({ id: paletteId })).toThrow();
    }
  });

  it("requires color palettes to contain at least one token", () => {
    expect(() => palette({ tokens: [] })).toThrow();
  });

  it("rejects color palettes with duplicate token ids", () => {
    const duplicateToken = token({ id: "color-token:text.primary" });

    expect(() => palette({ tokens: [duplicateToken, duplicateToken] })).toThrow();
  });
});
