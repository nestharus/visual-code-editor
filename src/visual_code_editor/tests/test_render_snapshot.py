import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.render_snapshot import (
    RENDER_ID_PATTERN,
    RenderSnapshot,
    RenderSurface,
    RenderViewport,
    render_surface_from_string,
    render_viewport_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_RENDER_SURFACES = (
    ("STATIC_IMAGE", "static-image"),
    ("WIREFRAME", "wireframe"),
    ("ANIMATED", "animated"),
)

CONTRACT_RENDER_VIEWPORTS = (
    ("MOBILE_PORTRAIT", "mobile-portrait"),
    ("MOBILE_LANDSCAPE", "mobile-landscape"),
    ("TABLET", "tablet"),
    ("DESKTOP", "desktop"),
    ("DESKTOP_WIDE", "desktop-wide"),
)

CONTRACT_RENDER_SURFACE_VALUES = tuple(value for _, value in CONTRACT_RENDER_SURFACES)
CONTRACT_RENDER_VIEWPORT_VALUES = tuple(value for _, value in CONTRACT_RENDER_VIEWPORTS)


def _snapshot(**overrides) -> RenderSnapshot:
    values = {
        "id": "render:button.primary.desktop",
        "widget_id": "widget:button.primary",
        "surface": RenderSurface.STATIC_IMAGE,
        "viewport": RenderViewport.DESKTOP,
        "theme": "dark",
        "locale": "en-US",
        "asset_path": "public/data/widget-renders/button.primary/desktop.png",
        "captured_at_ms": 1_700_000_000_000,
        "trust": TrustSignal(state=TrustState.CANDIDATE, grounding=None),
    }
    values.update(overrides)
    return RenderSnapshot(**values)


@pytest.mark.parametrize(("member_name", "surface_value"), CONTRACT_RENDER_SURFACES)
def test_render_surface_enum_contains_each_contract_member(member_name, surface_value):
    assert hasattr(RenderSurface, member_name), (
        f"Enum membership invariant violated: RenderSurface is missing {member_name}"
    )
    assert getattr(RenderSurface, member_name).value == surface_value, (
        "String stability invariant violated: "
        f"RenderSurface.{member_name}.value must be {surface_value!r}"
    )


@pytest.mark.parametrize(("member_name", "viewport_value"), CONTRACT_RENDER_VIEWPORTS)
def test_render_viewport_enum_contains_each_contract_member(member_name, viewport_value):
    assert hasattr(RenderViewport, member_name), (
        f"Enum membership invariant violated: RenderViewport is missing {member_name}"
    )
    assert getattr(RenderViewport, member_name).value == viewport_value, (
        "String stability invariant violated: "
        f"RenderViewport.{member_name}.value must be {viewport_value!r}"
    )


def test_render_enums_contain_exactly_the_contract_members():
    assert len(RenderSurface) == 3, (
        "Enum membership invariant violated: RenderSurface must expose 3 surfaces"
    )
    assert tuple(surface.value for surface in RenderSurface) == CONTRACT_RENDER_SURFACE_VALUES

    assert len(RenderViewport) == 5, (
        "Enum membership invariant violated: RenderViewport must expose 5 viewports"
    )
    assert tuple(viewport.value for viewport in RenderViewport) == CONTRACT_RENDER_VIEWPORT_VALUES


@pytest.mark.parametrize(("member_name", "surface_value"), CONTRACT_RENDER_SURFACES)
def test_render_surface_from_string_accepts_every_contract_value(
    member_name,
    surface_value,
):
    assert render_surface_from_string(surface_value) is getattr(RenderSurface, member_name)


@pytest.mark.parametrize(("member_name", "viewport_value"), CONTRACT_RENDER_VIEWPORTS)
def test_render_viewport_from_string_accepts_every_contract_value(
    member_name,
    viewport_value,
):
    assert render_viewport_from_string(viewport_value) is getattr(RenderViewport, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "STATIC_IMAGE", "static_image", "static-image ", "video"),
)
def test_render_surface_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        render_surface_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "DESKTOP", "desktop_wide", "desktop-wide ", "phone"),
)
def test_render_viewport_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        render_viewport_from_string(invalid_value)


@pytest.mark.parametrize(
    "render_id",
    (
        "render:button.primary.desktop",
        "render:Button_123",
        "render:system-card",
    ),
)
def test_render_id_pattern_accepts_contract_values(render_id):
    assert RENDER_ID_PATTERN.fullmatch(render_id)
    assert _snapshot(id=render_id).id == render_id


@pytest.mark.parametrize(
    "render_id",
    (
        "",
        "button.primary.desktop",
        "render:",
        "Render:button",
        "render:has spaces",
        "render:button/primary",
    ),
)
def test_render_id_pattern_rejects_invalid_values(render_id):
    assert not RENDER_ID_PATTERN.fullmatch(render_id)
    with pytest.raises(ValueError):
        _snapshot(id=render_id)


@pytest.mark.parametrize(
    "widget_id",
    (
        "",
        "button.primary",
        "widget:",
        "Widget:button",
        "widget:has spaces",
        "widget:button/primary",
    ),
)
def test_render_snapshot_rejects_invalid_widget_id(widget_id):
    with pytest.raises(ValueError):
        _snapshot(widget_id=widget_id)


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("asset_path", ""),
        ("asset_path", "   "),
        ("theme", ""),
        ("theme", "   "),
        ("locale", ""),
        ("locale", "   "),
    ),
)
def test_render_snapshot_rejects_empty_asset_path_theme_and_locale(field, value):
    with pytest.raises(ValueError):
        _snapshot(**{field: value})


def test_render_snapshot_uses_trust_signal_iff_grounding_invariant():
    grounded = _snapshot(
        trust=TrustSignal(
            state=TrustState.GROUNDED,
            grounding=GroundingSource.USER_CONFIRMED,
        )
    )

    assert grounded.trust.state is TrustState.GROUNDED
    assert grounded.trust.grounding is GroundingSource.USER_CONFIRMED

    with pytest.raises(ValueError):
        _snapshot(trust=TrustSignal(state=TrustState.GROUNDED, grounding=None))


def test_render_snapshot_captured_at_ms_must_be_non_negative():
    with pytest.raises(ValueError):
        _snapshot(captured_at_ms=-1)
