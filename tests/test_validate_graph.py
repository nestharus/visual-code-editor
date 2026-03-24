from __future__ import annotations

from visual_code_editor.model import Artifact, CodeBlock, Lifecycle, Stage, Step, WorkspaceModel
from visual_code_editor.validate import validate_behavioral, validate_graph


def test_validate_behavioral_returns_minimal_report_for_empty_behavioral_data() -> None:
    workspace = WorkspaceModel(build_id="build-empty", source_root="/repo")

    report = validate_behavioral(workspace)

    assert report == {
        "version": "behavioral-validation/v1",
        "build_id": "build-empty",
        "source_root": "/repo",
        "status": "ok",
        "summary": {
            "error_count": 0,
            "warning_count": 0,
            "checked": {
                "lifecycles": 0,
                "stages": 0,
                "steps": 0,
                "artifacts": 0,
                "code_blocks": 0,
            },
        },
        "items": [],
    }


def test_validate_behavioral_returns_ok_for_consistent_behavioral_graph() -> None:
    artifact = Artifact(
        id="artifact:request",
        label="Request",
        kind="json",
        producer_step_ids=["step:collect"],
    )
    lifecycle = Lifecycle(
        id="lifecycle:intake",
        label="Intake",
        stage_ids=["stage:collect"],
    )
    stage = Stage(
        id="stage:collect",
        lifecycle_id=lifecycle.id,
        label="Collect",
        step_ids=["step:collect"],
    )
    step = Step(
        id="step:collect",
        stage_id=stage.id,
        label="Collect Request",
        component_ids=["module:intake"],
        code_block_ids=["code:collect"],
    )
    code_block = CodeBlock(
        id="code:collect",
        path="src/intake.py",
        line_start=5,
        line_end=12,
        step_ids=[step.id],
    )
    workspace = WorkspaceModel(
        build_id="build-valid",
        source_root="/repo",
        artifacts={artifact.id: artifact},
        lifecycles={lifecycle.id: lifecycle},
        stages={stage.id: stage},
        steps={step.id: step},
        code_blocks={code_block.id: code_block},
    )

    report = validate_graph(workspace)

    assert report["status"] == "ok"
    assert report["summary"] == {
        "error_count": 0,
        "warning_count": 0,
        "checked": {
            "lifecycles": 1,
            "stages": 1,
            "steps": 1,
            "artifacts": 1,
            "code_blocks": 1,
        },
    }
    assert report["items"] == []


def test_validate_behavioral_reports_requested_failures() -> None:
    orphan_artifact = Artifact(id="artifact:orphan", label="Orphan", kind="json")
    lifecycle = Lifecycle(
        id="lifecycle:main",
        label="Main",
        stage_ids=["stage:dup", "stage:dup"],
    )
    duplicate_stage = Stage(
        id="stage:dup",
        lifecycle_id=lifecycle.id,
        label="Duplicate Stage",
        step_ids=["step:missing-membership", "step:missing-membership"],
    )
    missing_lifecycle_stage = Stage(
        id="stage:orphan",
        lifecycle_id="lifecycle:missing",
        label="Orphan Stage",
    )
    missing_membership_step = Step(
        id="step:missing-membership",
        stage_id=duplicate_stage.id,
        label="Missing Membership",
        component_ids=[],
        code_block_ids=[],
    )
    missing_stage_step = Step(
        id="step:missing-stage",
        stage_id="stage:missing",
        label="Missing Stage",
        component_ids=["module:intake"],
        code_block_ids=["code:bad"],
    )
    bad_code_block = CodeBlock(
        id="code:bad",
        path="",
        line_start=20,
        line_end=10,
    )
    workspace = WorkspaceModel(
        build_id="build-invalid",
        source_root="/repo",
        artifacts={orphan_artifact.id: orphan_artifact},
        lifecycles={lifecycle.id: lifecycle},
        stages={
            duplicate_stage.id: duplicate_stage,
            missing_lifecycle_stage.id: missing_lifecycle_stage,
        },
        steps={
            missing_membership_step.id: missing_membership_step,
            missing_stage_step.id: missing_stage_step,
        },
        code_blocks={bad_code_block.id: bad_code_block},
    )

    report = validate_behavioral(workspace)
    items_by_check = {(item["entity_id"], item["check"]): item for item in report["items"]}

    assert report["status"] == "issues"
    assert report["summary"]["error_count"] == 5
    assert report["summary"]["warning_count"] == 3
    assert ("lifecycle:main", "no_duplicate_ids") in items_by_check
    assert ("stage:dup", "no_duplicate_ids") in items_by_check
    assert ("stage:orphan", "stage_has_lifecycle") in items_by_check
    assert ("step:missing-membership", "step_has_component") in items_by_check
    assert ("step:missing-membership", "step_has_code_block") in items_by_check
    assert ("step:missing-stage", "step_has_stage") in items_by_check
    assert ("step:missing-membership", "step_in_stage") not in items_by_check
    assert ("artifact:orphan", "artifact_has_anchor") in items_by_check
    assert ("code:bad", "code_block_path_valid") in items_by_check
