"""Provider registry and connection schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PROVIDER_ID_PATTERN = re.compile(r"^provider:[a-zA-Z0-9._-]+$")


class ProviderKind(str, Enum):
    GITHUB = "github"
    GITLAB = "gitlab"
    JIRA = "jira"
    LINEAR = "linear"
    GENERIC_HTTP = "generic-http"


class ProviderHealthState(str, Enum):
    GROUNDED = "grounded"
    STALE = "stale"
    CONFLICTING = "conflicting"


def provider_kind_from_string(value: str) -> ProviderKind:
    try:
        return ProviderKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown provider kind: {value}") from exc


def provider_health_state_from_string(value: str) -> ProviderHealthState:
    try:
        return ProviderHealthState(value)
    except ValueError as exc:
        raise ValueError(f"Unknown provider health state: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("ProviderEntityMapping trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("ProviderEntityMapping trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(
            "ProviderEntityMapping trust grounding must be a GroundingSource or None"
        )

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class ProviderEntityMapping:
    provider_field: str
    workspace_field: str
    trust: TrustSignal
    evidence_source: str

    def __post_init__(self) -> None:
        _validate_non_empty_string(
            self.provider_field,
            "ProviderEntityMapping provider_field",
        )
        _validate_non_empty_string(
            self.workspace_field,
            "ProviderEntityMapping workspace_field",
        )
        _validate_trust_signal(self.trust)


@dataclass(frozen=True)
class Provider:
    id: str
    kind: ProviderKind
    label: str
    workspace_id: str
    config: dict[str, str]
    mappings: tuple[ProviderEntityMapping, ...]
    attribution_actor: ActorKind
    created_at_ms: int

    def __post_init__(self) -> None:
        if not PROVIDER_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Provider id must match ^provider:[a-zA-Z0-9._-]+$")
        if not isinstance(self.kind, ProviderKind):
            raise ValueError("Provider kind must be a ProviderKind")
        _validate_non_empty_string(self.label, "Provider label")
        _validate_non_empty_string(self.workspace_id, "Provider workspace_id")

        for key in self.config:
            _validate_non_empty_string(key, "Provider config keys")

        mappings = tuple(self.mappings)
        object.__setattr__(self, "mappings", mappings)
        for mapping in mappings:
            if not isinstance(mapping, ProviderEntityMapping):
                raise ValueError(
                    "Provider mappings must contain ProviderEntityMapping entries"
                )

        if not isinstance(self.attribution_actor, ActorKind):
            raise ValueError("Provider attribution_actor must be an ActorKind")


@dataclass(frozen=True)
class ProviderConnection:
    provider_id: str
    health: ProviderHealthState
    last_successful_sync_ms: int | None
    last_failure_ms: int | None
    last_failure_reason: str | None
    pending_request_count: int

    def __post_init__(self) -> None:
        if not PROVIDER_ID_PATTERN.fullmatch(self.provider_id):
            raise ValueError(
                "ProviderConnection provider_id must match ^provider:[a-zA-Z0-9._-]+$"
            )
        if not isinstance(self.health, ProviderHealthState):
            raise ValueError("ProviderConnection health must be a ProviderHealthState")
        if self.pending_request_count < 0:
            raise ValueError(
                "ProviderConnection pending_request_count must be >= 0"
            )
