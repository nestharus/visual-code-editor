from __future__ import annotations

from pathlib import Path

from visual_code_editor.ingest import parse_lifemap_v1


def test_parse_lifemap_v1_populates_behavioral_workspace(tmp_path: Path) -> None:
    path = tmp_path / "lifemap.map"
    path.write_text(
        """map lifemap/v1 build=build-123 root=src hash=workspace-hash

lifecycle lifecycle:main "Main Lifecycle"
  description: "Lifecycle description"
  stages: stage:ingest
  entry_artifacts: artifact:input
  exit_artifacts: artifact:output
  components: component:worker

stage stage:ingest "Ingest"
  lifecycle: lifecycle:main
  description: "Stage description"
  steps: step:parse
  inputs: artifact:input
  outputs: artifact:output
  executors: component:worker

step step:parse "Parse"
  stage: stage:ingest
  description: "Step description"
  executor_kind: python
  inputs: artifact:input
  outputs: artifact:output
  components: component:worker
  code_blocks: code:parse

artifact artifact:input "Input"
  kind: json
  location: "data/input.json"
  producers: -
  consumers: step:parse
  stores: -

artifact artifact:output "Output"
  kind: json
  location: -
  producers: step:parse
  consumers: -
  stores: store:cache

code_block code:parse "Parser block"
  path: "src/app/parser.py"
  lines: 10-24
  symbol: "parse_input"
  language: python
  component: component:worker
  steps: step:parse
""",
        encoding="utf-8",
    )

    workspace = parse_lifemap_v1(path)

    assert workspace.build_id == "build-123"
    assert workspace.source_root == "src"
    assert workspace.source_hash == "workspace-hash"
    assert workspace.components == {}
    assert workspace.organizational_edges == []
    assert workspace.stores == {}
    assert workspace.crossrefs == []
    assert workspace.metadata == {"views": {"behavioral": {"available": True}}}

    assert workspace.lifecycles["lifecycle:main"].description == "Lifecycle description"
    assert workspace.lifecycles["lifecycle:main"].stage_ids == ["stage:ingest"]
    assert workspace.lifecycles["lifecycle:main"].entry_artifact_ids == ["artifact:input"]
    assert workspace.lifecycles["lifecycle:main"].exit_artifact_ids == ["artifact:output"]
    assert workspace.lifecycles["lifecycle:main"].component_ids == ["component:worker"]

    assert workspace.stages["stage:ingest"].lifecycle_id == "lifecycle:main"
    assert workspace.stages["stage:ingest"].step_ids == ["step:parse"]
    assert workspace.stages["stage:ingest"].input_artifact_ids == ["artifact:input"]
    assert workspace.stages["stage:ingest"].output_artifact_ids == ["artifact:output"]
    assert workspace.stages["stage:ingest"].executor_component_ids == ["component:worker"]

    assert workspace.steps["step:parse"].stage_id == "stage:ingest"
    assert workspace.steps["step:parse"].executor_kind == "python"
    assert workspace.steps["step:parse"].component_ids == ["component:worker"]
    assert workspace.steps["step:parse"].code_block_ids == ["code:parse"]

    assert workspace.artifacts["artifact:input"].location == "data/input.json"
    assert workspace.artifacts["artifact:input"].producer_step_ids == []
    assert workspace.artifacts["artifact:input"].consumer_step_ids == ["step:parse"]
    assert workspace.artifacts["artifact:output"].location == ""
    assert workspace.artifacts["artifact:output"].store_ids == ["store:cache"]

    code_block = workspace.code_blocks["code:parse"]
    assert code_block.id == "code:parse"
    assert code_block.path == "src/app/parser.py"
    assert code_block.line_start == 10
    assert code_block.line_end == 24
    assert code_block.symbol == "parse_input"
    assert code_block.language == "python"
    assert code_block.component_id == "component:worker"
    assert code_block.step_ids == ["step:parse"]
