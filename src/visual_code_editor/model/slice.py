"""Slice schema for query-derived subgraph diagrams."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import TrustSignal, TrustState


SLICE_ID_PATTERN = re.compile(r"^slice:[a-zA-Z0-9._-]+$")


class NeighbourhoodKind(str, Enum):
    DIRECT_NEIGHBOURS = "direct-neighbours"
    TRANSITIVE_BY_EDGE_KIND = "transitive-by-edge-kind"
    SHARED_BEHAVIOUR = "shared-behaviour"
    SHARED_CONTAINER = "shared-container"
    EXACT = "exact"


class SliceLifecycleState(str, Enum):
    ACTIVE = "active"
    PINNED = "pinned"
    EXPIRING = "expiring"
    TOMBSTONED = "tombstoned"
    RECOVERED = "recovered"
    DISMISSED = "dismissed"


def neighbourhood_kind_from_string(value: str) -> NeighbourhoodKind:
    try:
        return NeighbourhoodKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown neighbourhood kind: {value}") from exc


def slice_lifecycle_state_from_string(value: str) -> SliceLifecycleState:
    try:
        return SliceLifecycleState(value)
    except ValueError as exc:
        raise ValueError(f"Unknown slice lifecycle state: {value}") from exc


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("Slice trust must be a TrustSignal")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED

    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class NeighbourhoodRule:
    kind: NeighbourhoodKind
    edge_kinds: tuple[str, ...]
    max_hops: int

    def __post_init__(self) -> None:
        if not isinstance(self.kind, NeighbourhoodKind):
            raise ValueError("NeighbourhoodRule kind must be a NeighbourhoodKind")

        edge_kinds = tuple(self.edge_kinds)
        object.__setattr__(self, "edge_kinds", edge_kinds)
        for edge_kind in edge_kinds:
            if not isinstance(edge_kind, str) or not edge_kind:
                raise ValueError(
                    "NeighbourhoodRule edge_kinds must contain non-empty strings"
                )

        if self.kind == NeighbourhoodKind.TRANSITIVE_BY_EDGE_KIND:
            if not edge_kinds:
                raise ValueError(
                    "NeighbourhoodRule edge_kinds must be non-empty for transitive rules"
                )
            if self.max_hops < 1:
                raise ValueError(
                    "NeighbourhoodRule max_hops must be >= 1 for transitive rules"
                )
            return

        if edge_kinds:
            raise ValueError(
                "NeighbourhoodRule edge_kinds must be empty for non-transitive rules"
            )
        if self.max_hops != 0:
            raise ValueError(
                "NeighbourhoodRule max_hops must be 0 for non-transitive rules"
            )


@dataclass(frozen=True)
class Slice:
    id: str
    query: str
    matched_entity_ids: tuple[str, ...]
    neighbourhood_entity_ids: tuple[str, ...]
    rule: NeighbourhoodRule
    lifecycle_state: SliceLifecycleState
    ttl_ms: int | None
    created_by: ActorKind
    created_at_ms: int
    pinned_at_ms: int | None
    trust: TrustSignal

    def __post_init__(self) -> None:
        if not SLICE_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Slice id must match ^slice:[a-zA-Z0-9._-]+$")

        if not self.query:
            raise ValueError("Slice query must be non-empty")

        matched_entity_ids = tuple(self.matched_entity_ids)
        object.__setattr__(self, "matched_entity_ids", matched_entity_ids)
        if not matched_entity_ids:
            raise ValueError("Slice matched_entity_ids must be non-empty")

        neighbourhood_entity_ids = tuple(self.neighbourhood_entity_ids)
        object.__setattr__(
            self, "neighbourhood_entity_ids", neighbourhood_entity_ids
        )
        if len(set(neighbourhood_entity_ids)) != len(neighbourhood_entity_ids):
            raise ValueError("Slice neighbourhood_entity_ids must be unique")
        if set(matched_entity_ids).intersection(neighbourhood_entity_ids):
            raise ValueError(
                "Slice neighbourhood_entity_ids must not overlap matched_entity_ids"
            )

        if not isinstance(self.rule, NeighbourhoodRule):
            raise ValueError("Slice rule must be a NeighbourhoodRule")
        if not isinstance(self.lifecycle_state, SliceLifecycleState):
            raise ValueError("Slice lifecycle_state must be a SliceLifecycleState")

        if self.lifecycle_state == SliceLifecycleState.PINNED:
            if self.ttl_ms is not None or self.pinned_at_ms is None:
                raise ValueError(
                    "Slice pinned lifecycle requires ttl_ms None and pinned_at_ms set"
                )
        elif self.ttl_ms is None:
            raise ValueError("Slice non-pinned lifecycle states require ttl_ms")

        if not isinstance(self.created_by, ActorKind):
            raise ValueError("Slice created_by must be an ActorKind")

        if self.created_at_ms < 0:
            raise ValueError("Slice created_at_ms must be >= 0")
        if self.pinned_at_ms is not None and self.pinned_at_ms < self.created_at_ms:
            raise ValueError("Slice pinned_at_ms must be >= created_at_ms")

        _validate_trust_signal(self.trust)
