/**
 * Canonical visual-channel precedence registry.
 *
 * New visual channels, claimants, and precedence orderings must be added through
 * proposal cycles, not ad hoc.
 */

export const ALL_VISUAL_CHANNELS = [
  "border",
  "caption-row",
  "badge-cluster",
  "chevron-slot",
  "accent-slot",
  "motion-channel",
] as const;

export type VisualChannel = (typeof ALL_VISUAL_CHANNELS)[number];

export const ALL_CHANNEL_CLAIMANTS = [
  "L:zoom-label",
  "B:selection",
  "E:pr-delta",
  "K:active-task",
  "F:slice-match",
  "H:stale",
  "G:test-overlay",
  "G:deploy-overlay",
  "G:profile-overlay",
  "D:change-origin",
  "H2:freeze-pending",
  "H3:lifecycle",
  "I:provider-health",
  "A:behavior-chip",
] as const;

export type ChannelClaimant = (typeof ALL_CHANNEL_CLAIMANTS)[number];

export const CHANNEL_PRECEDENCE: Readonly<
  Record<VisualChannel, readonly ChannelClaimant[]>
> = {
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
} as const;

const VISUAL_CHANNEL_SET: ReadonlySet<string> = new Set(ALL_VISUAL_CHANNELS);
const CHANNEL_CLAIMANT_SET: ReadonlySet<string> = new Set(ALL_CHANNEL_CLAIMANTS);

export function visualChannelFromString(value: string): VisualChannel {
  if (VISUAL_CHANNEL_SET.has(value)) {
    return value as VisualChannel;
  }

  throw new Error(`Unknown visual channel: ${value}`);
}

export function channelClaimantFromString(value: string): ChannelClaimant {
  if (CHANNEL_CLAIMANT_SET.has(value)) {
    return value as ChannelClaimant;
  }

  throw new Error(`Unknown channel claimant: ${value}`);
}

export function precedenceOf(channel: VisualChannel, claimant: ChannelClaimant): number {
  const precedenceIndex = CHANNEL_PRECEDENCE[channel].indexOf(claimant);

  if (precedenceIndex >= 0) {
    return precedenceIndex;
  }

  throw new Error(
    `Channel claimant ${claimant} is not registered for visual channel ${channel}`,
  );
}

export function winner(
  channel: VisualChannel,
  claimants: readonly ChannelClaimant[],
): ChannelClaimant | null {
  const suppliedClaimants = new Set(claimants);
  if (suppliedClaimants.size === 0) {
    return null;
  }

  for (const claimant of CHANNEL_PRECEDENCE[channel]) {
    if (suppliedClaimants.has(claimant)) {
      return claimant;
    }
  }

  return null;
}

export function claimantsForChannel(channel: VisualChannel): readonly ChannelClaimant[] {
  return CHANNEL_PRECEDENCE[channel];
}

export function channelsForClaimant(claimant: ChannelClaimant): readonly VisualChannel[] {
  return ALL_VISUAL_CHANNELS.filter((channel) =>
    CHANNEL_PRECEDENCE[channel].includes(claimant),
  );
}
