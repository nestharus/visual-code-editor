import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.ui_failure import (
    ALL_UI_FAILURE_KINDS,
    ALL_UI_FAILURE_SEVERITIES,
    UiFailure,
    UiFailureKind,
    UiFailureSeverity,
    ui_failure_kind_from_string,
    ui_failure_severity_from_string,
)


CONTRACT_UI_FAILURE_KINDS = (
    ("TEST_FAILURE", "test-failure"),
    ("RUNTIME_ERROR", "runtime-error"),
    ("A11Y_VIOLATION", "a11y-violation"),
    ("CONTRAST_VIOLATION", "contrast-violation"),
    ("RENDER_ERROR", "render-error"),
    ("PERFORMANCE_BUDGET", "performance-budget"),
)

CONTRACT_UI_FAILURE_SEVERITIES = (
    ("BLOCKER", "blocker"),
    ("CRITICAL", "critical"),
    ("MAJOR", "major"),
    ("MINOR", "minor"),
    ("INFO", "info"),
)

CONTRACT_UI_FAILURE_KIND_VALUES = tuple(
    value for _, value in CONTRACT_UI_FAILURE_KINDS
)
CONTRACT_UI_FAILURE_SEVERITY_VALUES = tuple(
    value for _, value in CONTRACT_UI_FAILURE_SEVERITIES
)


def _trust(
    state: TrustState = TrustState.GROUNDED,
    grounding: GroundingSource | None = GroundingSource.TEST,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _failure(**overrides) -> UiFailure:
    values = {
        "id": "ui-failure:checkout.submit.visual",
        "widget_id": "widget:checkout.submit-button",
        "screen_id": None,
        "variant_cell_id": None,
        "kind": UiFailureKind.TEST_FAILURE,
        "severity": UiFailureSeverity.MAJOR,
        "message": "Checkout submit button visual test failed",
        "evidence_url": "https://ci.example.test/reports/checkout-submit",
        "trust": _trust(),
        "attribution_actor": ActorKind.CI,
        "detected_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return UiFailure(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_UI_FAILURE_KINDS)
def test_ui_failure_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(UiFailureKind, member_name), (
        f"Enum membership invariant violated: UiFailureKind is missing {member_name}"
    )
    assert getattr(UiFailureKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"UiFailureKind.{member_name}.value must be {kind_value!r}"
    )


def test_ui_failure_kind_enum_contains_exactly_the_contract_members():
    assert len(ALL_UI_FAILURE_KINDS) == 6, (
        "Enum membership invariant violated: registry must expose 6 UI failure kinds"
    )
    assert (
        tuple(kind.value for kind in ALL_UI_FAILURE_KINDS)
        == CONTRACT_UI_FAILURE_KIND_VALUES
    ), (
        "Enum membership invariant violated: ALL_UI_FAILURE_KINDS must contain exactly "
        "the contract UI failure kinds in declaration order"
    )


@pytest.mark.parametrize(
    ("member_name", "severity_value"),
    CONTRACT_UI_FAILURE_SEVERITIES,
)
def test_ui_failure_severity_enum_contains_each_contract_member(
    member_name,
    severity_value,
):
    assert hasattr(UiFailureSeverity, member_name), (
        f"Enum membership invariant violated: UiFailureSeverity is missing {member_name}"
    )
    assert getattr(UiFailureSeverity, member_name).value == severity_value, (
        "String stability invariant violated: "
        f"UiFailureSeverity.{member_name}.value must be {severity_value!r}"
    )


def test_ui_failure_severity_enum_contains_exactly_the_contract_members():
    assert len(ALL_UI_FAILURE_SEVERITIES) == 5, (
        "Enum membership invariant violated: registry must expose 5 UI failure severities"
    )
    assert (
        tuple(severity.value for severity in ALL_UI_FAILURE_SEVERITIES)
        == CONTRACT_UI_FAILURE_SEVERITY_VALUES
    ), (
        "Enum membership invariant violated: ALL_UI_FAILURE_SEVERITIES must contain "
        "exactly the contract UI failure severities in declaration order"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_UI_FAILURE_KINDS)
def test_ui_failure_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert ui_failure_kind_from_string(kind_value) is getattr(
        UiFailureKind, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "test_failure",
        "TEST_FAILURE",
        "test-failure ",
        "error",
        "a11y",
    ),
)
def test_ui_failure_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        ui_failure_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    ("member_name", "severity_value"),
    CONTRACT_UI_FAILURE_SEVERITIES,
)
def test_ui_failure_severity_from_string_accepts_every_contract_value(
    member_name,
    severity_value,
):
    assert ui_failure_severity_from_string(severity_value) is getattr(
        UiFailureSeverity, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "BLOCKER",
        "major ",
        "warning",
        "error",
    ),
)
def test_ui_failure_severity_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        ui_failure_severity_from_string(invalid_value)


@pytest.mark.parametrize(
    "valid_id",
    (
        "ui-failure:a",
        "ui-failure:Checkout.Submit_01-visual",
    ),
)
def test_ui_failure_accepts_contract_id_pattern(valid_id):
    assert _failure(id=valid_id).id == valid_id


@pytest.mark.parametrize(
    "invalid_id",
    (
        "",
        "ui_failure:a",
        "ui-failure:",
        "ui-failure:has space",
        "ui-failure:bad/slash",
        "failure:a",
    ),
)
def test_ui_failure_rejects_ids_outside_contract_pattern(invalid_id):
    with pytest.raises(ValueError):
        _failure(id=invalid_id)


def test_ui_failure_requires_at_least_one_anchor():
    with pytest.raises(ValueError):
        _failure(widget_id=None, screen_id=None, variant_cell_id=None)


@pytest.mark.parametrize(
    "anchor_overrides",
    (
        {
            "widget_id": "widget:checkout.submit-button",
            "screen_id": None,
            "variant_cell_id": None,
        },
        {"widget_id": None, "screen_id": "screen:checkout", "variant_cell_id": None},
        {
            "widget_id": None,
            "screen_id": None,
            "variant_cell_id": "variant-cell:checkout.dark",
        },
    ),
)
def test_ui_failure_accepts_each_anchor_field(anchor_overrides):
    assert _failure(**anchor_overrides)


def test_ui_failure_requires_non_empty_message():
    with pytest.raises(ValueError):
        _failure(message="")


def test_ui_failure_preserves_transitive_trust_signal():
    trust = _trust(state=TrustState.GROUNDED, grounding=GroundingSource.TEST)

    failure = _failure(trust=trust)

    assert failure.trust is trust


def test_ui_failure_rejects_transitively_invalid_trust_signal():
    with pytest.raises(ValueError):
        _failure(
            trust=TrustSignal(
                state=TrustState.CANDIDATE,
                grounding=GroundingSource.TEST,
            )
        )
