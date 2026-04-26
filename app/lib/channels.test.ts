import { expect, test } from "@playwright/test";

import {
  ALL_CHANNEL_CLAIMANTS,
  ALL_VISUAL_CHANNELS,
  CHANNEL_PRECEDENCE,
  channelClaimantFromString,
  channelsForClaimant,
  claimantsForChannel,
  precedenceOf,
  visualChannelFromString,
  winner,
  type ChannelClaimant,
  type VisualChannel,
} from "./channels";

const CONTRACT_CHANNELS = [
  ["BORDER", "border"],
  ["CAPTION_ROW", "caption-row"],
  ["BADGE_CLUSTER", "badge-cluster"],
  ["CHEVRON_SLOT", "chevron-slot"],
  ["ACCENT_SLOT", "accent-slot"],
  ["MOTION_CHANNEL", "motion-channel"],
] as const satisfies readonly (readonly [string, VisualChannel])[];

const CONTRACT_CLAIMANTS = [
  ["L_ZOOM_LABEL", "L:zoom-label"],
  ["B_SELECTION", "B:selection"],
  ["E_PR_DELTA", "E:pr-delta"],
  ["K_ACTIVE_TASK", "K:active-task"],
  ["F_SLICE_MATCH", "F:slice-match"],
  ["H_STALE", "H:stale"],
  ["G_TEST_OVERLAY", "G:test-overlay"],
  ["G_DEPLOY_OVERLAY", "G:deploy-overlay"],
  ["G_PROFILE_OVERLAY", "G:profile-overlay"],
  ["D_CHANGE_ORIGIN", "D:change-origin"],
  ["H2_FREEZE_PENDING", "H2:freeze-pending"],
  ["H3_LIFECYCLE", "H3:lifecycle"],
  ["I_PROVIDER_HEALTH", "I:provider-health"],
  ["A_BEHAVIOR_CHIP", "A:behavior-chip"],
] as const satisfies readonly (readonly [string, ChannelClaimant])[];

const CONTRACT_CHANNEL_VALUES = CONTRACT_CHANNELS.map(([, channel]) => channel);
const CONTRACT_CLAIMANT_VALUES = CONTRACT_CLAIMANTS.map(([, claimant]) => claimant);

const CONTRACT_PRECEDENCE = {
  border: [
    "E:pr-delta",
    "B:selection",
    "K:active-task",
    "F:slice-match",
    "H:stale",
    "D:change-origin",
  ],
  "caption-row": [
    "H:stale",
    "K:active-task",
    "E:pr-delta",
    "D:change-origin",
    "G:test-overlay",
    "G:deploy-overlay",
    "A:behavior-chip",
  ],
  "badge-cluster": [
    "H2:freeze-pending",
    "E:pr-delta",
    "G:test-overlay",
    "H3:lifecycle",
    "I:provider-health",
    "D:change-origin",
  ],
  "chevron-slot": ["L:zoom-label"],
  "accent-slot": ["H:stale", "K:active-task", "G:profile-overlay"],
  "motion-channel": [
    "H2:freeze-pending",
    "K:active-task",
    "G:profile-overlay",
    "H:stale",
  ],
} as const satisfies Readonly<Record<VisualChannel, readonly ChannelClaimant[]>>;

const describe = test.describe;
const it = test;

describe("Visual channel precedence contract", () => {
  for (const [memberName, channelValue] of CONTRACT_CHANNELS) {
    it(`contains contract channel ${memberName} with stable string value ${channelValue}`, () => {
      expect(ALL_VISUAL_CHANNELS).toContain(channelValue);
      expect(visualChannelFromString(channelValue)).toBe(channelValue);
    });
  }

  for (const [memberName, claimantValue] of CONTRACT_CLAIMANTS) {
    it(`contains contract claimant ${memberName} with stable string value ${claimantValue}`, () => {
      expect(ALL_CHANNEL_CLAIMANTS).toContain(claimantValue);
      expect(channelClaimantFromString(claimantValue)).toBe(claimantValue);
    });
  }

  it("contains exactly the 6 contract channels", () => {
    expect(ALL_VISUAL_CHANNELS).toHaveLength(6);
    expect(ALL_VISUAL_CHANNELS).toEqual(CONTRACT_CHANNEL_VALUES);
  });

  it("contains exactly the 14 contract claimants", () => {
    expect(ALL_CHANNEL_CLAIMANTS).toHaveLength(14);
    expect(ALL_CHANNEL_CLAIMANTS).toEqual(CONTRACT_CLAIMANT_VALUES);
  });

  it("throws instead of silently accepting unknown channel strings", () => {
    for (const invalidValue of [
      "",
      "Border",
      "caption_row",
      "badge",
      "BORDER",
      "motion-channel ",
    ]) {
      expect(
        () => visualChannelFromString(invalidValue),
        `visualChannelFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown claimant strings", () => {
    for (const invalidValue of [
      "",
      "B:selection ",
      "selection",
      "G:trace-overlay",
      "L_ZOOM_LABEL",
      "H4:lifecycle",
    ]) {
      expect(
        () => channelClaimantFromString(invalidValue),
        `channelClaimantFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("contains exactly the contract precedence channels", () => {
    expect(new Set(Object.keys(CHANNEL_PRECEDENCE))).toEqual(
      new Set(Object.keys(CONTRACT_PRECEDENCE)),
    );
  });

  for (const channel of CONTRACT_CHANNEL_VALUES) {
    it(`covers exactly the contract claimants for ${channel}`, () => {
      expect(new Set(CHANNEL_PRECEDENCE[channel])).toEqual(
        new Set(CONTRACT_PRECEDENCE[channel]),
      );
    });

    it(`keeps precedence order exactly for ${channel}`, () => {
      expect(CHANNEL_PRECEDENCE[channel]).toEqual(CONTRACT_PRECEDENCE[channel]);
      expect(claimantsForChannel(channel)).toEqual(CONTRACT_PRECEDENCE[channel]);
    });

    it(`returns 0-based precedence indexes for ${channel}`, () => {
      for (const [expectedIndex, claimant] of CONTRACT_PRECEDENCE[channel].entries()) {
        expect(precedenceOf(channel, claimant)).toBe(expectedIndex);
      }
    });
  }

  it("throws for unregistered channel and claimant pairs", () => {
    expect(() => precedenceOf("chevron-slot", "B:selection")).toThrow();
    expect(() => precedenceOf("border", "L:zoom-label")).toThrow();
    expect(() => precedenceOf("accent-slot", "E:pr-delta")).toThrow();
  });

  it("returns the highest-priority supplied claimant as winner", () => {
    expect(winner("border", ["D:change-origin", "B:selection", "H:stale"])).toBe(
      "B:selection",
    );
    expect(winner("caption-row", ["G:deploy-overlay", "E:pr-delta", "H:stale"])).toBe(
      "H:stale",
    );
    expect(winner("motion-channel", ["H:stale", "K:active-task", "G:profile-overlay"])).toBe(
      "K:active-task",
    );
  });

  it("returns null for an empty claimant list", () => {
    expect(winner("border", [])).toBeNull();
  });

  it("returns null when no supplied claimants are registered for the channel", () => {
    expect(winner("chevron-slot", ["B:selection", "E:pr-delta", "K:active-task"])).toBeNull();
  });

  it("reports contract channels for H_STALE", () => {
    expect(channelsForClaimant("H:stale")).toEqual([
      "border",
      "caption-row",
      "accent-slot",
      "motion-channel",
    ]);
  });

  it("reports contract channels for E_PR_DELTA", () => {
    expect(channelsForClaimant("E:pr-delta")).toEqual([
      "border",
      "caption-row",
      "badge-cluster",
    ]);
  });
});
