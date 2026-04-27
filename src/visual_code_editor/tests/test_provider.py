import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.provider import (
    PROVIDER_ID_PATTERN,
    Provider,
    ProviderConnection,
    ProviderEntityMapping,
    ProviderHealthState,
    ProviderKind,
    provider_health_state_from_string,
    provider_kind_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_PROVIDER_KINDS = (
    ("GITHUB", "github"),
    ("GITLAB", "gitlab"),
    ("JIRA", "jira"),
    ("LINEAR", "linear"),
    ("GENERIC_HTTP", "generic-http"),
)

CONTRACT_PROVIDER_HEALTH_STATES = (
    ("GROUNDED", "grounded"),
    ("STALE", "stale"),
    ("CONFLICTING", "conflicting"),
)

CONTRACT_PROVIDER_KIND_VALUES = tuple(value for _, value in CONTRACT_PROVIDER_KINDS)
CONTRACT_PROVIDER_HEALTH_VALUES = tuple(
    value for _, value in CONTRACT_PROVIDER_HEALTH_STATES
)


def _mapping(**overrides) -> ProviderEntityMapping:
    values = {
        "provider_field": "issue.state",
        "workspace_field": "behaviour.lifecycle_state",
        "trust": TrustSignal(state=TrustState.CANDIDATE, grounding=None),
        "evidence_source": "github issue state",
    }
    values.update(overrides)
    return ProviderEntityMapping(**values)


def _provider(**overrides) -> Provider:
    values = {
        "id": "provider:github-main",
        "kind": ProviderKind.GITHUB,
        "label": "GitHub main repository",
        "workspace_id": "workspace:main",
        "config": {"full_name": "example/repo"},
        "mappings": (_mapping(),),
        "attribution_actor": ActorKind.YOU_THIS_SESSION,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Provider(**values)


def _connection(**overrides) -> ProviderConnection:
    values = {
        "provider_id": "provider:github-main",
        "health": ProviderHealthState.GROUNDED,
        "last_successful_sync_ms": 1_700_000_001_000,
        "last_failure_ms": None,
        "last_failure_reason": None,
        "pending_request_count": 0,
    }
    values.update(overrides)
    return ProviderConnection(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_PROVIDER_KINDS)
def test_provider_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(ProviderKind, member_name), (
        f"Enum membership invariant violated: ProviderKind is missing {member_name}"
    )
    assert getattr(ProviderKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"ProviderKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(
    ("member_name", "health_value"),
    CONTRACT_PROVIDER_HEALTH_STATES,
)
def test_provider_health_state_enum_contains_each_contract_member(
    member_name,
    health_value,
):
    assert hasattr(ProviderHealthState, member_name), (
        "Enum membership invariant violated: "
        f"ProviderHealthState is missing {member_name}"
    )
    assert getattr(ProviderHealthState, member_name).value == health_value, (
        "String stability invariant violated: "
        f"ProviderHealthState.{member_name}.value must be {health_value!r}"
    )


def test_provider_kind_enum_contains_exactly_the_contract_members():
    assert len(ProviderKind) == 5, (
        "Enum membership invariant violated: ProviderKind must expose 5 kinds"
    )
    assert tuple(kind.value for kind in ProviderKind) == CONTRACT_PROVIDER_KIND_VALUES, (
        "Enum membership invariant violated: ProviderKind must contain exactly the "
        "contract kinds"
    )


def test_provider_health_state_enum_contains_exactly_the_contract_members():
    assert len(ProviderHealthState) == 3, (
        "Enum membership invariant violated: ProviderHealthState must expose 3 states"
    )
    assert (
        tuple(state.value for state in ProviderHealthState)
        == CONTRACT_PROVIDER_HEALTH_VALUES
    ), (
        "Enum membership invariant violated: ProviderHealthState must contain exactly "
        "the contract states"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_PROVIDER_KINDS)
def test_provider_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert provider_kind_from_string(kind_value) is getattr(ProviderKind, member_name)


@pytest.mark.parametrize(
    ("member_name", "health_value"),
    CONTRACT_PROVIDER_HEALTH_STATES,
)
def test_provider_health_state_from_string_accepts_every_contract_value(
    member_name,
    health_value,
):
    assert provider_health_state_from_string(health_value) is getattr(
        ProviderHealthState,
        member_name,
    )


@pytest.mark.parametrize(
    "invalid_value",
    ("", "GITHUB", "generic_http", "generic-http ", "bitbucket"),
)
def test_provider_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        provider_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "GROUNDED", "healthy", "grounded ", "orphaned"),
)
def test_provider_health_state_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        provider_health_state_from_string(invalid_value)


@pytest.mark.parametrize(
    "provider_id",
    (
        "provider:github-main",
        "provider:github.repo_123",
        "provider:GHE-prod",
    ),
)
def test_provider_id_pattern_accepts_contract_values(provider_id):
    assert PROVIDER_ID_PATTERN.fullmatch(provider_id)
    assert _provider(id=provider_id).id == provider_id


@pytest.mark.parametrize(
    "provider_id",
    (
        "",
        "github-main",
        "provider:",
        "Provider:github",
        "provider:has spaces",
        "provider:github/repo",
    ),
)
def test_provider_id_pattern_rejects_invalid_values(provider_id):
    assert not PROVIDER_ID_PATTERN.fullmatch(provider_id)
    with pytest.raises(ValueError):
        _provider(id=provider_id)


@pytest.mark.parametrize(
    "overrides",
    (
        {"label": ""},
        {"label": "   "},
        {"workspace_id": ""},
        {"workspace_id": "   "},
    ),
)
def test_provider_validation_rejects_empty_label_and_workspace_id(overrides):
    with pytest.raises(ValueError):
        _provider(**overrides)


@pytest.mark.parametrize(
    "config",
    (
        {"": "example/repo"},
        {"   ": "example/repo"},
        {1: "example/repo"},
    ),
)
def test_provider_validation_rejects_non_empty_string_config_key_invariant(config):
    with pytest.raises(ValueError):
        _provider(config=config)


@pytest.mark.parametrize(
    "overrides",
    (
        {"provider_field": ""},
        {"provider_field": "   "},
        {"workspace_field": ""},
        {"workspace_field": "   "},
    ),
)
def test_provider_entity_mapping_validation_rejects_empty_fields(overrides):
    with pytest.raises(ValueError):
        _mapping(**overrides)


def test_provider_entity_mapping_uses_trust_signal_iff_grounding_invariant():
    grounded = _mapping(
        trust=TrustSignal(
            state=TrustState.GROUNDED,
            grounding=GroundingSource.PROVIDER_VERIFIED,
        )
    )

    assert grounded.trust.state is TrustState.GROUNDED
    assert grounded.trust.grounding is GroundingSource.PROVIDER_VERIFIED

    with pytest.raises(ValueError):
        _mapping(trust=TrustSignal(state=TrustState.GROUNDED, grounding=None))


def test_provider_connection_validation_rejects_negative_pending_request_count():
    with pytest.raises(ValueError):
        _connection(pending_request_count=-1)
