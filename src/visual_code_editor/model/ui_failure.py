"""UI failure surfacing schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


UI_FAILURE_ID_PATTERN = re.compile(r"^ui-failure:[a-zA-Z0-9._-]+$")


class UiFailureKind(str, Enum):
    TEST_FAILURE = "test-failure"
    RUNTIME_ERROR = "runtime-error"
    A11Y_VIOLATION = "a11y-violation"
    CONTRAST_VIOLATION = "contrast-violation"
    RENDER_ERROR = "render-error"
    PERFORMANCE_BUDGET = "performance-budget"


class UiFailureSeverity(str, Enum):
    BLOCKER = "blocker"
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"
    INFO = "info"


ALL_UI_FAILURE_KINDS: tuple[UiFailureKind, ...] = tuple(UiFailureKind)
ALL_UI_FAILURE_SEVERITIES: tuple[UiFailureSeverity, ...] = tuple(UiFailureSeverity)


def ui_failure_kind_from_string(value: str) -> UiFailureKind:
    try:
        return UiFailureKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown UI failure kind: {value}") from exc


def ui_failure_severity_from_string(value: str) -> UiFailureSeverity:
    try:
        return UiFailureSeverity(value)
    except ValueError as exc:
        raise ValueError(f"Unknown UI failure severity: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_optional_string(value: str | None, field_name: str) -> None:
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string or None")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("UiFailure trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("UiFailure trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError("UiFailure trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class UiFailure:
    id: str
    widget_id: str | None
    screen_id: str | None
    variant_cell_id: str | None
    kind: UiFailureKind
    severity: UiFailureSeverity
    message: str
    evidence_url: str | None
    trust: TrustSignal
    attribution_actor: ActorKind
    detected_at_ms: int

    def __post_init__(self) -> None:
        if not UI_FAILURE_ID_PATTERN.fullmatch(self.id):
            raise ValueError("UiFailure id must match ^ui-failure:[a-zA-Z0-9._-]+$")

        _validate_optional_string(self.widget_id, "UiFailure widget_id")
        _validate_optional_string(self.screen_id, "UiFailure screen_id")
        _validate_optional_string(self.variant_cell_id, "UiFailure variant_cell_id")
        if (
            self.widget_id is None
            and self.screen_id is None
            and self.variant_cell_id is None
        ):
            raise ValueError(
                "UiFailure requires at least one of widget_id, screen_id, "
                "or variant_cell_id"
            )

        if not isinstance(self.kind, UiFailureKind):
            raise ValueError("UiFailure kind must be a UiFailureKind")
        if not isinstance(self.severity, UiFailureSeverity):
            raise ValueError("UiFailure severity must be a UiFailureSeverity")
        _validate_non_empty_string(self.message, "UiFailure message")

        _validate_optional_string(self.evidence_url, "UiFailure evidence_url")
        _validate_trust_signal(self.trust)

        if not isinstance(self.attribution_actor, ActorKind):
            raise ValueError("UiFailure attribution_actor must be an ActorKind")
        if self.detected_at_ms < 0:
            raise ValueError("UiFailure detected_at_ms must be >= 0")
