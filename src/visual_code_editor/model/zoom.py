"""Canonical zoom-level projection rules."""

from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType
from typing import Mapping

from visual_code_editor.model.channels import VisualChannel


class ZoomBand(str, Enum):
    OVERVIEW = "overview"
    STRUCTURE = "structure"
    DETAIL = "detail"
    INSPECT = "inspect"
    SOURCE = "source"


class LabelVisibility(str, Enum):
    HIDDEN = "hidden"
    HOVER_ONLY = "hover-only"
    ABBREVIATED = "abbreviated"
    FULL = "full"


class OverflowMode(str, Enum):
    COLLAPSE_TO_PLUS_N = "collapse-to-plus-n"
    HIGHEST_ONLY = "highest-only"
    HIDE_ALL = "hide-all"


class LabelTarget(str, Enum):
    CONTAINER_HEADER = "container-header"
    NODE_LABEL = "node-label"
    EDGE_LABEL = "edge-label"
    EDGE_ARTIFACT_CHIPS = "edge-artifact-chips"
    BEHAVIOUR_CARD_SLICE = "behaviour-card-slice"


@dataclass(frozen=True)
class ChannelBudgetCap:
    zoom_band: ZoomBand
    channel: VisualChannel
    max_visible_claimants: int
    overflow_mode: OverflowMode


@dataclass(frozen=True)
class EdgeBundlingRule:
    zoom_band: ZoomBand
    bundle_threshold: int
    bundling_active: bool


@dataclass(frozen=True)
class HitTestPrecision:
    zoom_band: ZoomBand
    edge_hit_radius_px: int
    node_label_hit_padding_px: int


LABEL_VISIBILITY: Mapping[tuple[ZoomBand, LabelTarget], LabelVisibility] = (
    MappingProxyType(
        {
            (ZoomBand.OVERVIEW, LabelTarget.CONTAINER_HEADER): (
                LabelVisibility.ABBREVIATED
            ),
            (ZoomBand.OVERVIEW, LabelTarget.NODE_LABEL): LabelVisibility.HIDDEN,
            (ZoomBand.OVERVIEW, LabelTarget.EDGE_LABEL): LabelVisibility.HIDDEN,
            (ZoomBand.OVERVIEW, LabelTarget.EDGE_ARTIFACT_CHIPS): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.OVERVIEW, LabelTarget.BEHAVIOUR_CARD_SLICE): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.STRUCTURE, LabelTarget.CONTAINER_HEADER): LabelVisibility.FULL,
            (ZoomBand.STRUCTURE, LabelTarget.NODE_LABEL): (
                LabelVisibility.HOVER_ONLY
            ),
            (ZoomBand.STRUCTURE, LabelTarget.EDGE_LABEL): LabelVisibility.HIDDEN,
            (ZoomBand.STRUCTURE, LabelTarget.EDGE_ARTIFACT_CHIPS): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.STRUCTURE, LabelTarget.BEHAVIOUR_CARD_SLICE): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.DETAIL, LabelTarget.CONTAINER_HEADER): LabelVisibility.FULL,
            (ZoomBand.DETAIL, LabelTarget.NODE_LABEL): LabelVisibility.FULL,
            (ZoomBand.DETAIL, LabelTarget.EDGE_LABEL): LabelVisibility.HOVER_ONLY,
            (ZoomBand.DETAIL, LabelTarget.EDGE_ARTIFACT_CHIPS): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.DETAIL, LabelTarget.BEHAVIOUR_CARD_SLICE): (
                LabelVisibility.HIDDEN
            ),
            (ZoomBand.INSPECT, LabelTarget.CONTAINER_HEADER): LabelVisibility.FULL,
            (ZoomBand.INSPECT, LabelTarget.NODE_LABEL): LabelVisibility.FULL,
            (ZoomBand.INSPECT, LabelTarget.EDGE_LABEL): LabelVisibility.FULL,
            (ZoomBand.INSPECT, LabelTarget.EDGE_ARTIFACT_CHIPS): (
                LabelVisibility.FULL
            ),
            (ZoomBand.INSPECT, LabelTarget.BEHAVIOUR_CARD_SLICE): (
                LabelVisibility.HOVER_ONLY
            ),
            (ZoomBand.SOURCE, LabelTarget.CONTAINER_HEADER): LabelVisibility.FULL,
            (ZoomBand.SOURCE, LabelTarget.NODE_LABEL): LabelVisibility.FULL,
            (ZoomBand.SOURCE, LabelTarget.EDGE_LABEL): LabelVisibility.FULL,
            (ZoomBand.SOURCE, LabelTarget.EDGE_ARTIFACT_CHIPS): LabelVisibility.FULL,
            (ZoomBand.SOURCE, LabelTarget.BEHAVIOUR_CARD_SLICE): (
                LabelVisibility.FULL
            ),
        }
    )
)

CHANNEL_BUDGET_CAPS: Mapping[tuple[ZoomBand, VisualChannel], ChannelBudgetCap] = (
    MappingProxyType(
        {
            (ZoomBand.OVERVIEW, VisualChannel.BORDER): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.BORDER,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.OVERVIEW, VisualChannel.CAPTION_ROW): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.CAPTION_ROW,
                0,
                OverflowMode.HIDE_ALL,
            ),
            (ZoomBand.OVERVIEW, VisualChannel.BADGE_CLUSTER): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.BADGE_CLUSTER,
                0,
                OverflowMode.HIDE_ALL,
            ),
            (ZoomBand.OVERVIEW, VisualChannel.CHEVRON_SLOT): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.CHEVRON_SLOT,
                0,
                OverflowMode.HIDE_ALL,
            ),
            (ZoomBand.OVERVIEW, VisualChannel.ACCENT_SLOT): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.ACCENT_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.OVERVIEW, VisualChannel.MOTION_CHANNEL): ChannelBudgetCap(
                ZoomBand.OVERVIEW,
                VisualChannel.MOTION_CHANNEL,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.BORDER): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.BORDER,
                2,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.CAPTION_ROW): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.CAPTION_ROW,
                0,
                OverflowMode.HIDE_ALL,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.BADGE_CLUSTER): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.BADGE_CLUSTER,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.CHEVRON_SLOT): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.CHEVRON_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.ACCENT_SLOT): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.ACCENT_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.STRUCTURE, VisualChannel.MOTION_CHANNEL): ChannelBudgetCap(
                ZoomBand.STRUCTURE,
                VisualChannel.MOTION_CHANNEL,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.DETAIL, VisualChannel.BORDER): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.BORDER,
                3,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.DETAIL, VisualChannel.CAPTION_ROW): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.CAPTION_ROW,
                1,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.DETAIL, VisualChannel.BADGE_CLUSTER): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.BADGE_CLUSTER,
                2,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.DETAIL, VisualChannel.CHEVRON_SLOT): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.CHEVRON_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.DETAIL, VisualChannel.ACCENT_SLOT): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.ACCENT_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.DETAIL, VisualChannel.MOTION_CHANNEL): ChannelBudgetCap(
                ZoomBand.DETAIL,
                VisualChannel.MOTION_CHANNEL,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.INSPECT, VisualChannel.BORDER): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.BORDER,
                5,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.INSPECT, VisualChannel.CAPTION_ROW): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.CAPTION_ROW,
                2,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.INSPECT, VisualChannel.BADGE_CLUSTER): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.BADGE_CLUSTER,
                3,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.INSPECT, VisualChannel.CHEVRON_SLOT): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.CHEVRON_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.INSPECT, VisualChannel.ACCENT_SLOT): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.ACCENT_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.INSPECT, VisualChannel.MOTION_CHANNEL): ChannelBudgetCap(
                ZoomBand.INSPECT,
                VisualChannel.MOTION_CHANNEL,
                2,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.SOURCE, VisualChannel.BORDER): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.BORDER,
                5,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.SOURCE, VisualChannel.CAPTION_ROW): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.CAPTION_ROW,
                3,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.SOURCE, VisualChannel.BADGE_CLUSTER): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.BADGE_CLUSTER,
                5,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
            (ZoomBand.SOURCE, VisualChannel.CHEVRON_SLOT): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.CHEVRON_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.SOURCE, VisualChannel.ACCENT_SLOT): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.ACCENT_SLOT,
                1,
                OverflowMode.HIGHEST_ONLY,
            ),
            (ZoomBand.SOURCE, VisualChannel.MOTION_CHANNEL): ChannelBudgetCap(
                ZoomBand.SOURCE,
                VisualChannel.MOTION_CHANNEL,
                3,
                OverflowMode.COLLAPSE_TO_PLUS_N,
            ),
        }
    )
)

EDGE_BUNDLING: Mapping[ZoomBand, EdgeBundlingRule] = MappingProxyType(
    {
        ZoomBand.OVERVIEW: EdgeBundlingRule(ZoomBand.OVERVIEW, 2, True),
        ZoomBand.STRUCTURE: EdgeBundlingRule(ZoomBand.STRUCTURE, 3, True),
        ZoomBand.DETAIL: EdgeBundlingRule(ZoomBand.DETAIL, 5, True),
        ZoomBand.INSPECT: EdgeBundlingRule(ZoomBand.INSPECT, 8, False),
        ZoomBand.SOURCE: EdgeBundlingRule(ZoomBand.SOURCE, 999, False),
    }
)

HIT_TEST: Mapping[ZoomBand, HitTestPrecision] = MappingProxyType(
    {
        ZoomBand.OVERVIEW: HitTestPrecision(ZoomBand.OVERVIEW, 12, 4),
        ZoomBand.STRUCTURE: HitTestPrecision(ZoomBand.STRUCTURE, 10, 4),
        ZoomBand.DETAIL: HitTestPrecision(ZoomBand.DETAIL, 8, 6),
        ZoomBand.INSPECT: HitTestPrecision(ZoomBand.INSPECT, 6, 8),
        ZoomBand.SOURCE: HitTestPrecision(ZoomBand.SOURCE, 4, 8),
    }
)


def zoom_band_from_string(value: str) -> ZoomBand:
    try:
        return ZoomBand(value)
    except ValueError as exc:
        raise ValueError(f"Unknown zoom band: {value}") from exc


def label_visibility_from_string(value: str) -> LabelVisibility:
    try:
        return LabelVisibility(value)
    except ValueError as exc:
        raise ValueError(f"Unknown label visibility: {value}") from exc


def overflow_mode_from_string(value: str) -> OverflowMode:
    try:
        return OverflowMode(value)
    except ValueError as exc:
        raise ValueError(f"Unknown overflow mode: {value}") from exc


def label_target_from_string(value: str) -> LabelTarget:
    try:
        return LabelTarget(value)
    except ValueError as exc:
        raise ValueError(f"Unknown label target: {value}") from exc


def zoom_band_for_factor(factor: float) -> ZoomBand:
    if factor < 0:
        raise ValueError(f"Zoom factor must be >= 0: {factor}")
    if factor < 0.4:
        return ZoomBand.OVERVIEW
    if factor < 0.8:
        return ZoomBand.STRUCTURE
    if factor < 1.4:
        return ZoomBand.DETAIL
    if factor < 2.5:
        return ZoomBand.INSPECT
    if factor <= 8.0:
        return ZoomBand.SOURCE

    raise ValueError(f"Zoom factor must be <= 8.0: {factor}")


def label_visibility(band: ZoomBand, target: LabelTarget) -> LabelVisibility:
    try:
        return LABEL_VISIBILITY[(band, target)]
    except KeyError as exc:
        raise ValueError(
            f"Unknown label visibility rule for band {band!r} and target {target!r}"
        ) from exc


def channel_budget_cap(
    band: ZoomBand,
    channel: VisualChannel,
) -> ChannelBudgetCap:
    try:
        return CHANNEL_BUDGET_CAPS[(band, channel)]
    except KeyError as exc:
        raise ValueError(
            f"Unknown channel budget cap for band {band!r} and channel {channel!r}"
        ) from exc


def edge_bundling(band: ZoomBand) -> EdgeBundlingRule:
    try:
        return EDGE_BUNDLING[band]
    except KeyError as exc:
        raise ValueError(f"Unknown edge bundling rule for band {band!r}") from exc


def hit_test_precision(band: ZoomBand) -> HitTestPrecision:
    try:
        return HIT_TEST[band]
    except KeyError as exc:
        raise ValueError(f"Unknown hit-test precision for band {band!r}") from exc
