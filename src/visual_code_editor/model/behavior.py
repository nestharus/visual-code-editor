"""Canonical behavior schema for reusable code-meaning units."""

from dataclasses import dataclass
from enum import Enum
from typing import Iterable
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import TrustSignal, TrustState


BEHAVIOR_ID_PATTERN = re.compile(r"^behavior:[a-zA-Z0-9._-]+$")


class BehaviorSliceRole(str, Enum):
    ENTRY_POINT = "entry-point"
    BODY = "body"
    EXIT = "exit"
    ERROR_PATH = "error-path"
    TEST = "test"
    FIXTURE = "fixture"
    ANNOTATION = "annotation"
    GUARD = "guard"
    TELEMETRY = "telemetry"


def behavior_slice_role_from_string(value: str) -> BehaviorSliceRole:
    try:
        return BehaviorSliceRole(value)
    except ValueError as exc:
        raise ValueError(f"Unknown behavior slice role: {value}") from exc


def _validate_actor(actor: ActorKind | None, field_name: str) -> None:
    if actor is not None and not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind or None")


def _validate_trust_signal(trust: TrustSignal) -> None:
    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED

    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class BehaviorSourceSlice:
    file_path: str
    start_line: int
    end_line: int
    start_col: int | None
    end_col: int | None
    slice_role: BehaviorSliceRole
    discovered_by: ActorKind
    confirmed_by: ActorKind | None

    def __post_init__(self) -> None:
        if not self.file_path:
            raise ValueError("BehaviorSourceSlice file_path must be non-empty")

        if self.start_line < 1:
            raise ValueError("BehaviorSourceSlice start_line must be >= 1")
        if self.end_line < self.start_line:
            raise ValueError("BehaviorSourceSlice end_line must be >= start_line")

        has_start_col = self.start_col is not None
        has_end_col = self.end_col is not None
        if has_start_col != has_end_col:
            raise ValueError(
                "BehaviorSourceSlice start_col and end_col must both be set or both be None"
            )
        if self.start_col is not None and self.end_col is not None:
            if self.start_col < 1 or self.end_col < 1:
                raise ValueError("BehaviorSourceSlice columns must be >= 1")
            if self.start_line == self.end_line and self.end_col < self.start_col:
                raise ValueError(
                    "BehaviorSourceSlice end_col must be >= start_col on one-line slices"
                )

        if not isinstance(self.slice_role, BehaviorSliceRole):
            raise ValueError("BehaviorSourceSlice slice_role must be a BehaviorSliceRole")

        if not isinstance(self.discovered_by, ActorKind):
            raise ValueError("BehaviorSourceSlice discovered_by must be an ActorKind")
        _validate_actor(self.confirmed_by, "BehaviorSourceSlice confirmed_by")


@dataclass(frozen=True)
class Behavior:
    id: str
    label: str
    description: str | None
    source_slices: tuple[BehaviorSourceSlice, ...]
    trust: TrustSignal
    parent_behavior_id: str | None
    attribution_actor: ActorKind | None

    def __post_init__(self) -> None:
        if not BEHAVIOR_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Behavior id must match ^behavior:[a-zA-Z0-9._-]+$")

        if not self.label:
            raise ValueError("Behavior label must be non-empty")

        source_slices = tuple(self.source_slices)
        object.__setattr__(self, "source_slices", source_slices)
        if not source_slices:
            raise ValueError("Behavior source_slices must be non-empty")
        for source_slice in source_slices:
            if not isinstance(source_slice, BehaviorSourceSlice):
                raise ValueError(
                    "Behavior source_slices must contain BehaviorSourceSlice entries"
                )

        _validate_trust_signal(self.trust)

        if self.parent_behavior_id is not None and not BEHAVIOR_ID_PATTERN.fullmatch(
            self.parent_behavior_id
        ):
            raise ValueError(
                "Behavior parent_behavior_id must match ^behavior:[a-zA-Z0-9._-]+$"
            )

        _validate_actor(self.attribution_actor, "Behavior attribution_actor")


def make_behavior(
    *,
    id: str,
    label: str,
    description: str | None,
    source_slices: Iterable[BehaviorSourceSlice],
    trust: TrustSignal,
    parent_behavior_id: str | None,
    attribution_actor: ActorKind | None,
) -> Behavior:
    return Behavior(
        id=id,
        label=label,
        description=description,
        source_slices=tuple(source_slices),
        trust=trust,
        parent_behavior_id=parent_behavior_id,
        attribution_actor=attribution_actor,
    )
