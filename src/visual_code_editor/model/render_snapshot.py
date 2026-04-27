"""Rendered widget snapshot schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import WIDGET_ID_PATTERN


RENDER_ID_PATTERN = re.compile(r"^render:[a-zA-Z0-9._-]+$")


class RenderSurface(str, Enum):
    STATIC_IMAGE = "static-image"
    WIREFRAME = "wireframe"
    ANIMATED = "animated"


class RenderViewport(str, Enum):
    MOBILE_PORTRAIT = "mobile-portrait"
    MOBILE_LANDSCAPE = "mobile-landscape"
    TABLET = "tablet"
    DESKTOP = "desktop"
    DESKTOP_WIDE = "desktop-wide"


def render_surface_from_string(value: str) -> RenderSurface:
    try:
        return RenderSurface(value)
    except ValueError as exc:
        raise ValueError(f"Unknown render surface: {value}") from exc


def render_viewport_from_string(value: str) -> RenderViewport:
    try:
        return RenderViewport(value)
    except ValueError as exc:
        raise ValueError(f"Unknown render viewport: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("RenderSnapshot trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("RenderSnapshot trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(
            "RenderSnapshot trust grounding must be a GroundingSource or None"
        )

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class RenderSnapshot:
    id: str
    widget_id: str
    surface: RenderSurface
    viewport: RenderViewport
    theme: str
    locale: str
    asset_path: str
    captured_at_ms: int
    trust: TrustSignal

    def __post_init__(self) -> None:
        if not RENDER_ID_PATTERN.fullmatch(self.id):
            raise ValueError("RenderSnapshot id must match ^render:[a-zA-Z0-9._-]+$")
        if not WIDGET_ID_PATTERN.fullmatch(self.widget_id):
            raise ValueError(
                "RenderSnapshot widget_id must match ^widget:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.surface, RenderSurface):
            raise ValueError("RenderSnapshot surface must be a RenderSurface")
        if not isinstance(self.viewport, RenderViewport):
            raise ValueError("RenderSnapshot viewport must be a RenderViewport")

        _validate_non_empty_string(self.theme, "RenderSnapshot theme")
        _validate_non_empty_string(self.locale, "RenderSnapshot locale")
        _validate_non_empty_string(self.asset_path, "RenderSnapshot asset_path")

        if self.captured_at_ms < 0:
            raise ValueError("RenderSnapshot captured_at_ms must be >= 0")

        _validate_trust_signal(self.trust)
