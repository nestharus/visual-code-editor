"""Canonical visual-channel precedence registry.

New visual channels, claimants, and precedence orderings must be added through
proposal cycles, not ad hoc.
"""

from enum import Enum
from typing import Iterable


class VisualChannel(str, Enum):
    BORDER = "border"
    CAPTION_ROW = "caption-row"
    BADGE_CLUSTER = "badge-cluster"
    CHEVRON_SLOT = "chevron-slot"
    ACCENT_SLOT = "accent-slot"
    MOTION_CHANNEL = "motion-channel"


class ChannelClaimant(str, Enum):
    L_ZOOM_LABEL = "L:zoom-label"
    B_SELECTION = "B:selection"
    E_PR_DELTA = "E:pr-delta"
    K_ACTIVE_TASK = "K:active-task"
    F_SLICE_MATCH = "F:slice-match"
    H_STALE = "H:stale"
    G_TEST_OVERLAY = "G:test-overlay"
    G_DEPLOY_OVERLAY = "G:deploy-overlay"
    G_PROFILE_OVERLAY = "G:profile-overlay"
    D_CHANGE_ORIGIN = "D:change-origin"
    H2_FREEZE_PENDING = "H2:freeze-pending"
    H3_LIFECYCLE = "H3:lifecycle"
    I_PROVIDER_HEALTH = "I:provider-health"
    A_BEHAVIOR_CHIP = "A:behavior-chip"


CHANNEL_PRECEDENCE: dict[VisualChannel, tuple[ChannelClaimant, ...]] = {
    VisualChannel.BORDER: (
        ChannelClaimant.E_PR_DELTA,
        ChannelClaimant.B_SELECTION,
        ChannelClaimant.K_ACTIVE_TASK,
        ChannelClaimant.F_SLICE_MATCH,
        ChannelClaimant.H_STALE,
        ChannelClaimant.D_CHANGE_ORIGIN,
    ),
    VisualChannel.CAPTION_ROW: (
        ChannelClaimant.H_STALE,
        ChannelClaimant.K_ACTIVE_TASK,
        ChannelClaimant.E_PR_DELTA,
        ChannelClaimant.D_CHANGE_ORIGIN,
        ChannelClaimant.G_TEST_OVERLAY,
        ChannelClaimant.G_DEPLOY_OVERLAY,
        ChannelClaimant.A_BEHAVIOR_CHIP,
    ),
    VisualChannel.BADGE_CLUSTER: (
        ChannelClaimant.H2_FREEZE_PENDING,
        ChannelClaimant.E_PR_DELTA,
        ChannelClaimant.G_TEST_OVERLAY,
        ChannelClaimant.H3_LIFECYCLE,
        ChannelClaimant.I_PROVIDER_HEALTH,
        ChannelClaimant.D_CHANGE_ORIGIN,
    ),
    VisualChannel.CHEVRON_SLOT: (ChannelClaimant.L_ZOOM_LABEL,),
    VisualChannel.ACCENT_SLOT: (
        ChannelClaimant.H_STALE,
        ChannelClaimant.K_ACTIVE_TASK,
        ChannelClaimant.G_PROFILE_OVERLAY,
    ),
    VisualChannel.MOTION_CHANNEL: (
        ChannelClaimant.H2_FREEZE_PENDING,
        ChannelClaimant.K_ACTIVE_TASK,
        ChannelClaimant.G_PROFILE_OVERLAY,
        ChannelClaimant.H_STALE,
    ),
}


def visual_channel_from_string(value: str) -> VisualChannel:
    try:
        return VisualChannel(value)
    except ValueError as exc:
        raise ValueError(f"Unknown visual channel: {value}") from exc


def channel_claimant_from_string(value: str) -> ChannelClaimant:
    try:
        return ChannelClaimant(value)
    except ValueError as exc:
        raise ValueError(f"Unknown channel claimant: {value}") from exc


def precedence_of(channel: VisualChannel, claimant: ChannelClaimant) -> int:
    try:
        return CHANNEL_PRECEDENCE[channel].index(claimant)
    except ValueError as exc:
        raise ValueError(
            f"Channel claimant {claimant.value!r} is not registered for "
            f"visual channel {channel.value!r}"
        ) from exc


def winner(
    channel: VisualChannel,
    claimants: Iterable[ChannelClaimant],
) -> ChannelClaimant | None:
    supplied_claimants = set(claimants)
    if not supplied_claimants:
        return None

    for claimant in CHANNEL_PRECEDENCE[channel]:
        if claimant in supplied_claimants:
            return claimant

    return None


def claimants_for_channel(channel: VisualChannel) -> tuple[ChannelClaimant, ...]:
    return CHANNEL_PRECEDENCE[channel]


def channels_for_claimant(claimant: ChannelClaimant) -> tuple[VisualChannel, ...]:
    return tuple(
        channel
        for channel, claimants in CHANNEL_PRECEDENCE.items()
        if claimant in claimants
    )
