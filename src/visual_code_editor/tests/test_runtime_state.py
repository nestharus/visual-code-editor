import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.runtime_state import (
    RUNTIME_STATE_CAPTURE_ID_PATTERN,
    RuntimeStateCapture,
    RuntimeStateKind,
    RuntimeStateNode,
    RuntimeStateNodeKind,
    runtime_state_kind_from_string,
    runtime_state_node_kind_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_RUNTIME_STATE_KINDS = (
    ("COMPONENT_TREE", "component-tree"),
    ("PROPS_ONLY", "props-only"),
    ("SIGNAL_GRAPH", "signal-graph"),
    ("NETWORK_LOG", "network-log"),
    ("CONSOLE_LOG", "console-log"),
    ("DOM_SNAPSHOT", "dom-snapshot"),
)

CONTRACT_RUNTIME_STATE_NODE_KINDS = (
    ("COMPONENT", "component"),
    ("ELEMENT", "element"),
    ("TEXT", "text"),
    ("FRAGMENT", "fragment"),
    ("PORTAL", "portal"),
)

CONTRACT_RUNTIME_STATE_KIND_VALUES = tuple(
    value for _, value in CONTRACT_RUNTIME_STATE_KINDS
)
CONTRACT_RUNTIME_STATE_NODE_KIND_VALUES = tuple(
    value for _, value in CONTRACT_RUNTIME_STATE_NODE_KINDS
)


def _trust() -> TrustSignal:
    return TrustSignal(state=TrustState.CANDIDATE, grounding=None)


def _node(**overrides) -> RuntimeStateNode:
    values = {
        "kind": RuntimeStateNodeKind.COMPONENT,
        "name": "GraphCanvas",
        "props_summary": "nodes=12 edges=18",
        "children_count": 3,
    }
    values.update(overrides)
    return RuntimeStateNode(**values)


def _capture(**overrides) -> RuntimeStateCapture:
    values = {
        "id": "runtime-capture:graph.canvas.1700000000000",
        "widget_id": "widget:graph.canvas",
        "screen_id": None,
        "kind": RuntimeStateKind.COMPONENT_TREE,
        "nodes": (_node(),),
        "raw_payload_path": None,
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
        "captured_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return RuntimeStateCapture(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_RUNTIME_STATE_KINDS)
def test_runtime_state_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(RuntimeStateKind, member_name), (
        f"Enum membership invariant violated: RuntimeStateKind is missing {member_name}"
    )
    assert getattr(RuntimeStateKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"RuntimeStateKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_RUNTIME_STATE_NODE_KINDS,
)
def test_runtime_state_node_kind_enum_contains_each_contract_member(
    member_name,
    kind_value,
):
    assert hasattr(RuntimeStateNodeKind, member_name), (
        "Enum membership invariant violated: "
        f"RuntimeStateNodeKind is missing {member_name}"
    )
    assert getattr(RuntimeStateNodeKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"RuntimeStateNodeKind.{member_name}.value must be {kind_value!r}"
    )


def test_runtime_state_enums_contain_exactly_the_contract_members():
    assert len(RuntimeStateKind) == 6, (
        "Enum membership invariant violated: RuntimeStateKind must expose 6 kinds"
    )
    assert (
        tuple(kind.value for kind in RuntimeStateKind)
        == CONTRACT_RUNTIME_STATE_KIND_VALUES
    )

    assert len(RuntimeStateNodeKind) == 5, (
        "Enum membership invariant violated: RuntimeStateNodeKind must expose 5 kinds"
    )
    assert (
        tuple(kind.value for kind in RuntimeStateNodeKind)
        == CONTRACT_RUNTIME_STATE_NODE_KIND_VALUES
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_RUNTIME_STATE_KINDS)
def test_runtime_state_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert runtime_state_kind_from_string(kind_value) is getattr(
        RuntimeStateKind,
        member_name,
    )


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_RUNTIME_STATE_NODE_KINDS,
)
def test_runtime_state_node_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert runtime_state_node_kind_from_string(kind_value) is getattr(
        RuntimeStateNodeKind,
        member_name,
    )


@pytest.mark.parametrize(
    "invalid_value",
    ("", "COMPONENT_TREE", "component_tree", "component-tree ", "screen"),
)
def test_runtime_state_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        runtime_state_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "COMPONENT", "component ", "component-tree", "node"),
)
def test_runtime_state_node_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        runtime_state_node_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "capture_id",
    (
        "runtime-capture:graph.canvas",
        "runtime-capture:Screen_123",
        "runtime-capture:system-card.1700000000000",
    ),
)
def test_runtime_state_capture_id_pattern_accepts_contract_values(capture_id):
    assert RUNTIME_STATE_CAPTURE_ID_PATTERN.fullmatch(capture_id)
    assert _capture(id=capture_id).id == capture_id


@pytest.mark.parametrize(
    "capture_id",
    (
        "",
        "graph.canvas",
        "runtime-capture:",
        "Runtime-capture:graph",
        "runtime-capture:has spaces",
        "runtime-capture:graph/canvas",
    ),
)
def test_runtime_state_capture_id_pattern_rejects_invalid_values(capture_id):
    assert not RUNTIME_STATE_CAPTURE_ID_PATTERN.fullmatch(capture_id)
    with pytest.raises(ValueError):
        _capture(id=capture_id)


@pytest.mark.parametrize(
    ("widget_id", "screen_id"),
    (
        ("widget:graph.canvas", None),
        (None, "screen:overview"),
        ("widget:graph.canvas", "screen:overview"),
    ),
)
def test_runtime_state_capture_requires_at_least_one_anchor(widget_id, screen_id):
    capture = _capture(widget_id=widget_id, screen_id=screen_id)

    assert capture.widget_id == widget_id
    assert capture.screen_id == screen_id


def test_runtime_state_capture_rejects_missing_anchor():
    with pytest.raises(ValueError):
        _capture(widget_id=None, screen_id=None)


@pytest.mark.parametrize(
    "overrides",
    (
        {"name": ""},
        {"name": "   "},
        {"props_summary": ""},
        {"props_summary": "   "},
    ),
)
def test_runtime_state_node_requires_non_empty_name_and_props_summary(overrides):
    with pytest.raises(ValueError):
        _node(**overrides)


def test_runtime_state_node_children_count_must_be_non_negative():
    assert _node(children_count=0).children_count == 0

    with pytest.raises(ValueError):
        _node(children_count=-1)


def test_runtime_state_capture_reasserts_trust_grounding_iff_grounded():
    valid_grounded = TrustSignal(
        state=TrustState.GROUNDED,
        grounding=GroundingSource.USER_CONFIRMED,
    )
    assert _capture(trust=valid_grounded).trust is valid_grounded

    invalid_grounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_grounded, "state", TrustState.GROUNDED)
    object.__setattr__(invalid_grounded, "grounding", None)

    invalid_ungrounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_ungrounded, "state", TrustState.CANDIDATE)
    object.__setattr__(invalid_ungrounded, "grounding", GroundingSource.TEST)

    with pytest.raises(ValueError):
        _capture(trust=invalid_grounded)
    with pytest.raises(ValueError):
        _capture(trust=invalid_ungrounded)
