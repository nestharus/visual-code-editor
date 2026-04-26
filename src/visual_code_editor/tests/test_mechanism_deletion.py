import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.export_json import export_diagram_json
from visual_code_editor.export_json_cli import _ws_to_dict, load_workspace
from visual_code_editor.render.workspace_bridge import workspace_to_site_model


WORKSPACE_JSON = (
    Path.home()
    / "projects/agent-implementation-skill/execution-philosophy/diagrams/workspace.json"
)


@dataclass(frozen=True)
class RegeneratedDiagram:
    path: Path
    data: dict
    content: bytes


def _edge_details(data: dict) -> dict[str, dict]:
    details = data.get("details", {})
    return {
        detail_id: detail
        for detail_id, detail in details.items()
        if isinstance(detail, dict) and detail.get("kind") == "edge"
    }


def _build_diagram_data() -> dict:
    assert WORKSPACE_JSON.exists(), f"Workspace fixture is missing: {WORKSPACE_JSON}"

    workspace = load_workspace(str(WORKSPACE_JSON))
    site = workspace_to_site_model(workspace)
    site["_workspace"] = {
        "lifecycles": {
            key: _ws_to_dict(value) for key, value in workspace.lifecycles.items()
        },
        "stages": {
            key: _ws_to_dict(value) for key, value in workspace.stages.items()
        },
        "steps": {
            key: _ws_to_dict(value) for key, value in workspace.steps.items()
        },
    }
    return export_diagram_json(site)


def _write_diagram_json(path: Path) -> RegeneratedDiagram:
    data = _build_diagram_data()
    content = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return RegeneratedDiagram(path=path, data=data, content=content)


@pytest.fixture(scope="session")
def regenerated_diagram(tmp_path_factory) -> RegeneratedDiagram:
    output_path = tmp_path_factory.mktemp("mechanism-deletion") / "diagram.json"
    return _write_diagram_json(output_path)


@pytest.fixture(scope="session")
def regenerated_edge_details(regenerated_diagram: RegeneratedDiagram) -> dict[str, dict]:
    edge_details = _edge_details(regenerated_diagram.data)
    assert edge_details, "Regenerated diagram JSON did not contain any edge details"
    return edge_details


def _transfers_by_edge_id(edge_details: dict[str, dict]) -> dict[str, dict]:
    transfers: dict[str, dict] = {}
    malformed: list[tuple[str, object]] = []

    for edge_id, detail in edge_details.items():
        transfer = detail.get("transfer")
        if isinstance(transfer, dict):
            transfers[edge_id] = transfer
        else:
            malformed.append((edge_id, transfer))

    assert not malformed, (
        "Every regenerated edge detail must contain a JSON object transfer payload; "
        f"malformed or missing values: {malformed[:20]!r}"
    )
    return transfers


def test_mechanism_field_absent_from_every_edge_detail(
    regenerated_edge_details: dict[str, dict],
):
    legacy_edge_ids = sorted(
        edge_id
        for edge_id, detail in regenerated_edge_details.items()
        if "mechanism" in detail
    )

    assert not legacy_edge_ids, (
        "Legacy field details[*].mechanism must be absent from regenerated JSON; "
        f"found on edges: {legacy_edge_ids[:20]!r} "
        f"({len(legacy_edge_ids)} total)"
    )


def test_transfer_legacy_mechanism_is_null_for_every_edge(
    regenerated_edge_details: dict[str, dict],
):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    invalid = sorted(
        (edge_id, transfer.get("legacy_mechanism"))
        for edge_id, transfer in transfers.items()
        if transfer.get("legacy_mechanism") is not None
    )

    assert not invalid, (
        "EdgeTransfer legacy_mechanism must be null for every regenerated edge; "
        f"invalid values: {invalid[:20]!r}"
    )
