from __future__ import annotations

import json

from visual_code_editor.render.behavioral import build_behavioral_runtime
from visual_code_editor.render import (
    render_cluster_cytoscape,
    render_cluster_mermaid,
    render_root_cytoscape,
    render_root_mermaid,
    render_system_cytoscape,
    render_system_mermaid,
)


def make_site() -> dict:
    cluster_alpha = {
        "id": "cluster_alpha",
        "label": "Alpha",
        "color": "#336699",
        "href": "clusters/cluster_alpha.html",
        "systems": ["system_a"],
        "clusterStores": [
            {
                "id": "cluster_cache",
                "label": "Cluster Cache",
                "writers": ["system_a"],
                "readers": ["system_a", "system_b"],
                "href": "stores/cluster_cache.html",
            },
        ],
    }
    cluster_beta = {
        "id": "cluster_beta",
        "label": "Beta",
        "color": "#774411",
        "href": "clusters/cluster_beta.html",
        "systems": ["system_b"],
    }
    system_a = {
        "id": "system_a",
        "label": "System A",
        "href": "systems/system_a.html",
        "fileCount": 2,
        "agents": ["agent_worker"],
        "hasDiagram": True,
        "modules": ["module_core"],
        "internalFileEdges": [
            {
                "from": "file_main",
                "to": "file_support",
                "kind": "import",
                "imports": ["pkg.alpha", "pkg.beta"],
            },
            {"from": "file_main", "to": "agent_worker", "kind": "agent"},
        ],
        "clusterColor": cluster_alpha["color"],
    }
    system_b = {
        "id": "system_b",
        "label": "System B",
        "href": "systems/system_b.html",
        "fileCount": 1,
        "agents": [],
        "hasDiagram": False,
    }

    return {
        "clusters": [cluster_alpha, cluster_beta],
        "clusterEdges": [
            {"from": "cluster_alpha", "to": "cluster_beta", "label": "sync"},
        ],
        "bridgeStores": [
            {
                "id": "shared_store",
                "label": "Shared Store",
                "writerClusters": ["cluster_alpha"],
                "readerClusters": ["cluster_beta"],
                "href": "stores/shared_store.html",
            },
        ],
        "systems": {
            "system_a": system_a,
            "system_b": system_b,
        },
        "edges": [
            {
                "from": "system_a",
                "to": "system_b",
                "label": "calls",
                "href": "edges/system_a_to_system_b.html",
                "fromCluster": "cluster_alpha",
                "toCluster": "cluster_beta",
            },
        ],
        "modules": {
            "module_core": {
                "id": "module_core",
                "label": "Core",
                "diagramNodes": [
                    {"id": "file_main", "label": "main.py", "path": "src/main.py"},
                    {"id": "file_support", "label": "support.py", "path": "src/support.py"},
                    {
                        "id": "agent_worker",
                        "label": "Worker Agent",
                        "path": "src/worker.py",
                        "kind": "agent",
                    },
                ],
            },
        },
        "behavioral": {
            "artifacts": {
                "artifact:alpha": {"id": "artifact:alpha", "label": "Alpha artifact", "kind": "json", "store_ids": []},
            },
            "lifecycles": {
                "lifecycle:problem-framing": {
                    "id": "lifecycle:problem-framing",
                    "label": "Problem Framing",
                    "description": "Lifecycle",
                    "stage_ids": ["stage:extract"],
                    "entry_artifact_ids": ["artifact:alpha"],
                    "exit_artifact_ids": ["artifact:alpha"],
                    "component_ids": ["system_a"],
                },
            },
            "stages": {
                "stage:extract": {
                    "id": "stage:extract",
                    "lifecycle_id": "lifecycle:problem-framing",
                    "label": "Extract",
                    "description": "Stage",
                    "step_ids": ["step:extract"],
                    "input_artifact_ids": ["artifact:alpha"],
                    "output_artifact_ids": ["artifact:alpha"],
                    "executor_component_ids": ["system_a"],
                },
            },
            "steps": {
                "step:extract": {
                    "id": "step:extract",
                    "stage_id": "stage:extract",
                    "label": "Extract",
                    "description": "Step",
                    "input_artifact_ids": ["artifact:alpha"],
                    "output_artifact_ids": ["artifact:alpha"],
                    "component_ids": ["system_a"],
                    "code_block_ids": [],
                },
            },
            "codeBlocks": {},
        },
        "views": {
            "organizational": {"available": True},
            "behavioral": {"available": True},
        },
        "crossrefs": [],
    }


def test_render_root_mermaid_returns_non_empty_output() -> None:
    output = render_root_mermaid(make_site())

    assert output
    assert output.startswith("flowchart")


def test_render_cluster_mermaid_returns_non_empty_output() -> None:
    site = make_site()

    output = render_cluster_mermaid(site, site["clusters"][0])

    assert output
    assert "system_a" in output


def test_render_system_mermaid_returns_non_empty_output() -> None:
    site = make_site()

    output = render_system_mermaid(site, site["systems"]["system_a"])

    assert output
    assert "subgraph" in output


def test_render_root_cytoscape_returns_non_empty_output() -> None:
    elements_json, edge_click_map = render_root_cytoscape(make_site())

    assert elements_json
    assert json.loads(elements_json)
    assert edge_click_map


def test_render_cluster_cytoscape_returns_non_empty_output() -> None:
    site = make_site()

    elements_json, edge_click_map = render_cluster_cytoscape(site, site["clusters"][0])

    assert elements_json
    assert json.loads(elements_json)
    assert edge_click_map


def test_render_system_cytoscape_returns_non_empty_output() -> None:
    site = make_site()

    elements_json = render_system_cytoscape(site, site["systems"]["system_a"])
    elements = json.loads(elements_json)
    edges = {
        element["data"]["id"]: element["data"]
        for element in elements
        if element["data"].get("source")
    }

    assert elements_json
    assert elements
    assert edges["fe_file_main_file_support"]["label"] == "2 imports"
    assert edges["fe_file_main_file_support"]["importCount"] == 2
    assert edges["fe_file_main_agent_worker"]["label"] == "invokes"


def test_build_behavioral_runtime_returns_root_and_stage_payloads() -> None:
    runtime = build_behavioral_runtime(make_site())

    assert runtime["available"] is True
    assert json.loads(runtime["root"]["elements"])
    assert "lifecycle:problem-framing" in runtime["lifecycles"]
    assert "stage:extract" in runtime["stages"]


def test_build_behavioral_runtime_falls_back_to_source_output_artifacts_for_edge_labels() -> None:
    site = json.loads(json.dumps(make_site()))
    site["behavioral"]["artifacts"]["artifact:beta"] = {
        "id": "artifact:beta",
        "label": "Beta artifact",
        "kind": "json",
        "store_ids": [],
    }
    site["behavioral"]["lifecycles"]["lifecycle:problem-framing"]["exit_artifact_ids"] = ["artifact:beta"]
    site["behavioral"]["lifecycles"]["lifecycle:delivery"] = {
        "id": "lifecycle:delivery",
        "label": "Delivery",
        "description": "Lifecycle",
        "stage_ids": ["stage:load"],
        "entry_artifact_ids": ["artifact:alpha"],
        "exit_artifact_ids": [],
        "component_ids": ["system_a"],
    }
    site["behavioral"]["lifecycles"]["lifecycle:problem-framing"]["stage_ids"] = ["stage:extract", "stage:handoff"]
    site["behavioral"]["stages"]["stage:extract"]["output_artifact_ids"] = ["artifact:beta"]
    site["behavioral"]["stages"]["stage:extract"]["step_ids"] = ["step:extract", "step:ship"]
    site["behavioral"]["stages"]["stage:handoff"] = {
        "id": "stage:handoff",
        "lifecycle_id": "lifecycle:problem-framing",
        "label": "Handoff",
        "description": "Stage",
        "step_ids": ["step:handoff"],
        "input_artifact_ids": ["artifact:alpha"],
        "output_artifact_ids": [],
        "executor_component_ids": ["system_a"],
    }
    site["behavioral"]["stages"]["stage:load"] = {
        "id": "stage:load",
        "lifecycle_id": "lifecycle:delivery",
        "label": "Load",
        "description": "Stage",
        "step_ids": ["step:load"],
        "input_artifact_ids": ["artifact:alpha"],
        "output_artifact_ids": [],
        "executor_component_ids": ["system_a"],
    }
    site["behavioral"]["steps"]["step:extract"]["output_artifact_ids"] = ["artifact:beta"]
    site["behavioral"]["steps"]["step:ship"] = {
        "id": "step:ship",
        "stage_id": "stage:extract",
        "label": "Ship",
        "description": "Step",
        "input_artifact_ids": ["artifact:alpha"],
        "output_artifact_ids": [],
        "component_ids": ["system_a"],
        "code_block_ids": [],
    }
    site["behavioral"]["steps"]["step:handoff"] = {
        "id": "step:handoff",
        "stage_id": "stage:handoff",
        "label": "Handoff",
        "description": "Step",
        "input_artifact_ids": ["artifact:alpha"],
        "output_artifact_ids": [],
        "component_ids": ["system_a"],
        "code_block_ids": [],
    }
    site["behavioral"]["steps"]["step:load"] = {
        "id": "step:load",
        "stage_id": "stage:load",
        "label": "Load",
        "description": "Step",
        "input_artifact_ids": ["artifact:alpha"],
        "output_artifact_ids": [],
        "component_ids": ["system_a"],
        "code_block_ids": [],
    }

    runtime = build_behavioral_runtime(site)
    root_edge = runtime["root"]["edgeClickMap"]["be_lifecycle:problem-framing_lifecycle:delivery"]
    lifecycle_edge = runtime["lifecycles"]["lifecycle:problem-framing"]["edgeClickMap"]["be_stage:extract_stage:handoff"]
    stage_edge = runtime["stages"]["stage:extract"]["edgeClickMap"]["be_step:extract_step:ship"]

    assert root_edge["label"] == "Beta artifact"
    assert root_edge["artifacts"] == ["Beta artifact"]
    assert lifecycle_edge["label"] == "Beta artifact"
    assert lifecycle_edge["sourceArtifacts"] == ["Beta artifact"]
    assert stage_edge["label"] == "Beta artifact"
    assert stage_edge["sourceArtifacts"] == ["Beta artifact"]
