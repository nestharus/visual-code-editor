"""Canonical trust vocabulary for derived workspace values.

New trust states and grounding sources must be added through proposal cycles,
not ad hoc.
"""

from dataclasses import dataclass
from enum import Enum


class TrustState(str, Enum):
    GROUNDED = "grounded"
    CANDIDATE = "candidate"
    CONFLICTING = "conflicting"
    STALE = "stale"
    ORPHANED = "orphaned"


class GroundingSource(str, Enum):
    TEST = "test"
    LSP_TYPE = "lsp-type"
    RUNTIME_TRACE = "runtime-trace"
    ANNOTATION = "annotation"
    USER_CONFIRMED = "user-confirmed"
    PROVIDER_VERIFIED = "provider-verified"


ALL_TRUST_STATES: tuple[TrustState, ...] = tuple(TrustState)
ALL_GROUNDING_SOURCES: tuple[GroundingSource, ...] = tuple(GroundingSource)


def trust_state_from_string(value: str) -> TrustState:
    try:
        return TrustState(value)
    except ValueError as exc:
        raise ValueError(f"Unknown trust state: {value}") from exc


def grounding_source_from_string(value: str) -> GroundingSource:
    try:
        return GroundingSource(value)
    except ValueError as exc:
        raise ValueError(f"Unknown grounding source: {value}") from exc


@dataclass(frozen=True)
class TrustSignal:
    state: TrustState
    grounding: GroundingSource | None

    def __post_init__(self) -> None:
        has_grounding = self.grounding is not None
        is_grounded = self.state == TrustState.GROUNDED

        if is_grounded != has_grounding:
            raise ValueError(
                "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
            )
