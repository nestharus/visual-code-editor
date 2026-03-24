"""Lifemap generation helpers."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from pathlib import Path

from visual_code_editor.model import WorkspaceModel
from visual_code_editor.render.codemap import dsl_csv, dsl_quote
from visual_code_editor.render.utils import write_text
from visual_code_editor.render.workspace_bridge import workspace_to_site_model


def _coerce_site(site_or_workspace: dict | WorkspaceModel) -> dict:
    if isinstance(site_or_workspace, WorkspaceModel):
        return workspace_to_site_model(site_or_workspace)
    return site_or_workspace


def _serialize_record(record: object) -> dict:
    if is_dataclass(record):
        return asdict(record)
    if isinstance(record, dict):
        return dict(record)
    return {}


def _serialize_collection(collection: object) -> dict[str, dict]:
    if not isinstance(collection, dict):
        return {}
    return {
        str(entity_id): _serialize_record(record)
        for entity_id, record in collection.items()
    }


def _behavioral_collections(site_or_workspace: dict | WorkspaceModel) -> tuple[
    dict[str, dict],
    dict[str, dict],
    dict[str, dict],
    dict[str, dict],
    dict[str, dict],
]:
    if isinstance(site_or_workspace, WorkspaceModel):
        return (
            _serialize_collection(site_or_workspace.lifecycles),
            _serialize_collection(site_or_workspace.stages),
            _serialize_collection(site_or_workspace.steps),
            _serialize_collection(site_or_workspace.artifacts),
            _serialize_collection(site_or_workspace.code_blocks),
        )

    behavioral = site_or_workspace.get("behavioral", {})
    return (
        _serialize_collection(behavioral.get("lifecycles")),
        _serialize_collection(behavioral.get("stages")),
        _serialize_collection(behavioral.get("steps")),
        _serialize_collection(behavioral.get("artifacts")),
        _serialize_collection(behavioral.get("codeBlocks")),
    )


def _entity_id(entity_id: str, record: dict) -> str:
    return str(record.get("id") or entity_id)


def _text_value(value: object) -> str:
    text = str(value).strip() if value is not None else ""
    return text or "-"


def _line_span(record: dict) -> str:
    line_start = record.get("line_start")
    line_end = record.get("line_end")
    if line_start is None or line_end is None:
        return "-"
    return f"{line_start}-{line_end}"


def render_lifemap(site_or_workspace: dict | WorkspaceModel) -> str:
    site = _coerce_site(site_or_workspace)
    build_id = site.get("buildId", "")
    workspace_hash = site.get("workspaceSourceHash", "")
    lifecycles, stages, steps, artifacts, code_blocks = _behavioral_collections(site_or_workspace)
    header = f"map lifemap/v1 build={build_id} root=src hash={workspace_hash}"

    if not lifecycles:
        return header + "\n"

    lines = [header, ""]

    for lifecycle_key in sorted(lifecycles):
        lifecycle = lifecycles[lifecycle_key]
        lifecycle_id = _entity_id(lifecycle_key, lifecycle)
        lines.append(f'lifecycle {lifecycle_id} {dsl_quote(_text_value(lifecycle.get("label")))}')
        lines.append(f'  description: {dsl_quote(_text_value(lifecycle.get("description")))}')
        lines.append(f'  stages: {dsl_csv(lifecycle.get("stage_ids", []))}')
        lines.append(f'  entry_artifacts: {dsl_csv(lifecycle.get("entry_artifact_ids", []))}')
        lines.append(f'  exit_artifacts: {dsl_csv(lifecycle.get("exit_artifact_ids", []))}')
        lines.append(f'  components: {dsl_csv(lifecycle.get("component_ids", []))}')
        lines.append("")

    for stage_key in sorted(stages):
        stage = stages[stage_key]
        stage_id = _entity_id(stage_key, stage)
        lines.append(f'stage {stage_id} {dsl_quote(_text_value(stage.get("label")))}')
        lines.append(f'  lifecycle: {_text_value(stage.get("lifecycle_id"))}')
        lines.append(f'  description: {dsl_quote(_text_value(stage.get("description")))}')
        lines.append(f'  steps: {dsl_csv(stage.get("step_ids", []))}')
        lines.append(f'  inputs: {dsl_csv(stage.get("input_artifact_ids", []))}')
        lines.append(f'  outputs: {dsl_csv(stage.get("output_artifact_ids", []))}')
        lines.append(f'  executors: {dsl_csv(stage.get("executor_component_ids", []))}')
        lines.append("")

    for step_key in sorted(steps):
        step = steps[step_key]
        step_id = _entity_id(step_key, step)
        lines.append(f'step {step_id} {dsl_quote(_text_value(step.get("label")))}')
        lines.append(f'  stage: {_text_value(step.get("stage_id"))}')
        lines.append(f'  description: {dsl_quote(_text_value(step.get("description")))}')
        lines.append(f'  executor_kind: {_text_value(step.get("executor_kind"))}')
        lines.append(f'  inputs: {dsl_csv(step.get("input_artifact_ids", []))}')
        lines.append(f'  outputs: {dsl_csv(step.get("output_artifact_ids", []))}')
        lines.append(f'  components: {dsl_csv(step.get("component_ids", []))}')
        lines.append(f'  code_blocks: {dsl_csv(step.get("code_block_ids", []))}')
        lines.append("")

    for artifact_key in sorted(artifacts):
        artifact = artifacts[artifact_key]
        artifact_id = _entity_id(artifact_key, artifact)
        lines.append(f'artifact {artifact_id} {dsl_quote(_text_value(artifact.get("label")))}')
        lines.append(f'  kind: {_text_value(artifact.get("kind"))}')
        lines.append(f'  location: {_text_value(artifact.get("location"))}')
        lines.append(f'  producers: {dsl_csv(artifact.get("producer_step_ids", []))}')
        lines.append(f'  consumers: {dsl_csv(artifact.get("consumer_step_ids", []))}')
        lines.append(f'  stores: {dsl_csv(artifact.get("store_ids", []))}')
        lines.append("")

    for code_block_key in sorted(code_blocks):
        code_block = code_blocks[code_block_key]
        code_block_id = _entity_id(code_block_key, code_block)
        lines.append(
            f'code_block {code_block_id} '
            f'{dsl_quote(_text_value(code_block.get("symbol") or code_block.get("path")))}'
        )
        lines.append(f'  path: {_text_value(code_block.get("path"))}')
        lines.append(f'  lines: {_line_span(code_block)}')
        lines.append(f'  symbol: {_text_value(code_block.get("symbol"))}')
        lines.append(f'  language: {_text_value(code_block.get("language"))}')
        lines.append(f'  component: {_text_value(code_block.get("component_id"))}')
        lines.append(f'  steps: {dsl_csv(code_block.get("step_ids", []))}')
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_lifemap(site_or_workspace: dict | WorkspaceModel, output_dir: Path) -> Path:
    lifemap_path = output_dir / "lifemap.map"
    write_text(lifemap_path, render_lifemap(site_or_workspace))
    return lifemap_path
