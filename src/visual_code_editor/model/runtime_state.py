"""Runtime UI state capture schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.screen import SCREEN_ID_PATTERN
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import WIDGET_ID_PATTERN


RUNTIME_STATE_CAPTURE_ID_PATTERN = re.compile(
    r"^runtime-capture:[a-zA-Z0-9._-]+$"
)


class RuntimeStateKind(str, Enum):
    COMPONENT_TREE = "component-tree"
    PROPS_ONLY = "props-only"
    SIGNAL_GRAPH = "signal-graph"
    NETWORK_LOG = "network-log"
    CONSOLE_LOG = "console-log"
    DOM_SNAPSHOT = "dom-snapshot"


class RuntimeStateNodeKind(str, Enum):
    COMPONENT = "component"
    ELEMENT = "element"
    TEXT = "text"
    FRAGMENT = "fragment"
    PORTAL = "portal"


def runtime_state_kind_from_string(value: str) -> RuntimeStateKind:
    try:
        return RuntimeStateKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown runtime state kind: {value}") from exc


def runtime_state_node_kind_from_string(value: str) -> RuntimeStateNodeKind:
    try:
        return RuntimeStateNodeKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown runtime state node kind: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal, owner: str) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError(f"{owner} trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError(f"{owner} trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(f"{owner} trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


def _require_non_negative_int(value: int, field_name: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if value < 0:
        raise ValueError(f"{field_name} must be >= 0")


@dataclass(frozen=True)
class RuntimeStateNode:
    kind: RuntimeStateNodeKind
    name: str
    props_summary: str
    children_count: int

    def __post_init__(self) -> None:
        if not isinstance(self.kind, RuntimeStateNodeKind):
            raise ValueError("RuntimeStateNode kind must be a RuntimeStateNodeKind")
        _validate_non_empty_string(self.name, "RuntimeStateNode name")
        _validate_non_empty_string(
            self.props_summary,
            "RuntimeStateNode props_summary",
        )
        _require_non_negative_int(
            self.children_count,
            "RuntimeStateNode children_count",
        )


@dataclass(frozen=True)
class RuntimeStateCapture:
    id: str
    widget_id: str | None
    screen_id: str | None
    kind: RuntimeStateKind
    nodes: tuple[RuntimeStateNode, ...]
    raw_payload_path: str | None
    trust: TrustSignal
    attribution_actor: ActorKind
    captured_at_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not RUNTIME_STATE_CAPTURE_ID_PATTERN.fullmatch(
            self.id
        ):
            raise ValueError(
                "RuntimeStateCapture id must match "
                "^runtime-capture:[a-zA-Z0-9._-]+$"
            )

        if self.widget_id is None and self.screen_id is None:
            raise ValueError(
                "RuntimeStateCapture requires at least one of widget_id or screen_id"
            )
        if self.widget_id is not None and (
            not isinstance(self.widget_id, str)
            or not WIDGET_ID_PATTERN.fullmatch(self.widget_id)
        ):
            raise ValueError(
                "RuntimeStateCapture widget_id must match ^widget:[a-zA-Z0-9._-]+$"
            )
        if self.screen_id is not None and (
            not isinstance(self.screen_id, str)
            or not SCREEN_ID_PATTERN.fullmatch(self.screen_id)
        ):
            raise ValueError(
                "RuntimeStateCapture screen_id must match ^screen:[a-zA-Z0-9._-]+$"
            )

        if not isinstance(self.kind, RuntimeStateKind):
            raise ValueError("RuntimeStateCapture kind must be a RuntimeStateKind")

        try:
            nodes = tuple(self.nodes)
        except TypeError as exc:
            raise ValueError("RuntimeStateCapture nodes must be iterable") from exc
        for node in nodes:
            if not isinstance(node, RuntimeStateNode):
                raise ValueError(
                    "RuntimeStateCapture nodes must contain RuntimeStateNode entries"
                )
        object.__setattr__(self, "nodes", nodes)

        if self.raw_payload_path is not None and not isinstance(
            self.raw_payload_path,
            str,
        ):
            raise ValueError(
                "RuntimeStateCapture raw_payload_path must be a string or None"
            )

        _validate_trust_signal(self.trust, "RuntimeStateCapture")
        _validate_actor(
            self.attribution_actor,
            "RuntimeStateCapture attribution_actor",
        )
        _require_non_negative_int(
            self.captured_at_ms,
            "RuntimeStateCapture captured_at_ms",
        )
