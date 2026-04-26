import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.overlay import (
    OperationalOverlay,
    OverlayLayer,
    OverlayProviderId,
    OverlaySignal,
    OverlaySignalKind,
    overlay_provider_id_from_string,
    overlay_signal_kind_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_OVERLAY_PROVIDER_IDS = (
    ("TEST_STATUS", "g:test"),
    ("PR_DELTA", "g:pr-delta"),
    ("DEPLOY_STATE", "g:deploy"),
    ("RUNTIME_PROFILE", "g:profile"),
    ("TASK_ACTIVE", "g:task-active"),
)

CONTRACT_OVERLAY_SIGNAL_KINDS = (
    ("PASS", "pass"),
    ("FAIL", "fail"),
    ("IN_PROGRESS", "in-progress"),
    ("STALE", "stale"),
    ("INFO", "info"),
)

CONTRACT_OVERLAY_PROVIDER_ID_VALUES = tuple(
    value for _, value in CONTRACT_OVERLAY_PROVIDER_IDS
)
CONTRACT_OVERLAY_SIGNAL_KIND_VALUES = tuple(
    value for _, value in CONTRACT_OVERLAY_SIGNAL_KINDS
)


def _trust(
    state: TrustState = TrustState.GROUNDED,
    grounding: GroundingSource | None = GroundingSource.RUNTIME_TRACE,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _signal(**overrides) -> OverlaySignal:
    values = {
        "provider_id": OverlayProviderId.TEST_STATUS,
        "entity_id": "behavior:auth.login",
        "kind": OverlaySignalKind.FAIL,
        "label": "1 failing test",
        "trust": _trust(),
        "emitted_at_ms": 1_700_000_000_000,
        "detail_url": "https://ci.example.test/runs/123",
    }
    values.update(overrides)
    return OverlaySignal(**values)


def _layer(**overrides) -> OverlayLayer:
    provider_id = overrides.get("provider_id", OverlayProviderId.TEST_STATUS)
    values = {
        "provider_id": provider_id,
        "signals": (
            _signal(provider_id=provider_id, entity_id="behavior:auth.login"),
            _signal(provider_id=provider_id, entity_id="behavior:checkout.submit"),
        ),
        "computed_at_ms": 1_700_000_000_500,
        "attribution_actor": ActorKind.CI,
    }
    values.update(overrides)
    return OverlayLayer(**values)


def _overlay(**overrides) -> OperationalOverlay:
    values = {
        "layers": (
            _layer(provider_id=OverlayProviderId.TEST_STATUS),
            _layer(
                provider_id=OverlayProviderId.DEPLOY_STATE,
                signals=(
                    _signal(
                        provider_id=OverlayProviderId.DEPLOY_STATE,
                        entity_id="system:api",
                        kind=OverlaySignalKind.PASS,
                        label="Production healthy",
                    ),
                ),
                attribution_actor=ActorKind.GENERATOR,
            ),
        ),
        "computed_at_ms": 1_700_000_001_000,
    }
    values.update(overrides)
    return OperationalOverlay(**values)


@pytest.mark.parametrize(
    ("member_name", "provider_id_value"),
    CONTRACT_OVERLAY_PROVIDER_IDS,
)
def test_overlay_provider_id_enum_contains_each_contract_member(
    member_name,
    provider_id_value,
):
    assert hasattr(OverlayProviderId, member_name), (
        f"Enum membership invariant violated: OverlayProviderId is missing {member_name}"
    )
    assert getattr(OverlayProviderId, member_name).value == provider_id_value, (
        "String stability invariant violated: "
        f"OverlayProviderId.{member_name}.value must be {provider_id_value!r}"
    )


def test_overlay_provider_id_enum_contains_exactly_the_contract_members():
    assert len(OverlayProviderId) == 5, (
        "Enum membership invariant violated: OverlayProviderId must expose 5 ids"
    )
    assert (
        tuple(provider_id.value for provider_id in OverlayProviderId)
        == CONTRACT_OVERLAY_PROVIDER_ID_VALUES
    ), (
        "Enum membership invariant violated: OverlayProviderId must contain exactly "
        "the contract ids"
    )


@pytest.mark.parametrize(
    ("member_name", "signal_kind_value"),
    CONTRACT_OVERLAY_SIGNAL_KINDS,
)
def test_overlay_signal_kind_enum_contains_each_contract_member(
    member_name,
    signal_kind_value,
):
    assert hasattr(OverlaySignalKind, member_name), (
        f"Enum membership invariant violated: OverlaySignalKind is missing {member_name}"
    )
    assert getattr(OverlaySignalKind, member_name).value == signal_kind_value, (
        "String stability invariant violated: "
        f"OverlaySignalKind.{member_name}.value must be {signal_kind_value!r}"
    )


def test_overlay_signal_kind_enum_contains_exactly_the_contract_members():
    assert len(OverlaySignalKind) == 5, (
        "Enum membership invariant violated: OverlaySignalKind must expose 5 kinds"
    )
    assert (
        tuple(signal_kind.value for signal_kind in OverlaySignalKind)
        == CONTRACT_OVERLAY_SIGNAL_KIND_VALUES
    ), (
        "Enum membership invariant violated: OverlaySignalKind must contain exactly "
        "the contract kinds"
    )


@pytest.mark.parametrize(
    ("member_name", "provider_id_value"),
    CONTRACT_OVERLAY_PROVIDER_IDS,
)
def test_overlay_provider_id_from_string_accepts_every_contract_value(
    member_name,
    provider_id_value,
):
    assert overlay_provider_id_from_string(provider_id_value) is getattr(
        OverlayProviderId, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "g:tests",
        "G:test",
        "g:test ",
        "test",
        "g:runtime-profile",
    ),
)
def test_overlay_provider_id_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        overlay_provider_id_from_string(invalid_value)


@pytest.mark.parametrize(
    ("member_name", "signal_kind_value"),
    CONTRACT_OVERLAY_SIGNAL_KINDS,
)
def test_overlay_signal_kind_from_string_accepts_every_contract_value(
    member_name,
    signal_kind_value,
):
    assert overlay_signal_kind_from_string(signal_kind_value) is getattr(
        OverlaySignalKind, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "PASS",
        "in_progress",
        "in-progress ",
        "warning",
        "error",
    ),
)
def test_overlay_signal_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        overlay_signal_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"label": ""},
        {"emitted_at_ms": -1},
    ),
)
def test_overlay_signal_validation_rejects_contract_invalid_values(overrides):
    with pytest.raises(ValueError):
        _signal(**overrides)


def test_overlay_layer_rejects_out_of_order_signals_by_entity_id():
    with pytest.raises(ValueError):
        _layer(
            signals=(
                _signal(entity_id="behavior:z"),
                _signal(entity_id="behavior:a"),
            )
        )


def test_overlay_layer_rejects_duplicate_provider_entity_signals():
    with pytest.raises(ValueError):
        _layer(
            signals=(
                _signal(entity_id="behavior:auth.login", kind=OverlaySignalKind.FAIL),
                _signal(entity_id="behavior:auth.login", kind=OverlaySignalKind.PASS),
            )
        )


def test_operational_overlay_rejects_duplicate_provider_layers():
    with pytest.raises(ValueError):
        _overlay(
            layers=(
                _layer(provider_id=OverlayProviderId.TEST_STATUS),
                _layer(provider_id=OverlayProviderId.TEST_STATUS),
            )
        )
