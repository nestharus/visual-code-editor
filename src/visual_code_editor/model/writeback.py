"""Canonical writeback schemas for in-app source edits."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import BEHAVIOR_ID_PATTERN, BehaviorSliceRole


BEHAVIOR_DRAFT_ID_PATTERN = re.compile(r"^draft:[a-zA-Z0-9._:-]+$")


class ChangeIntent(str, Enum):
    USER_EDIT = "user-edit"
    AGENT_EDIT = "agent-edit"
    PROMOTE_TO_TEST = "promote-to-test"
    RECONCILE = "reconcile"
    REVERT = "revert"


class ConflictKind(str, Enum):
    FILE_DELETED = "file-deleted"
    LINES_CHANGED = "lines-changed"
    FILE_MOVED = "file-moved"
    WHITESPACE_ONLY = "whitespace-only"


def change_intent_from_string(value: str) -> ChangeIntent:
    try:
        return ChangeIntent(value)
    except ValueError as exc:
        raise ValueError(f"Unknown change intent: {value}") from exc


def conflict_kind_from_string(value: str) -> ConflictKind:
    try:
        return ConflictKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown conflict kind: {value}") from exc


def _validate_proposed_slice_line_range(proposed_slice: "ProposedSlice") -> None:
    if proposed_slice.start_line < 1:
        raise ValueError("ProposedSlice start_line must be >= 1")
    if proposed_slice.end_line < proposed_slice.start_line:
        raise ValueError("ProposedSlice end_line must be >= start_line")


@dataclass(frozen=True)
class ChangeOrigin:
    actor: ActorKind
    intent: ChangeIntent
    timestamp_ms: int
    request_id: str | None

    def __post_init__(self) -> None:
        if not isinstance(self.actor, ActorKind):
            raise ValueError("ChangeOrigin actor must be an ActorKind")
        if not isinstance(self.intent, ChangeIntent):
            raise ValueError("ChangeOrigin intent must be a ChangeIntent")
        if self.timestamp_ms < 0:
            raise ValueError("ChangeOrigin timestamp_ms must be >= 0")


@dataclass(frozen=True)
class ProposedSlice:
    file_path: str
    start_line: int
    end_line: int
    new_text: str
    intent_role: BehaviorSliceRole

    def __post_init__(self) -> None:
        _validate_proposed_slice_line_range(self)
        if not isinstance(self.intent_role, BehaviorSliceRole):
            raise ValueError("ProposedSlice intent_role must be a BehaviorSliceRole")


@dataclass(frozen=True)
class BehaviorDraft:
    id: str
    behavior_id: str
    proposed_slices: tuple[ProposedSlice, ...]
    origin: ChangeOrigin
    parent_revision: str
    created_at_ms: int

    def __post_init__(self) -> None:
        if not BEHAVIOR_DRAFT_ID_PATTERN.fullmatch(self.id):
            raise ValueError("BehaviorDraft id must match ^draft:[a-zA-Z0-9._:-]+$")
        if not BEHAVIOR_ID_PATTERN.fullmatch(self.behavior_id):
            raise ValueError("BehaviorDraft behavior_id must match Behavior id pattern")

        proposed_slices = tuple(self.proposed_slices)
        object.__setattr__(self, "proposed_slices", proposed_slices)
        if not proposed_slices:
            raise ValueError("BehaviorDraft proposed_slices must be non-empty")
        for proposed_slice in proposed_slices:
            if not isinstance(proposed_slice, ProposedSlice):
                raise ValueError(
                    "BehaviorDraft proposed_slices must contain ProposedSlice entries"
                )
            _validate_proposed_slice_line_range(proposed_slice)

        if not isinstance(self.origin, ChangeOrigin):
            raise ValueError("BehaviorDraft origin must be a ChangeOrigin")
        if not self.parent_revision:
            raise ValueError("BehaviorDraft parent_revision must be non-empty")
        if self.created_at_ms < 0:
            raise ValueError("BehaviorDraft created_at_ms must be >= 0")


@dataclass(frozen=True)
class WritebackPlan:
    draft: BehaviorDraft
    effective_diff: str
    applies_against_revision: str
    validated_at_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.draft, BehaviorDraft):
            raise ValueError("WritebackPlan draft must be a BehaviorDraft")
        if self.draft.parent_revision != self.applies_against_revision:
            raise ValueError(
                "WritebackPlan applies_against_revision must match draft.parent_revision"
            )
        if self.effective_diff == "":
            raise ValueError("WritebackPlan effective_diff must be non-empty")
        if self.validated_at_ms < self.draft.created_at_ms:
            raise ValueError(
                "WritebackPlan validated_at_ms must be >= draft.created_at_ms"
            )


@dataclass(frozen=True)
class ConflictingFile:
    file_path: str
    conflict_kind: ConflictKind
    source_unchanged: bool

    def __post_init__(self) -> None:
        if not isinstance(self.conflict_kind, ConflictKind):
            raise ValueError("ConflictingFile conflict_kind must be a ConflictKind")


@dataclass(frozen=True)
class ConflictState:
    draft_id: str
    conflicting_files: tuple[ConflictingFile, ...]
    observed_revision: str
    expected_revision: str

    def __post_init__(self) -> None:
        conflicting_files = tuple(self.conflicting_files)
        object.__setattr__(self, "conflicting_files", conflicting_files)
        if not conflicting_files:
            raise ValueError("ConflictState conflicting_files must be non-empty")
        for conflicting_file in conflicting_files:
            if not isinstance(conflicting_file, ConflictingFile):
                raise ValueError(
                    "ConflictState conflicting_files must contain ConflictingFile entries"
                )
        if self.observed_revision == self.expected_revision:
            raise ValueError(
                "ConflictState observed_revision must differ from expected_revision"
            )
