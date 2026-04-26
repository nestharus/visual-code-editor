"""Canonical anchor and selection vocabulary for composer context."""

from dataclasses import dataclass
from enum import Enum
from typing import Iterable


class AnchorKind(str, Enum):
    NODE = "node"
    EDGE = "edge"
    CODE_BLOCK = "code-block"
    SECTION = "section"
    BEHAVIOUR_CARD = "behaviour-card"
    TASK = "task"
    PR_DELTA = "pr-delta"
    SELECTION_BOX = "selection-box"
    SLICE = "slice"
    SCREEN = "screen"
    WIDGET = "widget"


class SelectionMode(str, Enum):
    ENTITY = "entity"
    CONTENTS = "contents"


ALL_ANCHOR_KINDS: tuple[AnchorKind, ...] = tuple(AnchorKind)
ALL_SELECTION_MODES: tuple[SelectionMode, ...] = tuple(SelectionMode)

CONTAINER_ANCHOR_KINDS: frozenset[AnchorKind] = frozenset(
    (
        AnchorKind.NODE,
        AnchorKind.BEHAVIOUR_CARD,
        AnchorKind.SCREEN,
        AnchorKind.WIDGET,
    )
)


def anchor_kind_from_string(value: str) -> AnchorKind:
    try:
        return AnchorKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown anchor kind: {value}") from exc


def selection_mode_from_string(value: str) -> SelectionMode:
    try:
        return SelectionMode(value)
    except ValueError as exc:
        raise ValueError(f"Unknown selection mode: {value}") from exc


@dataclass(frozen=True)
class SelectionItem:
    id: str
    kind: AnchorKind
    mode: SelectionMode

    def __post_init__(self) -> None:
        if self.mode == SelectionMode.CONTENTS and self.kind not in CONTAINER_ANCHOR_KINDS:
            raise ValueError(
                "SelectionMode.CONTENTS is only valid for container anchor kinds"
            )


@dataclass(frozen=True)
class SelectionScope:
    items: tuple[SelectionItem, ...]
    primary_anchor: AnchorKind | None = None

    def __post_init__(self) -> None:
        items = tuple(self.items)
        object.__setattr__(self, "items", items)

        expected_primary_anchor = items[-1].kind if items else None
        if self.primary_anchor is None and expected_primary_anchor is not None:
            object.__setattr__(self, "primary_anchor", expected_primary_anchor)
        elif self.primary_anchor != expected_primary_anchor:
            raise ValueError("SelectionScope primary_anchor must match the last item kind")

        seen: set[tuple[str, SelectionMode]] = set()
        for item in items:
            key = (item.id, item.mode)
            if key in seen:
                raise ValueError("SelectionScope items must be unique by (id, mode)")
            seen.add(key)


def make_selection_scope(items: Iterable[SelectionItem]) -> SelectionScope:
    item_tuple = tuple(items)
    primary_anchor = item_tuple[-1].kind if item_tuple else None
    return SelectionScope(items=item_tuple, primary_anchor=primary_anchor)


@dataclass(frozen=True)
class AnchorContext:
    selection: SelectionScope
    surface_anchor: AnchorKind
