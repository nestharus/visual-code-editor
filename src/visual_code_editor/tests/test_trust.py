import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.trust import (
    ALL_GROUNDING_SOURCES,
    ALL_TRUST_STATES,
    GroundingSource,
    TrustSignal,
    TrustState,
    grounding_source_from_string,
    trust_state_from_string,
)


CONTRACT_TRUST_STATES = (
    ("GROUNDED", "grounded"),
    ("CANDIDATE", "candidate"),
    ("CONFLICTING", "conflicting"),
    ("STALE", "stale"),
    ("ORPHANED", "orphaned"),
)

CONTRACT_GROUNDING_SOURCES = (
    ("TEST", "test"),
    ("LSP_TYPE", "lsp-type"),
    ("RUNTIME_TRACE", "runtime-trace"),
    ("ANNOTATION", "annotation"),
    ("USER_CONFIRMED", "user-confirmed"),
    ("PROVIDER_VERIFIED", "provider-verified"),
)

CONTRACT_TRUST_VALUES = tuple(value for _, value in CONTRACT_TRUST_STATES)
CONTRACT_GROUNDING_VALUES = tuple(value for _, value in CONTRACT_GROUNDING_SOURCES)
UNGROUNDED_STATES = (
    "CANDIDATE",
    "CONFLICTING",
    "STALE",
    "ORPHANED",
)
FORBIDDEN_VOCABULARY = (
    "pending",
    "unsynced",
    "degraded",
    "partial",
    "local",
    "ok",
    "error",
)


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_TRUST_STATES)
def test_trust_state_enum_contains_each_contract_member(member_name, state_value):
    assert hasattr(TrustState, member_name), (
        f"Enum membership invariant violated: TrustState is missing {member_name}"
    )
    assert getattr(TrustState, member_name).value == state_value, (
        f"Stability invariant violated: TrustState.{member_name}.value must be {state_value!r}"
    )


@pytest.mark.parametrize(("member_name", "source_value"), CONTRACT_GROUNDING_SOURCES)
def test_grounding_source_enum_contains_each_contract_member(member_name, source_value):
    assert hasattr(GroundingSource, member_name), (
        f"Enum membership invariant violated: GroundingSource is missing {member_name}"
    )
    assert getattr(GroundingSource, member_name).value == source_value, (
        "Stability invariant violated: "
        f"GroundingSource.{member_name}.value must be {source_value!r}"
    )


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_TRUST_STATES)
def test_trust_state_from_string_accepts_every_contract_value(member_name, state_value):
    assert trust_state_from_string(state_value) is getattr(TrustState, member_name), (
        f"trust_state_from_string strictness invariant violated: {state_value!r} must parse "
        f"to TrustState.{member_name}"
    )


@pytest.mark.parametrize(("member_name", "source_value"), CONTRACT_GROUNDING_SOURCES)
def test_grounding_source_from_string_accepts_every_contract_value(
    member_name,
    source_value,
):
    assert grounding_source_from_string(source_value) is getattr(GroundingSource, member_name), (
        "grounding_source_from_string strictness invariant violated: "
        f"{source_value!r} must parse to GroundingSource.{member_name}"
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "expired",
        "inferred",
        "GROUNDED",
        "grounded ",
    ),
)
def test_trust_state_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        trust_state_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "expired",
        "inferred",
        "TEST",
        "runtime_trace",
    ),
)
def test_grounding_source_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        grounding_source_from_string(invalid_value)


def test_all_trust_states_order_matches_contract_order():
    assert tuple(state.value for state in ALL_TRUST_STATES) == CONTRACT_TRUST_VALUES, (
        "ALL_TRUST_STATES order invariant violated: tuple must match the contract "
        "declaration order"
    )


def test_all_grounding_sources_order_matches_contract_order():
    assert tuple(source.value for source in ALL_GROUNDING_SOURCES) == CONTRACT_GROUNDING_VALUES, (
        "ALL_GROUNDING_SOURCES order invariant violated: tuple must match the contract "
        "declaration order"
    )


def test_all_trust_states_contains_exactly_the_contract_members():
    assert len(ALL_TRUST_STATES) == 5, (
        "Enum membership invariant violated: registry must expose 5 trust states"
    )
    assert set(state.value for state in ALL_TRUST_STATES) == set(CONTRACT_TRUST_VALUES), (
        "Enum membership invariant violated: ALL_TRUST_STATES must contain exactly the "
        "contract trust states"
    )


def test_all_grounding_sources_contains_exactly_the_contract_members():
    assert len(ALL_GROUNDING_SOURCES) == 6, (
        "Enum membership invariant violated: registry must expose 6 grounding sources"
    )
    assert set(source.value for source in ALL_GROUNDING_SOURCES) == set(
        CONTRACT_GROUNDING_VALUES
    ), (
        "Enum membership invariant violated: ALL_GROUNDING_SOURCES must contain exactly the "
        "contract grounding sources"
    )


def test_grounded_trust_signal_requires_grounding():
    with pytest.raises(ValueError):
        TrustSignal(state=TrustState.GROUNDED, grounding=None)


@pytest.mark.parametrize(("source_name", "_source_value"), CONTRACT_GROUNDING_SOURCES)
def test_grounded_trust_signal_accepts_every_grounding_source(source_name, _source_value):
    source = getattr(GroundingSource, source_name)

    signal = TrustSignal(state=TrustState.GROUNDED, grounding=source)

    assert signal.state is TrustState.GROUNDED
    assert signal.grounding is source


@pytest.mark.parametrize("state_name", UNGROUNDED_STATES)
def test_ungrounded_trust_signal_accepts_no_grounding(state_name):
    state = getattr(TrustState, state_name)

    signal = TrustSignal(state=state, grounding=None)

    assert signal.state is state
    assert signal.grounding is None


@pytest.mark.parametrize("state_name", UNGROUNDED_STATES)
@pytest.mark.parametrize(("source_name", "_source_value"), CONTRACT_GROUNDING_SOURCES)
def test_ungrounded_trust_signal_rejects_every_grounding_source(
    state_name,
    source_name,
    _source_value,
):
    state = getattr(TrustState, state_name)
    source = getattr(GroundingSource, source_name)

    with pytest.raises(ValueError):
        TrustSignal(state=state, grounding=source)


@pytest.mark.parametrize("forbidden_value", FORBIDDEN_VOCABULARY)
def test_forbidden_vocabulary_is_not_a_trust_state(forbidden_value):
    with pytest.raises(ValueError):
        trust_state_from_string(forbidden_value)


@pytest.mark.parametrize("forbidden_value", FORBIDDEN_VOCABULARY)
def test_forbidden_vocabulary_is_not_a_grounding_source(forbidden_value):
    with pytest.raises(ValueError):
        grounding_source_from_string(forbidden_value)
