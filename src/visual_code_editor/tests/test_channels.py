import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.channels import (
    CHANNEL_PRECEDENCE,
    ChannelClaimant,
    VisualChannel,
    channel_claimant_from_string,
    channels_for_claimant,
    claimants_for_channel,
    precedence_of,
    visual_channel_from_string,
    winner,
)


CONTRACT_CHANNELS = (
    ("BORDER", "border"),
    ("CAPTION_ROW", "caption-row"),
    ("BADGE_CLUSTER", "badge-cluster"),
    ("CHEVRON_SLOT", "chevron-slot"),
    ("ACCENT_SLOT", "accent-slot"),
    ("MOTION_CHANNEL", "motion-channel"),
)

CONTRACT_CLAIMANTS = (
    ("L_ZOOM_LABEL", "L:zoom-label"),
    ("B_SELECTION", "B:selection"),
    ("E_PR_DELTA", "E:pr-delta"),
    ("K_ACTIVE_TASK", "K:active-task"),
    ("F_SLICE_MATCH", "F:slice-match"),
    ("H_STALE", "H:stale"),
    ("G_TEST_OVERLAY", "G:test-overlay"),
    ("G_DEPLOY_OVERLAY", "G:deploy-overlay"),
    ("G_PROFILE_OVERLAY", "G:profile-overlay"),
    ("D_CHANGE_ORIGIN", "D:change-origin"),
    ("H2_FREEZE_PENDING", "H2:freeze-pending"),
    ("H3_LIFECYCLE", "H3:lifecycle"),
    ("I_PROVIDER_HEALTH", "I:provider-health"),
    ("A_BEHAVIOR_CHIP", "A:behavior-chip"),
)

CONTRACT_CHANNEL_VALUES = tuple(value for _, value in CONTRACT_CHANNELS)
CONTRACT_CLAIMANT_VALUES = tuple(value for _, value in CONTRACT_CLAIMANTS)


def _channel(member_name: str) -> VisualChannel:
    return getattr(VisualChannel, member_name)


def _claimant(member_name: str) -> ChannelClaimant:
    return getattr(ChannelClaimant, member_name)


CONTRACT_PRECEDENCE_BY_NAME = {
    "BORDER": (
        "E_PR_DELTA",
        "B_SELECTION",
        "K_ACTIVE_TASK",
        "F_SLICE_MATCH",
        "H_STALE",
        "D_CHANGE_ORIGIN",
    ),
    "CAPTION_ROW": (
        "H_STALE",
        "K_ACTIVE_TASK",
        "E_PR_DELTA",
        "D_CHANGE_ORIGIN",
        "G_TEST_OVERLAY",
        "G_DEPLOY_OVERLAY",
        "A_BEHAVIOR_CHIP",
    ),
    "BADGE_CLUSTER": (
        "H2_FREEZE_PENDING",
        "E_PR_DELTA",
        "G_TEST_OVERLAY",
        "H3_LIFECYCLE",
        "I_PROVIDER_HEALTH",
        "D_CHANGE_ORIGIN",
    ),
    "CHEVRON_SLOT": ("L_ZOOM_LABEL",),
    "ACCENT_SLOT": (
        "H_STALE",
        "K_ACTIVE_TASK",
        "G_PROFILE_OVERLAY",
    ),
    "MOTION_CHANNEL": (
        "H2_FREEZE_PENDING",
        "K_ACTIVE_TASK",
        "G_PROFILE_OVERLAY",
        "H_STALE",
    ),
}

CONTRACT_PRECEDENCE = {
    _channel(channel_name): tuple(_claimant(claimant_name) for claimant_name in claimant_names)
    for channel_name, claimant_names in CONTRACT_PRECEDENCE_BY_NAME.items()
}


@pytest.mark.parametrize(("member_name", "channel_value"), CONTRACT_CHANNELS)
def test_visual_channel_enum_contains_each_contract_member(member_name, channel_value):
    assert hasattr(VisualChannel, member_name), (
        f"Enum membership invariant violated: VisualChannel is missing {member_name}"
    )
    assert getattr(VisualChannel, member_name).value == channel_value, (
        f"Stability invariant violated: VisualChannel.{member_name}.value must be "
        f"{channel_value!r}"
    )


@pytest.mark.parametrize(("member_name", "claimant_value"), CONTRACT_CLAIMANTS)
def test_channel_claimant_enum_contains_each_contract_member(member_name, claimant_value):
    assert hasattr(ChannelClaimant, member_name), (
        f"Enum membership invariant violated: ChannelClaimant is missing {member_name}"
    )
    assert getattr(ChannelClaimant, member_name).value == claimant_value, (
        f"Stability invariant violated: ChannelClaimant.{member_name}.value must be "
        f"{claimant_value!r}"
    )


def test_visual_channel_enum_contains_exactly_the_contract_members():
    assert len(VisualChannel) == 6, (
        "Enum membership invariant violated: VisualChannel must expose 6 channels"
    )
    assert tuple(channel.value for channel in VisualChannel) == CONTRACT_CHANNEL_VALUES, (
        "Enum membership invariant violated: VisualChannel must contain exactly the "
        "contract channels"
    )


def test_channel_claimant_enum_contains_exactly_the_contract_members():
    assert len(ChannelClaimant) == 14, (
        "Enum membership invariant violated: ChannelClaimant must expose 14 claimants"
    )
    assert tuple(claimant.value for claimant in ChannelClaimant) == CONTRACT_CLAIMANT_VALUES, (
        "Enum membership invariant violated: ChannelClaimant must contain exactly the "
        "contract claimants"
    )


@pytest.mark.parametrize(("member_name", "channel_value"), CONTRACT_CHANNELS)
def test_visual_channel_from_string_accepts_every_contract_value(member_name, channel_value):
    assert visual_channel_from_string(channel_value) is getattr(VisualChannel, member_name), (
        "visual_channel_from_string strictness invariant violated: "
        f"{channel_value!r} must parse to VisualChannel.{member_name}"
    )


@pytest.mark.parametrize(("member_name", "claimant_value"), CONTRACT_CLAIMANTS)
def test_channel_claimant_from_string_accepts_every_contract_value(
    member_name,
    claimant_value,
):
    assert channel_claimant_from_string(claimant_value) is getattr(
        ChannelClaimant, member_name
    ), (
        "channel_claimant_from_string strictness invariant violated: "
        f"{claimant_value!r} must parse to ChannelClaimant.{member_name}"
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "Border",
        "caption_row",
        "badge",
        "BORDER",
        "motion-channel ",
    ),
)
def test_visual_channel_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        visual_channel_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "B:selection ",
        "selection",
        "G:trace-overlay",
        "L_ZOOM_LABEL",
        "H4:lifecycle",
    ),
)
def test_channel_claimant_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        channel_claimant_from_string(invalid_value)


def test_channel_precedence_contains_exactly_the_contract_channels():
    assert set(CHANNEL_PRECEDENCE) == set(CONTRACT_PRECEDENCE), (
        "Precedence completeness invariant violated: CHANNEL_PRECEDENCE must contain "
        "exactly the six contract channels"
    )


@pytest.mark.parametrize("channel_name", tuple(CONTRACT_PRECEDENCE_BY_NAME))
def test_channel_precedence_covers_exactly_the_contract_claimants(channel_name):
    channel = _channel(channel_name)

    assert set(CHANNEL_PRECEDENCE[channel]) == set(CONTRACT_PRECEDENCE[channel]), (
        "Precedence completeness invariant violated: "
        f"{channel.value!r} must contain no extra or omitted claimants"
    )


@pytest.mark.parametrize("channel_name", tuple(CONTRACT_PRECEDENCE_BY_NAME))
def test_claimants_for_channel_order_matches_contract(channel_name):
    channel = _channel(channel_name)

    assert claimants_for_channel(channel) == CONTRACT_PRECEDENCE[channel], (
        "Per-channel ordering invariant violated: "
        f"{channel.value!r} precedence must match the contract order exactly"
    )


@pytest.mark.parametrize("channel_name", tuple(CONTRACT_PRECEDENCE_BY_NAME))
def test_channel_precedence_order_matches_contract(channel_name):
    channel = _channel(channel_name)

    assert CHANNEL_PRECEDENCE[channel] == CONTRACT_PRECEDENCE[channel], (
        "Per-channel ordering invariant violated: CHANNEL_PRECEDENCE "
        f"{channel.value!r} tuple must match the contract order exactly"
    )


@pytest.mark.parametrize("channel_name", tuple(CONTRACT_PRECEDENCE_BY_NAME))
def test_precedence_of_returns_contract_index_for_registered_pairs(channel_name):
    channel = _channel(channel_name)

    for expected_index, claimant in enumerate(CONTRACT_PRECEDENCE[channel]):
        assert precedence_of(channel, claimant) == expected_index, (
            "precedence_of invariant violated: "
            f"{claimant.value!r} on {channel.value!r} must have index {expected_index}"
        )


@pytest.mark.parametrize(
    ("channel", "claimant"),
    (
        (_channel("CHEVRON_SLOT"), _claimant("B_SELECTION")),
        (_channel("BORDER"), _claimant("L_ZOOM_LABEL")),
        (_channel("ACCENT_SLOT"), _claimant("E_PR_DELTA")),
    ),
)
def test_precedence_of_raises_for_unregistered_pairs(channel, claimant):
    with pytest.raises(ValueError):
        precedence_of(channel, claimant)


def test_winner_returns_highest_priority_claimant_from_supplied_claimants():
    assert winner(
        _channel("BORDER"),
        (
            _claimant("D_CHANGE_ORIGIN"),
            _claimant("B_SELECTION"),
            _claimant("H_STALE"),
        ),
    ) is _claimant("B_SELECTION")
    assert winner(
        _channel("CAPTION_ROW"),
        (
            _claimant("G_DEPLOY_OVERLAY"),
            _claimant("E_PR_DELTA"),
            _claimant("H_STALE"),
        ),
    ) is _claimant("H_STALE")
    assert winner(
        _channel("MOTION_CHANNEL"),
        (
            _claimant("H_STALE"),
            _claimant("K_ACTIVE_TASK"),
            _claimant("G_PROFILE_OVERLAY"),
        ),
    ) is _claimant("K_ACTIVE_TASK")


def test_winner_returns_none_for_empty_iterable():
    assert winner(_channel("BORDER"), ()) is None


def test_winner_returns_none_when_no_supplied_claimants_are_registered_for_channel():
    assert winner(
        _channel("CHEVRON_SLOT"),
        (
            _claimant("B_SELECTION"),
            _claimant("E_PR_DELTA"),
            _claimant("K_ACTIVE_TASK"),
        ),
    ) is None


@pytest.mark.parametrize(
    ("claimant", "expected_channels"),
    (
        (
            _claimant("H_STALE"),
            (
                _channel("BORDER"),
                _channel("CAPTION_ROW"),
                _channel("ACCENT_SLOT"),
                _channel("MOTION_CHANNEL"),
            ),
        ),
        (
            _claimant("E_PR_DELTA"),
            (
                _channel("BORDER"),
                _channel("CAPTION_ROW"),
                _channel("BADGE_CLUSTER"),
            ),
        ),
    ),
)
def test_channels_for_claimant_reports_contract_channels(claimant, expected_channels):
    assert channels_for_claimant(claimant) == expected_channels, (
        "channels_for_claimant invariant violated: "
        f"{claimant.value!r} must participate in the contract channels in deterministic order"
    )
