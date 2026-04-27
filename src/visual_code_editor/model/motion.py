"""Motion and transition documentation schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import WIDGET_ID_PATTERN


MOTION_ID_PATTERN = re.compile(r"^motion:[a-zA-Z0-9._-]+$")
SCREEN_ID_PATTERN = re.compile(r"^screen:[a-zA-Z0-9._-]+$")


class MotionKind(str, Enum):
    ENTER = "enter"
    EXIT = "exit"
    HOVER = "hover"
    PRESS = "press"
    FOCUS = "focus"
    TRANSITION = "transition"
    AMBIENT = "ambient"
    ATTENTION = "attention"


class MotionRole(str, Enum):
    STATE_CHANGE = "state-change"
    AFFORDANCE = "affordance"
    FEEDBACK = "feedback"
    NAVIGATION = "navigation"
    LOADING = "loading"
    ERROR = "error"
    CELEBRATION = "celebration"
    AMBIENT = "ambient"


class EasingKind(str, Enum):
    LINEAR = "linear"
    EASE = "ease"
    EASE_IN = "ease-in"
    EASE_OUT = "ease-out"
    EASE_IN_OUT = "ease-in-out"
    STEP_START = "step-start"
    STEP_END = "step-end"
    CUSTOM = "custom"


def motion_kind_from_string(value: str) -> MotionKind:
    try:
        return MotionKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown motion kind: {value}") from exc


def motion_role_from_string(value: str) -> MotionRole:
    try:
        return MotionRole(value)
    except ValueError as exc:
        raise ValueError(f"Unknown motion role: {value}") from exc


def easing_kind_from_string(value: str) -> EasingKind:
    try:
        return EasingKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown easing kind: {value}") from exc


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("Motion trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("Motion trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError("Motion trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class Motion:
    id: str
    widget_id: str | None
    screen_id: str | None
    kind: MotionKind
    role: MotionRole
    duration_ms: int
    easing: EasingKind
    custom_curve: str | None
    capture_asset_path: str | None
    trust: TrustSignal
    attribution_actor: ActorKind
    created_at_ms: int

    def __post_init__(self) -> None:
        if not MOTION_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Motion id must match ^motion:[a-zA-Z0-9._-]+$")
        if self.widget_id is not None and not WIDGET_ID_PATTERN.fullmatch(
            self.widget_id
        ):
            raise ValueError("Motion widget_id must match ^widget:[a-zA-Z0-9._-]+$")
        if self.screen_id is not None and not SCREEN_ID_PATTERN.fullmatch(
            self.screen_id
        ):
            raise ValueError("Motion screen_id must match ^screen:[a-zA-Z0-9._-]+$")
        if not isinstance(self.kind, MotionKind):
            raise ValueError("Motion kind must be a MotionKind")
        if not isinstance(self.role, MotionRole):
            raise ValueError("Motion role must be a MotionRole")
        if self.duration_ms < 0:
            raise ValueError("Motion duration_ms must be >= 0")
        if not isinstance(self.easing, EasingKind):
            raise ValueError("Motion easing must be an EasingKind")

        has_custom_curve = (
            isinstance(self.custom_curve, str) and self.custom_curve.strip() != ""
        )
        is_custom_easing = self.easing == EasingKind.CUSTOM
        if is_custom_easing != has_custom_curve:
            raise ValueError(
                "Motion custom_curve must be set iff easing is EasingKind.CUSTOM"
            )

        if self.capture_asset_path is not None and not isinstance(
            self.capture_asset_path,
            str,
        ):
            raise ValueError("Motion capture_asset_path must be a string or None")

        _validate_trust_signal(self.trust)
        if not isinstance(self.attribution_actor, ActorKind):
            raise ValueError("Motion attribution_actor must be an ActorKind")
        if self.created_at_ms < 0:
            raise ValueError("Motion created_at_ms must be >= 0")
