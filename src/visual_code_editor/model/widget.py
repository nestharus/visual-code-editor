"""Canonical reusable UI widget schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


WIDGET_ID_PATTERN = re.compile(r"^widget:[a-zA-Z0-9._-]+$")
WIDGET_MAPPING_ID_PATTERN = re.compile(r"^widget-mapping:[a-zA-Z0-9._-]+$")


class WidgetKind(str, Enum):
    BUTTON = "button"
    INPUT = "input"
    LIST = "list"
    MODAL = "modal"
    TAB = "tab"
    PANEL = "panel"
    CARD = "card"
    TOOLTIP = "tooltip"
    BANNER = "banner"
    CHIP = "chip"
    FORM = "form"
    TABLE = "table"
    AVATAR = "avatar"
    ICON = "icon"
    GENERIC = "generic"


class WidgetSurface(str, Enum):
    SOURCE = "source"
    STORYBOOK = "storybook"
    FIGMA = "figma"
    DESIGN_TOKEN = "design-token"
    RUNTIME = "runtime"


def widget_kind_from_string(value: str) -> WidgetKind:
    try:
        return WidgetKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown widget kind: {value}") from exc


def widget_surface_from_string(value: str) -> WidgetSurface:
    try:
        return WidgetSurface(value)
    except ValueError as exc:
        raise ValueError(f"Unknown widget surface: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("Widget trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("Widget trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError("Widget trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class WidgetReference:
    surface: WidgetSurface
    identifier: str
    evidence_source: str

    def __post_init__(self) -> None:
        if not isinstance(self.surface, WidgetSurface):
            raise ValueError("WidgetReference surface must be a WidgetSurface")
        _validate_non_empty_string(
            self.identifier,
            "WidgetReference identifier",
        )
        if not isinstance(self.evidence_source, str):
            raise ValueError("WidgetReference evidence_source must be a string")


@dataclass(frozen=True)
class Widget:
    id: str
    label: str
    kind: WidgetKind
    references: tuple[WidgetReference, ...]
    trust: TrustSignal
    attribution_actor: ActorKind
    created_at_ms: int

    def __post_init__(self) -> None:
        if not WIDGET_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Widget id must match ^widget:[a-zA-Z0-9._-]+$")
        _validate_non_empty_string(self.label, "Widget label")
        if not isinstance(self.kind, WidgetKind):
            raise ValueError("Widget kind must be a WidgetKind")

        try:
            references = tuple(self.references)
        except TypeError as exc:
            raise ValueError("Widget references must be iterable") from exc
        if len(references) == 0:
            raise ValueError("Widget references must contain at least one reference")

        deduped_references: list[WidgetReference] = []
        seen_reference_keys: set[tuple[WidgetSurface, str]] = set()
        for reference in references:
            if not isinstance(reference, WidgetReference):
                raise ValueError("Widget references must contain WidgetReference entries")
            reference_key = (reference.surface, reference.identifier)
            if reference_key in seen_reference_keys:
                continue
            seen_reference_keys.add(reference_key)
            deduped_references.append(reference)
        object.__setattr__(self, "references", tuple(deduped_references))

        _validate_trust_signal(self.trust)
        if not isinstance(self.attribution_actor, ActorKind):
            raise ValueError("Widget attribution_actor must be an ActorKind")
        if self.created_at_ms < 0:
            raise ValueError("Widget created_at_ms must be >= 0")


@dataclass(frozen=True)
class WidgetMapping:
    id: str
    widget_id: str
    reference: WidgetReference
    confirmed_by: ActorKind
    confirmed_at_ms: int
    notes: str | None

    def __post_init__(self) -> None:
        if not WIDGET_MAPPING_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "WidgetMapping id must match ^widget-mapping:[a-zA-Z0-9._-]+$"
            )
        if not WIDGET_ID_PATTERN.fullmatch(self.widget_id):
            raise ValueError(
                "WidgetMapping widget_id must match ^widget:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.reference, WidgetReference):
            raise ValueError("WidgetMapping reference must be a WidgetReference")
        if not isinstance(self.confirmed_by, ActorKind):
            raise ValueError("WidgetMapping confirmed_by must be an ActorKind")
        if self.confirmed_at_ms < 0:
            raise ValueError("WidgetMapping confirmed_at_ms must be >= 0")
        if self.notes is not None and not isinstance(self.notes, str):
            raise ValueError("WidgetMapping notes must be a string or None")
