"""Graph validation helpers for workspace graphs."""

from __future__ import annotations

from visual_code_editor.model import WorkspaceModel


def _empty_report(workspace: WorkspaceModel) -> dict[str, object]:
    """Build a zero-issue validation report."""
    return {
        "version": "behavioral-validation/v1",
        "build_id": workspace.build_id,
        "source_root": workspace.source_root,
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


def _find_duplicates(ids: list[str]) -> list[str]:
    """Return duplicate IDs while preserving first duplicate encounter order."""
    seen: set[str] = set()
    duplicates: list[str] = []
    duplicate_set: set[str] = set()
    for entity_id in ids:
        if entity_id in seen and entity_id not in duplicate_set:
            duplicates.append(entity_id)
            duplicate_set.add(entity_id)
            continue
        seen.add(entity_id)
    return duplicates


def validate_behavioral(workspace: WorkspaceModel) -> dict[str, object]:
    """Validate behavioral graph consistency and return a structured report."""
    if not workspace.lifecycles:
        return _empty_report(workspace)

    error_count = 0
    warning_count = 0
    items: list[dict[str, object]] = []

    def add_failure(
        entity_type: str,
        entity_id: str,
        check: str,
        severity: str,
        message: str,
    ) -> None:
        nonlocal error_count, warning_count
        items.append(
            {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "check": check,
                "severity": severity,
                "passed": False,
                "message": message,
            }
        )
        if severity == "error":
            error_count += 1
        else:
            warning_count += 1

    for lifecycle in workspace.lifecycles.values():
        duplicates = _find_duplicates(lifecycle.stage_ids)
        if duplicates:
            add_failure(
                entity_type="lifecycle",
                entity_id=lifecycle.id,
                check="no_duplicate_ids",
                severity="error",
                message=f"Lifecycle contains duplicate stage IDs: {', '.join(duplicates)}.",
            )

    for stage in workspace.stages.values():
        duplicates = _find_duplicates(stage.step_ids)
        if duplicates:
            add_failure(
                entity_type="stage",
                entity_id=stage.id,
                check="no_duplicate_ids",
                severity="error",
                message=f"Stage contains duplicate step IDs: {', '.join(duplicates)}.",
            )

        lifecycle = workspace.lifecycles.get(stage.lifecycle_id)
        if lifecycle is None:
            add_failure(
                entity_type="stage",
                entity_id=stage.id,
                check="stage_has_lifecycle",
                severity="error",
                message=f"Stage references missing lifecycle '{stage.lifecycle_id}'.",
            )
            continue

        if stage.id not in lifecycle.stage_ids:
            add_failure(
                entity_type="stage",
                entity_id=stage.id,
                check="stage_in_lifecycle",
                severity="error",
                message=f"Stage is not listed in lifecycle '{lifecycle.id}'.",
            )

    for step in workspace.steps.values():
        if not step.component_ids:
            add_failure(
                entity_type="step",
                entity_id=step.id,
                check="step_has_component",
                severity="warning",
                message="Step has no component IDs.",
            )

        if not step.code_block_ids:
            add_failure(
                entity_type="step",
                entity_id=step.id,
                check="step_has_code_block",
                severity="warning",
                message="Step has no code block IDs.",
            )

        stage = workspace.stages.get(step.stage_id)
        if stage is None:
            add_failure(
                entity_type="step",
                entity_id=step.id,
                check="step_has_stage",
                severity="error",
                message=f"Step references missing stage '{step.stage_id}'.",
            )
            continue

        if step.id not in stage.step_ids:
            add_failure(
                entity_type="step",
                entity_id=step.id,
                check="step_in_stage",
                severity="error",
                message=f"Step is not listed in stage '{stage.id}'.",
            )

    for artifact in workspace.artifacts.values():
        if artifact.producer_step_ids or artifact.consumer_step_ids:
            continue
        add_failure(
            entity_type="artifact",
            entity_id=artifact.id,
            check="artifact_has_anchor",
            severity="warning",
            message="Artifact has no producer or consumer steps.",
        )

    for code_block in workspace.code_blocks.values():
        reasons: list[str] = []
        if not code_block.path.strip():
            reasons.append("path is empty")
        if code_block.line_start > code_block.line_end:
            reasons.append(
                f"line_start ({code_block.line_start}) is greater than line_end ({code_block.line_end})"
            )
        if not reasons:
            continue
        add_failure(
            entity_type="code_block",
            entity_id=code_block.id,
            check="code_block_path_valid",
            severity="error",
            message=f"Code block is invalid: {'; '.join(reasons)}.",
        )

    return {
        "version": "behavioral-validation/v1",
        "build_id": workspace.build_id,
        "source_root": workspace.source_root,
        "status": "issues" if items else "ok",
        "summary": {
            "error_count": error_count,
            "warning_count": warning_count,
            "checked": {
                "lifecycles": len(workspace.lifecycles),
                "stages": len(workspace.stages),
                "steps": len(workspace.steps),
                "artifacts": len(workspace.artifacts),
                "code_blocks": len(workspace.code_blocks),
            },
        },
        "items": items,
    }


def validate_graph(workspace: WorkspaceModel) -> dict[str, object]:
    """Validate the workspace graph and return a structured report."""
    return validate_behavioral(workspace)
