import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.export_json import export_diagram_json
from visual_code_editor.export_json_cli import _ws_to_dict, load_workspace
from visual_code_editor.model.edge_transfer import EdgeMechanismKind
from visual_code_editor.render.workspace_bridge import workspace_to_site_model


WORKSPACE_JSON = (
    Path.home()
    / "projects/agent-implementation-skill/execution-philosophy/diagrams/workspace.json"
)
BASELINE_DIAGRAM_JSON = Path(__file__).resolve().parents[3] / "public/data/diagram.json"


@dataclass(frozen=True)
class RegeneratedDiagram:
    path: Path
    data: dict
    content: bytes


def _baseline_data() -> dict:
    assert BASELINE_DIAGRAM_JSON.exists(), (
        f"Baseline diagram fixture is missing: {BASELINE_DIAGRAM_JSON}"
    )
    return json.loads(BASELINE_DIAGRAM_JSON.read_text())


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
    output_path = tmp_path_factory.mktemp("edge-transfer-export") / "diagram.json"
    return _write_diagram_json(output_path)


@pytest.fixture(scope="session")
def regenerated_json(regenerated_diagram: RegeneratedDiagram) -> dict:
    return regenerated_diagram.data


@pytest.fixture(scope="session")
def regenerated_edge_details(regenerated_json: dict) -> dict[str, dict]:
    edge_details = _edge_details(regenerated_json)
    assert edge_details, "Regenerated diagram JSON did not contain any edge details"
    return edge_details


def _transfers_by_edge_id(edge_details: dict[str, dict]) -> dict[str, dict]:
    transfers: dict[str, dict] = {}
    malformed: list[tuple[str, object]] = []

    for edge_id, detail in edge_details.items():
        if "transfer" not in detail:
            continue
        transfer = detail["transfer"]
        if isinstance(transfer, dict):
            transfers[edge_id] = transfer
        else:
            malformed.append((edge_id, transfer))

    assert not malformed, (
        "EdgeTransfer payloads must be JSON objects; malformed payloads: "
        f"{malformed[:20]!r}"
    )
    assert transfers, (
        "No EdgeTransfer payloads were emitted; add details[*].transfer before "
        "payload invariants can be evaluated"
    )
    return transfers


def test_every_edge_detail_has_transfer(regenerated_edge_details: dict[str, dict]):
    missing_edge_ids = sorted(
        edge_id
        for edge_id, detail in regenerated_edge_details.items()
        if "transfer" not in detail
    )

    assert not missing_edge_ids, (
        "Edge details missing required EdgeTransfer field 'transfer': "
        f"{missing_edge_ids[:20]!r} "
        f"({len(missing_edge_ids)} total missing)"
    )


def test_transfer_mechanism_kind_is_valid_edge_mechanism_member(
    regenerated_edge_details: dict[str, dict]
):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    valid_values = {kind.value for kind in EdgeMechanismKind}
    invalid = sorted(
        (edge_id, transfer.get("mechanism_kind"))
        for edge_id, transfer in transfers.items()
        if transfer.get("mechanism_kind") not in valid_values
    )

    assert not invalid, (
        "EdgeTransfer mechanism_kind values must be valid EdgeMechanismKind members; "
        f"invalid values: {invalid[:20]!r}; expected one of {sorted(valid_values)!r}"
    )


def test_transfer_attribution_actor_is_generator(
    regenerated_edge_details: dict[str, dict]
):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    invalid = sorted(
        (edge_id, transfer.get("attribution_actor"))
        for edge_id, transfer in transfers.items()
        if transfer.get("attribution_actor") != "generator"
    )

    assert not invalid, (
        "EdgeTransfer attribution_actor must be 'generator' for A.2 export; "
        f"invalid values: {invalid[:20]!r}"
    )


def test_transfer_trust_state_is_grounded_or_candidate(
    regenerated_edge_details: dict[str, dict]
):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    malformed = sorted(
        (edge_id, transfer.get("trust"))
        for edge_id, transfer in transfers.items()
        if not isinstance(transfer.get("trust"), dict)
    )
    invalid = sorted(
        (edge_id, transfer["trust"].get("state"))
        for edge_id, transfer in transfers.items()
        if isinstance(transfer.get("trust"), dict)
        and transfer["trust"].get("state") not in {"grounded", "candidate"}
    )

    assert not malformed, (
        "EdgeTransfer trust payloads must be JSON objects; malformed values: "
        f"{malformed[:20]!r}"
    )
    assert not invalid, (
        "EdgeTransfer trust.state must be 'grounded' or 'candidate' for A.2 export; "
        f"invalid values: {invalid[:20]!r}"
    )


def test_transfer_legacy_mechanism_is_null(regenerated_edge_details: dict[str, dict]):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    invalid = sorted(
        (edge_id, transfer.get("legacy_mechanism"))
        for edge_id, transfer in transfers.items()
        if transfer.get("legacy_mechanism") is not None
    )

    assert not invalid, (
        "EdgeTransfer legacy_mechanism must be null for the current fixture; "
        f"invalid values: {invalid[:20]!r}"
    )


def test_transfer_behaviour_candidates_is_empty(
    regenerated_edge_details: dict[str, dict]
):
    transfers = _transfers_by_edge_id(regenerated_edge_details)
    invalid = sorted(
        (edge_id, transfer.get("behaviour_candidates"))
        for edge_id, transfer in transfers.items()
        if transfer.get("behaviour_candidates") != []
    )

    assert not invalid, (
        "EdgeTransfer behaviour_candidates must be [] for A.2 export; "
        f"invalid values: {invalid[:20]!r}"
    )


def test_edge_transfer_export_is_deterministic(tmp_path):
    first = _write_diagram_json(tmp_path / "first" / "diagram.json")
    second = _write_diagram_json(tmp_path / "second" / "diagram.json")

    assert first.content == second.content, (
        "EdgeTransfer export must be deterministic; two regenerated diagram.json files "
        f"differ: {first.path} vs {second.path}"
    )


def test_no_previously_emitted_detail_records_were_removed(regenerated_json: dict):
    baseline_detail_ids = set(_baseline_data().get("details", {}))
    regenerated_detail_ids = set(regenerated_json.get("details", {}))
    missing_detail_ids = sorted(baseline_detail_ids - regenerated_detail_ids)

    assert not missing_detail_ids, (
        "Regenerated diagram JSON removed previously emitted detail records: "
        f"{missing_detail_ids[:20]!r}"
    )
