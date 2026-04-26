"""Operational overlay schema for provider-emitted diagram signals."""

from dataclasses import dataclass
from enum import Enum

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


class OverlayProviderId(str, Enum):
    TEST_STATUS = "g:test"
    PR_DELTA = "g:pr-delta"
    DEPLOY_STATE = "g:deploy"
    RUNTIME_PROFILE = "g:profile"
    TASK_ACTIVE = "g:task-active"


class OverlaySignalKind(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    IN_PROGRESS = "in-progress"
    STALE = "stale"
    INFO = "info"


def overlay_provider_id_from_string(value: str) -> OverlayProviderId:
    try:
        return OverlayProviderId(value)
    except ValueError as exc:
        raise ValueError(f"Unknown overlay provider id: {value}") from exc


def overlay_signal_kind_from_string(value: str) -> OverlaySignalKind:
    try:
        return OverlaySignalKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown overlay signal kind: {value}") from exc


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("OverlaySignal trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("OverlaySignal trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(
            "OverlaySignal trust grounding must be a GroundingSource or None"
        )

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


@dataclass(frozen=True)
class OverlaySignal:
    provider_id: OverlayProviderId
    entity_id: str
    kind: OverlaySignalKind
    label: str
    trust: TrustSignal
    emitted_at_ms: int
    detail_url: str | None

    def __post_init__(self) -> None:
        if not isinstance(self.provider_id, OverlayProviderId):
            raise ValueError("OverlaySignal provider_id must be an OverlayProviderId")
        if not self.entity_id:
            raise ValueError("OverlaySignal entity_id must be non-empty")
        if not isinstance(self.kind, OverlaySignalKind):
            raise ValueError("OverlaySignal kind must be an OverlaySignalKind")
        if not self.label:
            raise ValueError("OverlaySignal label must be non-empty")
        _validate_trust_signal(self.trust)
        if self.emitted_at_ms < 0:
            raise ValueError("OverlaySignal emitted_at_ms must be >= 0")


@dataclass(frozen=True)
class OverlayLayer:
    provider_id: OverlayProviderId
    signals: tuple[OverlaySignal, ...]
    computed_at_ms: int
    attribution_actor: ActorKind

    def __post_init__(self) -> None:
        if not isinstance(self.provider_id, OverlayProviderId):
            raise ValueError("OverlayLayer provider_id must be an OverlayProviderId")

        signals = tuple(self.signals)
        object.__setattr__(self, "signals", signals)
        previous_entity_id: str | None = None
        seen_provider_entities: set[tuple[OverlayProviderId, str]] = set()

        for signal in signals:
            if not isinstance(signal, OverlaySignal):
                raise ValueError("OverlayLayer signals must contain OverlaySignal entries")
            if signal.provider_id != self.provider_id:
                raise ValueError(
                    "OverlayLayer signals must match the layer provider_id"
                )
            if previous_entity_id is not None and previous_entity_id > signal.entity_id:
                raise ValueError("OverlayLayer signals must be ordered by entity_id")
            previous_entity_id = signal.entity_id

            provider_entity = (signal.provider_id, signal.entity_id)
            if provider_entity in seen_provider_entities:
                raise ValueError(
                    "OverlayLayer signals must be unique by provider_id/entity_id"
                )
            seen_provider_entities.add(provider_entity)

        if self.computed_at_ms < 0:
            raise ValueError("OverlayLayer computed_at_ms must be >= 0")
        _validate_actor(self.attribution_actor, "OverlayLayer attribution_actor")


@dataclass(frozen=True)
class OperationalOverlay:
    layers: tuple[OverlayLayer, ...]
    computed_at_ms: int

    def __post_init__(self) -> None:
        layers = tuple(self.layers)
        object.__setattr__(self, "layers", layers)
        seen_provider_ids: set[OverlayProviderId] = set()

        for layer in layers:
            if not isinstance(layer, OverlayLayer):
                raise ValueError(
                    "OperationalOverlay layers must contain OverlayLayer entries"
                )
            if layer.provider_id in seen_provider_ids:
                raise ValueError(
                    "OperationalOverlay layers must be unique by provider_id"
                )
            seen_provider_ids.add(layer.provider_id)

        if self.computed_at_ms < 0:
            raise ValueError("OperationalOverlay computed_at_ms must be >= 0")
