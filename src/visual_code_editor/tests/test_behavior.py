import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import (
    BEHAVIOR_ID_PATTERN,
    Behavior,
    BehaviorSliceRole,
    BehaviorSourceSlice,
    behavior_slice_role_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_BEHAVIOR_SLICE_ROLES = (
    ("ENTRY_POINT", "entry-point"),
    ("BODY", "body"),
    ("EXIT", "exit"),
    ("ERROR_PATH", "error-path"),
    ("TEST", "test"),
    ("FIXTURE", "fixture"),
    ("ANNOTATION", "annotation"),
    ("GUARD", "guard"),
    ("TELEMETRY", "telemetry"),
)

CONTRACT_ROLE_VALUES = tuple(value for _, value in CONTRACT_BEHAVIOR_SLICE_ROLES)


def _trust(
    state: TrustState = TrustState.CANDIDATE,
    grounding: GroundingSource | None = None,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _slice(**overrides) -> BehaviorSourceSlice:
    values = {
        "file_path": "app/auth/session.ts",
        "start_line": 10,
        "end_line": 14,
        "start_col": None,
        "end_col": None,
        "slice_role": BehaviorSliceRole.BODY,
        "discovered_by": ActorKind.GENERATOR,
        "confirmed_by": None,
    }
    values.update(overrides)
    return BehaviorSourceSlice(**values)


def _behavior(**overrides) -> Behavior:
    values = {
        "id": "behavior:auth.validate-token",
        "label": "Validate token",
        "description": "Confirms a request token before session access.",
        "source_slices": (_slice(),),
        "trust": _trust(),
        "parent_behavior_id": None,
        "attribution_actor": ActorKind.GENERATOR,
    }
    values.update(overrides)
    return Behavior(**values)


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_BEHAVIOR_SLICE_ROLES)
def test_behavior_slice_role_enum_contains_each_contract_member(member_name, role_value):
    assert hasattr(BehaviorSliceRole, member_name), (
        f"Enum membership invariant violated: BehaviorSliceRole is missing {member_name}"
    )
    assert getattr(BehaviorSliceRole, member_name).value == role_value, (
        "Stability invariant violated: "
        f"BehaviorSliceRole.{member_name}.value must be {role_value!r}"
    )


def test_behavior_slice_role_enum_contains_exactly_the_contract_members():
    assert len(BehaviorSliceRole) == 9, (
        "Enum membership invariant violated: BehaviorSliceRole must expose 9 roles"
    )
    assert tuple(role.value for role in BehaviorSliceRole) == CONTRACT_ROLE_VALUES, (
        "Enum membership invariant violated: BehaviorSliceRole must contain exactly the "
        "contract roles"
    )


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_BEHAVIOR_SLICE_ROLES)
def test_behavior_slice_role_from_string_accepts_every_contract_value(
    member_name,
    role_value,
):
    assert behavior_slice_role_from_string(role_value) is getattr(
        BehaviorSliceRole, member_name
    ), (
        "behavior_slice_role_from_string strictness invariant violated: "
        f"{role_value!r} must parse to BehaviorSliceRole.{member_name}"
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "entry_point",
        "ENTRY_POINT",
        "body ",
        "happy-path",
        "error",
    ),
)
def test_behavior_slice_role_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        behavior_slice_role_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"file_path": ""},
        {"start_line": 0},
        {"start_line": -1},
        {"start_line": 4, "end_line": 3},
        {"start_col": 1, "end_col": None},
        {"start_col": None, "end_col": 1},
        {"start_col": 0, "end_col": 1},
        {"start_col": 1, "end_col": 0},
        {"start_line": 4, "end_line": 4, "start_col": 8, "end_col": 7},
        {"discovered_by": "generator"},
        {"confirmed_by": "generator"},
    ),
)
def test_behavior_source_slice_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _slice(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"start_col": None, "end_col": None},
        {"start_line": 4, "end_line": 4, "start_col": 2, "end_col": 2},
        {"start_line": 4, "end_line": 4, "start_col": 2, "end_col": 9},
        {"start_line": 4, "end_line": 5, "start_col": 9, "end_col": 2},
        {"confirmed_by": ActorKind.YOU_THIS_SESSION},
    ),
)
def test_behavior_source_slice_validation_matrix_accepts_valid_values(overrides):
    source_slice = _slice(**overrides)

    assert source_slice.file_path == "app/auth/session.ts"
    assert source_slice.discovered_by is ActorKind.GENERATOR


@pytest.mark.parametrize(
    "overrides",
    (
        {"id": ""},
        {"id": "auth.validate-token"},
        {"id": "behavior:"},
        {"id": "behavior:has spaces"},
        {"id": "behavior:has/slash"},
        {"label": ""},
        {"source_slices": ()},
        {"parent_behavior_id": "auth.parent"},
        {"parent_behavior_id": "behavior:"},
        {"attribution_actor": "generator"},
    ),
)
def test_behavior_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _behavior(**overrides)


def test_behavior_validation_allows_repeated_file_paths_across_source_slices():
    behavior = _behavior(
        source_slices=(
            _slice(start_line=1, end_line=3, slice_role=BehaviorSliceRole.ENTRY_POINT),
            _slice(start_line=8, end_line=12, slice_role=BehaviorSliceRole.BODY),
        ),
    )

    assert tuple(source_slice.file_path for source_slice in behavior.source_slices) == (
        "app/auth/session.ts",
        "app/auth/session.ts",
    )


@pytest.mark.parametrize(
    "behavior_id",
    (
        "behavior:auth.validate-token",
        "behavior:Foo_Bar",
        "behavior:a",
    ),
)
def test_behavior_id_pattern_accepts_contract_values(behavior_id):
    assert BEHAVIOR_ID_PATTERN.fullmatch(behavior_id)
    assert _behavior(id=behavior_id).id == behavior_id


@pytest.mark.parametrize(
    "behavior_id",
    (
        "auth.validate-token",
        "behavior:",
        "behavior:has spaces",
        "behavior:has/slash",
    ),
)
def test_behavior_id_pattern_rejects_contract_values(behavior_id):
    assert not BEHAVIOR_ID_PATTERN.fullmatch(behavior_id)
    with pytest.raises(ValueError):
        _behavior(id=behavior_id)


def test_behavior_reasserts_grounded_trust_requires_grounding():
    invalid_grounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_grounded, "state", TrustState.GROUNDED)
    object.__setattr__(invalid_grounded, "grounding", None)

    with pytest.raises(ValueError):
        _behavior(trust=invalid_grounded)


def test_behavior_accepts_grounded_trust_with_grounding():
    behavior = _behavior(
        trust=_trust(TrustState.GROUNDED, GroundingSource.TEST),
    )

    assert behavior.trust.state is TrustState.GROUNDED
    assert behavior.trust.grounding is GroundingSource.TEST
