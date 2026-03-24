from __future__ import annotations

import json

from visual_code_editor.model import (
    Artifact,
    CodeBlock,
    Component,
    CrossReference,
    Lifecycle,
    Stage,
    Step,
    WorkspaceModel,
)


def test_workspace_model_supports_organizational_only_population() -> None:
    workspace = WorkspaceModel(
        build_id="build-001",
        source_root="/repo",
        components={
            "system:intent": Component(
                id="system:intent",
                kind="system",
                label="Intent",
            ),
        },
    )

    assert workspace.components["system:intent"].label == "Intent"
    assert workspace.artifacts == {}
    assert workspace.lifecycles == {}
    assert workspace.has_entity("system:intent")
    assert workspace.get_entity("system:intent") is workspace.components["system:intent"]


def test_workspace_model_supports_behavioral_only_population() -> None:
    artifact = Artifact(id="artifact:problem", label="Problem", kind="json")
    lifecycle = Lifecycle(
        id="lifecycle:problem-framing",
        label="Problem Framing",
        stage_ids=["stage:extract"],
        entry_artifact_ids=["artifact:problem"],
    )
    stage = Stage(
        id="stage:extract",
        lifecycle_id=lifecycle.id,
        label="Problem Extraction",
        step_ids=["step:extract-statements"],
        input_artifact_ids=[artifact.id],
        output_artifact_ids=["artifact:statements"],
    )
    step = Step(
        id="step:extract-statements",
        stage_id=stage.id,
        label="Extract Statements",
        input_artifact_ids=[artifact.id],
        output_artifact_ids=["artifact:statements"],
    )

    workspace = WorkspaceModel(
        build_id="build-002",
        source_root="/repo",
        artifacts={artifact.id: artifact},
        lifecycles={lifecycle.id: lifecycle},
        stages={stage.id: stage},
        steps={step.id: step},
    )

    assert workspace.components == {}
    assert workspace.lifecycles[lifecycle.id].stage_ids == [stage.id]
    assert workspace.stages[stage.id].step_ids == [step.id]
    assert workspace.get_entity(step.id) is step


def test_workspace_model_crossrefs_resolve_and_json_is_serializable() -> None:
    component = Component(id="module:intent.extract", kind="module", label="intent.extract")
    store = Component(id="store:workspace", kind="store", label="Workspace Store")
    artifact = Artifact(
        id="artifact:statements",
        label="Statements",
        kind="json",
        producer_step_ids=["step:extract-statements"],
        store_ids=[store.id],
    )
    lifecycle = Lifecycle(
        id="lifecycle:problem-framing",
        label="Problem Framing",
        stage_ids=["stage:problem-extraction"],
        component_ids=[component.id],
    )
    stage = Stage(
        id="stage:problem-extraction",
        lifecycle_id=lifecycle.id,
        label="Problem Extraction",
        step_ids=["step:extract-statements"],
        output_artifact_ids=[artifact.id],
        executor_component_ids=[component.id],
    )
    step = Step(
        id="step:extract-statements",
        stage_id=stage.id,
        label="Extract explicit problem statements",
        output_artifact_ids=[artifact.id],
        component_ids=[component.id],
        code_block_ids=["code:extract"],
    )
    code_block = CodeBlock(
        id="code:extract",
        path="src/app/extract.py",
        line_start=10,
        line_end=24,
        symbol="extract_statements",
        component_id=component.id,
        step_ids=[step.id],
    )
    crossrefs = [
        CrossReference(
            source_id=step.id,
            target_id=component.id,
            source_view="behavioral",
            target_view="organizational",
            relationship="implements",
        ),
        CrossReference(
            source_id=artifact.id,
            target_id=store.id,
            source_view="behavioral",
            target_view="organizational",
            relationship="stores",
        ),
        CrossReference(
            source_id=component.id,
            target_id=lifecycle.id,
            source_view="organizational",
            target_view="behavioral",
            relationship="participates_in",
        ),
    ]

    workspace = WorkspaceModel(
        build_id="build-003",
        source_root="/repo",
        components={component.id: component},
        artifacts={artifact.id: artifact},
        lifecycles={lifecycle.id: lifecycle},
        stages={stage.id: stage},
        steps={step.id: step},
        code_blocks={code_block.id: code_block},
        stores={store.id: store},
        crossrefs=crossrefs,
    )

    for crossref in workspace.crossrefs:
        assert workspace.get_entity(crossref.source_id) is not None
        assert workspace.get_entity(crossref.target_id) is not None

    payload = workspace.to_dict()
    assert payload["build_id"] == "build-003"
    assert json.loads(workspace.to_json())["steps"][step.id]["label"] == step.label
