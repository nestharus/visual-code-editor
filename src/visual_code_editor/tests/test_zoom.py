import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.channels import VisualChannel
from visual_code_editor.model.zoom import (
    CHANNEL_BUDGET_CAPS,
    EDGE_BUNDLING,
    HIT_TEST,
    LABEL_VISIBILITY,
    EdgeBundlingRule,
    HitTestPrecision,
    LabelTarget,
    LabelVisibility,
    OverflowMode,
    ZoomBand,
    channel_budget_cap,
    edge_bundling,
    hit_test_precision,
    label_target_from_string,
    label_visibility,
    label_visibility_from_string,
    overflow_mode_from_string,
    zoom_band_for_factor,
    zoom_band_from_string,
)


CONTRACT_ZOOM_BANDS = (
    ("OVERVIEW", "overview"),
    ("STRUCTURE", "structure"),
    ("DETAIL", "detail"),
    ("INSPECT", "inspect"),
    ("SOURCE", "source"),
)

CONTRACT_LABEL_VISIBILITIES = (
    ("HIDDEN", "hidden"),
    ("HOVER_ONLY", "hover-only"),
    ("ABBREVIATED", "abbreviated"),
    ("FULL", "full"),
)

CONTRACT_OVERFLOW_MODES = (
    ("COLLAPSE_TO_PLUS_N", "collapse-to-plus-n"),
    ("HIGHEST_ONLY", "highest-only"),
    ("HIDE_ALL", "hide-all"),
)

CONTRACT_LABEL_TARGETS = (
    ("CONTAINER_HEADER", "container-header"),
    ("NODE_LABEL", "node-label"),
    ("EDGE_LABEL", "edge-label"),
    ("EDGE_ARTIFACT_CHIPS", "edge-artifact-chips"),
    ("BEHAVIOUR_CARD_SLICE", "behaviour-card-slice"),
)

CONTRACT_ZOOM_BAND_VALUES = tuple(value for _, value in CONTRACT_ZOOM_BANDS)
CONTRACT_LABEL_VISIBILITY_VALUES = tuple(value for _, value in CONTRACT_LABEL_VISIBILITIES)
CONTRACT_OVERFLOW_MODE_VALUES = tuple(value for _, value in CONTRACT_OVERFLOW_MODES)
CONTRACT_LABEL_TARGET_VALUES = tuple(value for _, value in CONTRACT_LABEL_TARGETS)


def _band(member_name: str) -> ZoomBand:
    return getattr(ZoomBand, member_name)


def _visibility(member_name: str) -> LabelVisibility:
    return getattr(LabelVisibility, member_name)


def _overflow(member_name: str) -> OverflowMode:
    return getattr(OverflowMode, member_name)


def _target(member_name: str) -> LabelTarget:
    return getattr(LabelTarget, member_name)


def _channel(member_name: str) -> VisualChannel:
    return getattr(VisualChannel, member_name)


CONTRACT_LABEL_VISIBILITY = {
    ("OVERVIEW", "CONTAINER_HEADER"): "ABBREVIATED",
    ("OVERVIEW", "NODE_LABEL"): "HIDDEN",
    ("OVERVIEW", "EDGE_LABEL"): "HIDDEN",
    ("OVERVIEW", "EDGE_ARTIFACT_CHIPS"): "HIDDEN",
    ("OVERVIEW", "BEHAVIOUR_CARD_SLICE"): "HIDDEN",
    ("STRUCTURE", "CONTAINER_HEADER"): "FULL",
    ("STRUCTURE", "NODE_LABEL"): "HOVER_ONLY",
    ("STRUCTURE", "EDGE_LABEL"): "HIDDEN",
    ("STRUCTURE", "EDGE_ARTIFACT_CHIPS"): "HIDDEN",
    ("STRUCTURE", "BEHAVIOUR_CARD_SLICE"): "HIDDEN",
    ("DETAIL", "CONTAINER_HEADER"): "FULL",
    ("DETAIL", "NODE_LABEL"): "FULL",
    ("DETAIL", "EDGE_LABEL"): "HOVER_ONLY",
    ("DETAIL", "EDGE_ARTIFACT_CHIPS"): "HIDDEN",
    ("DETAIL", "BEHAVIOUR_CARD_SLICE"): "HIDDEN",
    ("INSPECT", "CONTAINER_HEADER"): "FULL",
    ("INSPECT", "NODE_LABEL"): "FULL",
    ("INSPECT", "EDGE_LABEL"): "FULL",
    ("INSPECT", "EDGE_ARTIFACT_CHIPS"): "FULL",
    ("INSPECT", "BEHAVIOUR_CARD_SLICE"): "HOVER_ONLY",
    ("SOURCE", "CONTAINER_HEADER"): "FULL",
    ("SOURCE", "NODE_LABEL"): "FULL",
    ("SOURCE", "EDGE_LABEL"): "FULL",
    ("SOURCE", "EDGE_ARTIFACT_CHIPS"): "FULL",
    ("SOURCE", "BEHAVIOUR_CARD_SLICE"): "FULL",
}

CONTRACT_CHANNEL_BUDGET_CAPS = {
    ("OVERVIEW", "BORDER"): (1, "HIGHEST_ONLY"),
    ("OVERVIEW", "CAPTION_ROW"): (0, "HIDE_ALL"),
    ("OVERVIEW", "BADGE_CLUSTER"): (0, "HIDE_ALL"),
    ("OVERVIEW", "CHEVRON_SLOT"): (0, "HIDE_ALL"),
    ("OVERVIEW", "ACCENT_SLOT"): (1, "HIGHEST_ONLY"),
    ("OVERVIEW", "MOTION_CHANNEL"): (1, "HIGHEST_ONLY"),
    ("STRUCTURE", "BORDER"): (2, "HIGHEST_ONLY"),
    ("STRUCTURE", "CAPTION_ROW"): (0, "HIDE_ALL"),
    ("STRUCTURE", "BADGE_CLUSTER"): (1, "HIGHEST_ONLY"),
    ("STRUCTURE", "CHEVRON_SLOT"): (1, "HIGHEST_ONLY"),
    ("STRUCTURE", "ACCENT_SLOT"): (1, "HIGHEST_ONLY"),
    ("STRUCTURE", "MOTION_CHANNEL"): (1, "HIGHEST_ONLY"),
    ("DETAIL", "BORDER"): (3, "COLLAPSE_TO_PLUS_N"),
    ("DETAIL", "CAPTION_ROW"): (1, "COLLAPSE_TO_PLUS_N"),
    ("DETAIL", "BADGE_CLUSTER"): (2, "COLLAPSE_TO_PLUS_N"),
    ("DETAIL", "CHEVRON_SLOT"): (1, "HIGHEST_ONLY"),
    ("DETAIL", "ACCENT_SLOT"): (1, "HIGHEST_ONLY"),
    ("DETAIL", "MOTION_CHANNEL"): (1, "HIGHEST_ONLY"),
    ("INSPECT", "BORDER"): (5, "COLLAPSE_TO_PLUS_N"),
    ("INSPECT", "CAPTION_ROW"): (2, "COLLAPSE_TO_PLUS_N"),
    ("INSPECT", "BADGE_CLUSTER"): (3, "COLLAPSE_TO_PLUS_N"),
    ("INSPECT", "CHEVRON_SLOT"): (1, "HIGHEST_ONLY"),
    ("INSPECT", "ACCENT_SLOT"): (1, "HIGHEST_ONLY"),
    ("INSPECT", "MOTION_CHANNEL"): (2, "COLLAPSE_TO_PLUS_N"),
    ("SOURCE", "BORDER"): (5, "COLLAPSE_TO_PLUS_N"),
    ("SOURCE", "CAPTION_ROW"): (3, "COLLAPSE_TO_PLUS_N"),
    ("SOURCE", "BADGE_CLUSTER"): (5, "COLLAPSE_TO_PLUS_N"),
    ("SOURCE", "CHEVRON_SLOT"): (1, "HIGHEST_ONLY"),
    ("SOURCE", "ACCENT_SLOT"): (1, "HIGHEST_ONLY"),
    ("SOURCE", "MOTION_CHANNEL"): (3, "COLLAPSE_TO_PLUS_N"),
}

CONTRACT_EDGE_BUNDLING = {
    "OVERVIEW": (2, True),
    "STRUCTURE": (3, True),
    "DETAIL": (5, True),
    "INSPECT": (8, False),
    "SOURCE": (999, False),
}

CONTRACT_HIT_TEST = {
    "OVERVIEW": (12, 4),
    "STRUCTURE": (10, 4),
    "DETAIL": (8, 6),
    "INSPECT": (6, 8),
    "SOURCE": (4, 8),
}


@pytest.mark.parametrize(("member_name", "band_value"), CONTRACT_ZOOM_BANDS)
def test_zoom_band_enum_contains_each_contract_member(member_name, band_value):
    assert hasattr(ZoomBand, member_name), (
        f"Enum membership invariant violated: ZoomBand is missing {member_name}"
    )
    assert getattr(ZoomBand, member_name).value == band_value, (
        f"String stability invariant violated: ZoomBand.{member_name}.value must be "
        f"{band_value!r}"
    )


@pytest.mark.parametrize(("member_name", "visibility_value"), CONTRACT_LABEL_VISIBILITIES)
def test_label_visibility_enum_contains_each_contract_member(
    member_name,
    visibility_value,
):
    assert hasattr(LabelVisibility, member_name), (
        f"Enum membership invariant violated: LabelVisibility is missing {member_name}"
    )
    assert getattr(LabelVisibility, member_name).value == visibility_value, (
        "String stability invariant violated: "
        f"LabelVisibility.{member_name}.value must be {visibility_value!r}"
    )


@pytest.mark.parametrize(("member_name", "mode_value"), CONTRACT_OVERFLOW_MODES)
def test_overflow_mode_enum_contains_each_contract_member(member_name, mode_value):
    assert hasattr(OverflowMode, member_name), (
        f"Enum membership invariant violated: OverflowMode is missing {member_name}"
    )
    assert getattr(OverflowMode, member_name).value == mode_value, (
        f"String stability invariant violated: OverflowMode.{member_name}.value must be "
        f"{mode_value!r}"
    )


@pytest.mark.parametrize(("member_name", "target_value"), CONTRACT_LABEL_TARGETS)
def test_label_target_enum_contains_each_contract_member(member_name, target_value):
    assert hasattr(LabelTarget, member_name), (
        f"Enum membership invariant violated: LabelTarget is missing {member_name}"
    )
    assert getattr(LabelTarget, member_name).value == target_value, (
        f"String stability invariant violated: LabelTarget.{member_name}.value must be "
        f"{target_value!r}"
    )


def test_zoom_enums_contain_exactly_the_contract_members():
    assert len(ZoomBand) == 5
    assert tuple(band.value for band in ZoomBand) == CONTRACT_ZOOM_BAND_VALUES

    assert len(LabelVisibility) == 4
    assert tuple(visibility.value for visibility in LabelVisibility) == (
        CONTRACT_LABEL_VISIBILITY_VALUES
    )

    assert len(OverflowMode) == 3
    assert tuple(mode.value for mode in OverflowMode) == CONTRACT_OVERFLOW_MODE_VALUES

    assert len(LabelTarget) == 5
    assert tuple(target.value for target in LabelTarget) == CONTRACT_LABEL_TARGET_VALUES


@pytest.mark.parametrize(("member_name", "band_value"), CONTRACT_ZOOM_BANDS)
def test_zoom_band_from_string_accepts_every_contract_value(member_name, band_value):
    assert zoom_band_from_string(band_value) is getattr(ZoomBand, member_name)


@pytest.mark.parametrize(("member_name", "visibility_value"), CONTRACT_LABEL_VISIBILITIES)
def test_label_visibility_from_string_accepts_every_contract_value(
    member_name,
    visibility_value,
):
    assert label_visibility_from_string(visibility_value) is getattr(
        LabelVisibility,
        member_name,
    )


@pytest.mark.parametrize(("member_name", "mode_value"), CONTRACT_OVERFLOW_MODES)
def test_overflow_mode_from_string_accepts_every_contract_value(member_name, mode_value):
    assert overflow_mode_from_string(mode_value) is getattr(OverflowMode, member_name)


@pytest.mark.parametrize(("member_name", "target_value"), CONTRACT_LABEL_TARGETS)
def test_label_target_from_string_accepts_every_contract_value(member_name, target_value):
    assert label_target_from_string(target_value) is getattr(LabelTarget, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "overview ", "OVERVIEW", "detailish", "source-plus"),
)
def test_zoom_band_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        zoom_band_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "hover_only", "HIDDEN", "visible", "full "),
)
def test_label_visibility_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        label_visibility_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "collapse_to_plus_n", "HIGHEST_ONLY", "show-all", "hide-all "),
)
def test_overflow_mode_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        overflow_mode_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "container_header", "NODE_LABEL", "card-slice", "node-label "),
)
def test_label_target_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        label_target_from_string(invalid_value)


@pytest.mark.parametrize(
    ("factor", "expected_band_name"),
    (
        (0.0, "OVERVIEW"),
        (0.399, "OVERVIEW"),
        (0.4, "STRUCTURE"),
        (0.799, "STRUCTURE"),
        (0.8, "DETAIL"),
        (1.399, "DETAIL"),
        (1.4, "INSPECT"),
        (2.499, "INSPECT"),
        (2.5, "SOURCE"),
        (8.0, "SOURCE"),
    ),
)
def test_zoom_band_for_factor_maps_contract_boundaries(factor, expected_band_name):
    assert zoom_band_for_factor(factor) is _band(expected_band_name)


@pytest.mark.parametrize("invalid_factor", (-0.001, -1.0, 8.001, 9.0))
def test_zoom_band_for_factor_rejects_out_of_contract_range(invalid_factor):
    with pytest.raises(ValueError):
        zoom_band_for_factor(invalid_factor)


def test_label_visibility_table_contains_exactly_contract_entries():
    expected_keys = {
        (_band(band_name), _target(target_name))
        for band_name, target_name in CONTRACT_LABEL_VISIBILITY
    }
    assert set(LABEL_VISIBILITY) == expected_keys


@pytest.mark.parametrize(
    ("band_name", "target_name", "expected_visibility_name"),
    (
        (band_name, target_name, expected_visibility_name)
        for (band_name, target_name), expected_visibility_name in (
            CONTRACT_LABEL_VISIBILITY.items()
        )
    ),
)
def test_label_visibility_table_matches_contract(
    band_name,
    target_name,
    expected_visibility_name,
):
    band = _band(band_name)
    target = _target(target_name)
    expected_visibility = _visibility(expected_visibility_name)

    assert LABEL_VISIBILITY[(band, target)] is expected_visibility
    assert label_visibility(band, target) is expected_visibility


def test_channel_budget_cap_table_contains_exactly_contract_entries():
    expected_keys = {
        (_band(band_name), _channel(channel_name))
        for band_name, channel_name in CONTRACT_CHANNEL_BUDGET_CAPS
    }
    assert set(CHANNEL_BUDGET_CAPS) == expected_keys


@pytest.mark.parametrize(
    ("band_name", "channel_name", "expected_max_visible", "expected_overflow_name"),
    (
        (band_name, channel_name, max_visible, overflow_name)
        for (band_name, channel_name), (max_visible, overflow_name) in (
            CONTRACT_CHANNEL_BUDGET_CAPS.items()
        )
    ),
)
def test_channel_budget_cap_table_matches_contract(
    band_name,
    channel_name,
    expected_max_visible,
    expected_overflow_name,
):
    band = _band(band_name)
    channel = _channel(channel_name)
    cap = channel_budget_cap(band, channel)

    assert CHANNEL_BUDGET_CAPS[(band, channel)] == cap
    assert cap.zoom_band is band
    assert cap.channel is channel
    assert cap.max_visible_claimants == expected_max_visible
    assert cap.max_visible_claimants >= 0
    assert cap.overflow_mode is _overflow(expected_overflow_name)


def test_edge_bundling_table_contains_exactly_contract_entries():
    expected_keys = {_band(band_name) for band_name in CONTRACT_EDGE_BUNDLING}
    assert set(EDGE_BUNDLING) == expected_keys


@pytest.mark.parametrize(
    ("band_name", "expected_threshold", "expected_active"),
    (
        (band_name, threshold, active)
        for band_name, (threshold, active) in CONTRACT_EDGE_BUNDLING.items()
    ),
)
def test_edge_bundling_table_matches_contract(
    band_name,
    expected_threshold,
    expected_active,
):
    band = _band(band_name)
    rule = edge_bundling(band)

    assert EDGE_BUNDLING[band] == rule
    assert isinstance(rule, EdgeBundlingRule)
    assert rule.zoom_band is band
    assert rule.bundle_threshold == expected_threshold
    assert rule.bundling_active is expected_active


def test_hit_test_table_contains_exactly_contract_entries():
    expected_keys = {_band(band_name) for band_name in CONTRACT_HIT_TEST}
    assert set(HIT_TEST) == expected_keys


@pytest.mark.parametrize(
    ("band_name", "expected_edge_radius", "expected_label_padding"),
    (
        (band_name, edge_radius, label_padding)
        for band_name, (edge_radius, label_padding) in CONTRACT_HIT_TEST.items()
    ),
)
def test_hit_test_precision_table_matches_contract(
    band_name,
    expected_edge_radius,
    expected_label_padding,
):
    band = _band(band_name)
    precision = hit_test_precision(band)

    assert HIT_TEST[band] == precision
    assert isinstance(precision, HitTestPrecision)
    assert precision.zoom_band is band
    assert precision.edge_hit_radius_px == expected_edge_radius
    assert precision.node_label_hit_padding_px == expected_label_padding
