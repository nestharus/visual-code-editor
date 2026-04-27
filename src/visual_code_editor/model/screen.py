"""Screen flow and navigation schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import WIDGET_ID_PATTERN


SCREEN_ID_PATTERN = re.compile(r"^screen:[a-zA-Z0-9._-]+$")
SCREEN_EDGE_ID_PATTERN = re.compile(r"^screen-edge:[a-zA-Z0-9._-]+$")


class ScreenKind(str, Enum):
    PAGE = "page"
    MODAL = "modal"
    OVERLAY = "overlay"
    DIALOG = "dialog"
    POPOVER = "popover"
    DRAWER = "drawer"
    SIDEPANEL = "sidepanel"
    TOAST = "toast"


class ScreenEdgeKind(str, Enum):
    NAVIGATE = "navigate"
    OPEN_MODAL = "open-modal"
    CLOSE_MODAL = "close-modal"
    PUSH = "push"
    POP = "pop"
    REPLACE = "replace"
    REDIRECT = "redirect"
    USER_BACK = "user-back"


class ScreenEdgeTrigger(str, Enum):
    CLICK = "click"
    KEYBOARD = "keyboard"
    AUTO = "auto"
    ROUTE = "route"
    PARENT_REQUEST = "parent-request"


def screen_kind_from_string(value: str) -> ScreenKind:
    try:
        return ScreenKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown screen kind: {value}") from exc


def screen_edge_kind_from_string(value: str) -> ScreenEdgeKind:
    try:
        return ScreenEdgeKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown screen edge kind: {value}") from exc


def screen_edge_trigger_from_string(value: str) -> ScreenEdgeTrigger:
    try:
        return ScreenEdgeTrigger(value)
    except ValueError as exc:
        raise ValueError(f"Unknown screen edge trigger: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal, owner: str) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError(f"{owner} trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError(f"{owner} trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(f"{owner} trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


def _require_non_negative_int(value: int, field_name: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if value < 0:
        raise ValueError(f"{field_name} must be >= 0")


@dataclass(frozen=True)
class Screen:
    id: str
    label: str
    kind: ScreenKind
    route: str | None
    widget_ids: tuple[str, ...]
    trust: TrustSignal
    attribution_actor: ActorKind
    created_at_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not SCREEN_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Screen id must match ^screen:[a-zA-Z0-9._-]+$")
        _validate_non_empty_string(self.label, "Screen label")
        if not isinstance(self.kind, ScreenKind):
            raise ValueError("Screen kind must be a ScreenKind")
        if self.route is not None and not isinstance(self.route, str):
            raise ValueError("Screen route must be a string or None")

        try:
            widget_ids = tuple(self.widget_ids)
        except TypeError as exc:
            raise ValueError("Screen widget_ids must be iterable") from exc

        deduped_widget_ids: list[str] = []
        seen_widget_ids: set[str] = set()
        for widget_id in widget_ids:
            if not isinstance(widget_id, str) or not WIDGET_ID_PATTERN.fullmatch(
                widget_id
            ):
                raise ValueError(
                    "Screen widget_ids must match ^widget:[a-zA-Z0-9._-]+$"
                )
            if widget_id in seen_widget_ids:
                continue
            seen_widget_ids.add(widget_id)
            deduped_widget_ids.append(widget_id)
        object.__setattr__(self, "widget_ids", tuple(deduped_widget_ids))

        _validate_trust_signal(self.trust, "Screen")
        _validate_actor(self.attribution_actor, "Screen attribution_actor")
        _require_non_negative_int(self.created_at_ms, "Screen created_at_ms")


@dataclass(frozen=True)
class ScreenEdge:
    id: str
    from_screen_id: str
    to_screen_id: str
    kind: ScreenEdgeKind
    trigger: ScreenEdgeTrigger
    trust: TrustSignal
    attribution_actor: ActorKind
    observed_at_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not SCREEN_EDGE_ID_PATTERN.fullmatch(
            self.id
        ):
            raise ValueError(
                "ScreenEdge id must match ^screen-edge:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.from_screen_id, str) or not SCREEN_ID_PATTERN.fullmatch(
            self.from_screen_id
        ):
            raise ValueError(
                "ScreenEdge from_screen_id must match ^screen:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.to_screen_id, str) or not SCREEN_ID_PATTERN.fullmatch(
            self.to_screen_id
        ):
            raise ValueError(
                "ScreenEdge to_screen_id must match ^screen:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.kind, ScreenEdgeKind):
            raise ValueError("ScreenEdge kind must be a ScreenEdgeKind")
        if not isinstance(self.trigger, ScreenEdgeTrigger):
            raise ValueError("ScreenEdge trigger must be a ScreenEdgeTrigger")

        _validate_trust_signal(self.trust, "ScreenEdge")
        _validate_actor(self.attribution_actor, "ScreenEdge attribution_actor")
        _require_non_negative_int(self.observed_at_ms, "ScreenEdge observed_at_ms")
