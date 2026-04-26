import shutil
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import (
    Behavior,
    BehaviorSliceRole,
    BehaviorSourceSlice,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState

from src.visual_code_editor.extractor.behavior_extractor import (
    behavior_id_for_source,
    extract_behaviors,
    reconcile,
    rule_based_categorizer,
)
from src.visual_code_editor.extractor.parse import ParseUnitKind, parse


FIXTURE_ROOT = Path(__file__).resolve().parent / "extractor_fixtures"


@pytest.fixture
def workspace_root(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    for fixture in FIXTURE_ROOT.iterdir():
        shutil.copy(fixture, workspace / fixture.name)
    return workspace


def _trust(
    state: TrustState = TrustState.CANDIDATE,
    grounding: GroundingSource | None = None,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _slice(
    file_path: str,
    start_line: int,
    end_line: int,
    *,
    discovered_by: ActorKind = ActorKind.AGENTS_SLICE_CONSTRUCTOR,
    confirmed_by: ActorKind | None = None,
) -> BehaviorSourceSlice:
    return BehaviorSourceSlice(
        file_path=file_path,
        start_line=start_line,
        end_line=end_line,
        start_col=None,
        end_col=None,
        slice_role=BehaviorSliceRole.BODY,
        discovered_by=discovered_by,
        confirmed_by=confirmed_by,
    )


def _behavior(
    id: str,
    label: str,
    source_slice: BehaviorSourceSlice,
    *,
    trust: TrustSignal | None = None,
    attribution_actor: ActorKind | None = ActorKind.AGENTS_SLICE_CONSTRUCTOR,
) -> Behavior:
    return Behavior(
        id=id,
        label=label,
        description=None,
        source_slices=(source_slice,),
        trust=trust or _trust(),
        parent_behavior_id=None,
        attribution_actor=attribution_actor,
    )


def _unit_shape(unit):
    return (
        unit.kind,
        unit.name,
        unit.start_line,
        unit.end_line,
        tuple(_unit_shape(child) for child in unit.children),
    )


def _behavior_summary(behavior: Behavior):
    source_slice = behavior.source_slices[0]
    return (
        behavior.id,
        behavior.label,
        behavior.description,
        source_slice.file_path,
        source_slice.start_line,
        source_slice.end_line,
        source_slice.slice_role,
        source_slice.discovered_by,
        source_slice.confirmed_by,
        behavior.trust.state,
        behavior.trust.grounding,
        behavior.parent_behavior_id,
        behavior.attribution_actor,
    )


def test_parse_python_file_returns_structural_units_with_exact_ranges():
    tree = parse(str(FIXTURE_ROOT / "python_parse_fixture.py"))

    assert tree.file_path == str(FIXTURE_ROOT / "python_parse_fixture.py")
    assert tree.language == "python"
    assert tuple(_unit_shape(unit) for unit in tree.units) == (
        (ParseUnitKind.TOP_LEVEL, None, 1, 5, ()),
        (ParseUnitKind.FUNCTION, "load_user", 7, 9, ()),
        (
            ParseUnitKind.CLASS,
            "SessionManager",
            11,
            19,
            (
                (ParseUnitKind.FUNCTION, "open_session", 14, 16, ()),
                (ParseUnitKind.FUNCTION, "close_session", 18, 19, ()),
            ),
        ),
        (
            ParseUnitKind.FUNCTION,
            "outer_task",
            21,
            24,
            ((ParseUnitKind.FUNCTION, "nested_step", 22, 23, ()),),
        ),
    )


def test_parse_non_python_file_returns_single_top_level_unit_covering_file():
    tree = parse(str(FIXTURE_ROOT / "notes.txt"))

    assert tree.file_path == str(FIXTURE_ROOT / "notes.txt")
    assert tree.language == "other"
    assert tuple(_unit_shape(unit) for unit in tree.units) == (
        (ParseUnitKind.TOP_LEVEL, None, 1, 2, ()),
    )


def test_rule_based_categorizer_emits_function_and_method_candidates(workspace_root, monkeypatch):
    monkeypatch.chdir(workspace_root)
    parse_trees = (parse("workflow.py"), parse("service.py"))

    behaviors = rule_based_categorizer(parse_trees)

    assert [_behavior_summary(behavior) for behavior in behaviors] == [
        (
            "behavior:workflow.load_user",
            "Load user",
            None,
            "workflow.py",
            1,
            3,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:workflow.save_user",
            "Save user",
            None,
            "workflow.py",
            6,
            8,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:service.Runner.start",
            "Start",
            None,
            "service.py",
            2,
            3,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:service.Runner.stop",
            "Stop",
            None,
            "service.py",
            5,
            6,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
    ]


def test_extract_behaviors_end_to_end_returns_expected_ids_and_slices(workspace_root):
    workflow = workspace_root / "workflow.py"
    notes = workspace_root / "notes.txt"
    service = workspace_root / "service.py"

    behaviors = extract_behaviors(
        (str(workflow), str(notes), str(service)),
        workspace_root=str(workspace_root),
    )

    assert [_behavior_summary(behavior) for behavior in behaviors] == [
        (
            "behavior:workflow.load_user",
            "Load user",
            None,
            str(workflow),
            1,
            3,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:workflow.save_user",
            "Save user",
            None,
            str(workflow),
            6,
            8,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:notes.top-level",
            "Notes",
            None,
            str(notes),
            1,
            2,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:service.Runner.start",
            "Start",
            None,
            str(service),
            2,
            3,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
        (
            "behavior:service.Runner.stop",
            "Stop",
            None,
            str(service),
            5,
            6,
            BehaviorSliceRole.BODY,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
            None,
            TrustState.CANDIDATE,
            None,
            None,
            ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        ),
    ]


def test_reconcile_id_match_preserves_existing_behavior_when_slices_are_identical(tmp_path):
    source = tmp_path / "workflow.py"
    source.write_text("def load_user():\n    return None\n", encoding="utf-8")
    source_slice = _slice(str(source), 1, 2)
    existing = _behavior(
        "behavior:workflow.load_user",
        "Existing label",
        source_slice,
        trust=_trust(TrustState.GROUNDED, GroundingSource.TEST),
        attribution_actor=ActorKind.YOU_THIS_SESSION,
    )
    candidate = _behavior("behavior:workflow.load_user", "Load user", source_slice)

    existing_behaviors = [existing]
    result = reconcile((candidate,), existing_behaviors)

    assert result == [existing]
    assert result is not existing_behaviors
    assert existing.trust.state is TrustState.GROUNDED
    assert existing.trust.grounding is GroundingSource.TEST


def test_reconcile_slice_change_updates_slice_and_reactivates_stale_behavior(tmp_path):
    source = tmp_path / "workflow.py"
    source.write_text(
        "def load_user():\n    value = 1\n    return value\n",
        encoding="utf-8",
    )
    existing = _behavior(
        "behavior:workflow.load_user",
        "Load user",
        _slice(str(source), 1, 2),
        trust=_trust(TrustState.STALE),
    )
    candidate = _behavior(
        "behavior:workflow.load_user",
        "Load user",
        _slice(str(source), 1, 3),
    )

    result = reconcile((candidate,), (existing,))

    assert len(result) == 1
    assert result[0].id == "behavior:workflow.load_user"
    assert result[0].source_slices == (_slice(str(source), 1, 3),)
    assert result[0].trust == _trust(TrustState.CANDIDATE)
    assert existing.source_slices == (_slice(str(source), 1, 2),)
    assert existing.trust == _trust(TrustState.STALE)


def test_reconcile_missing_file_marks_unmatched_existing_behavior_orphaned(tmp_path):
    missing_source = tmp_path / "deleted.py"
    existing = _behavior(
        "behavior:deleted.load_user",
        "Load user",
        _slice(str(missing_source), 1, 2),
    )

    result = reconcile((), (existing,))

    assert len(result) == 1
    assert result[0].id == "behavior:deleted.load_user"
    assert result[0].trust == _trust(TrustState.ORPHANED)
    assert existing.trust == _trust(TrustState.CANDIDATE)


def test_reconcile_existing_file_marks_unmatched_existing_behavior_stale(tmp_path):
    source = tmp_path / "workflow.py"
    source.write_text("def unrelated():\n    return None\n", encoding="utf-8")
    existing = _behavior(
        "behavior:workflow.load_user",
        "Load user",
        _slice(str(source), 1, 2),
    )

    result = reconcile((), (existing,))

    assert len(result) == 1
    assert result[0].id == "behavior:workflow.load_user"
    assert result[0].trust == _trust(TrustState.STALE)
    assert existing.trust == _trust(TrustState.CANDIDATE)


def test_extract_behaviors_uses_injected_categorizer(workspace_root):
    workflow = workspace_root / "workflow.py"
    fixed = _behavior(
        "behavior:injected.fixed",
        "Injected fixed",
        _slice(str(workflow), 1, 1),
    )
    calls = []

    def stub_categorizer(parse_trees):
        calls.append(tuple(tree.file_path for tree in parse_trees))
        return [fixed]

    result = extract_behaviors(
        (str(workflow),),
        workspace_root=str(workspace_root),
        categorizer=stub_categorizer,
    )

    assert calls == [(str(workflow),)]
    assert result == [fixed]


@pytest.mark.parametrize(
    ("workspace_root", "file_path", "name", "expected_id"),
    (
        (
            "/workspace/project",
            "/workspace/project/src/auth/session.py",
            "validate_token",
            "behavior:src.auth.session.validate_token",
        ),
        (
            "/workspace/project",
            "/workspace/project/src/http-client.ts",
            "send_request",
            "behavior:src.http-client.send_request",
        ),
        (
            "/workspace/project",
            "/workspace/project/README.md",
            "top-level",
            "behavior:README.top-level",
        ),
        (
            "/workspace/project",
            "/workspace/project/pkg/__init__.py",
            "bootstrap",
            "behavior:pkg.__init__.bootstrap",
        ),
    ),
)
def test_workspace_path_to_behavior_id_mapping(
    workspace_root,
    file_path,
    name,
    expected_id,
):
    assert behavior_id_for_source(workspace_root, file_path, name) == expected_id
