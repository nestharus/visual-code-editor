from __future__ import annotations

from pathlib import Path

from visual_code_editor.model import WorkspaceModel
from visual_code_editor.render.codemap import render_codemap, write_codemap
from visual_code_editor.render.pages import render_index_page, render_store_page
from visual_code_editor.render.site_builder import generate_site, write_site


def make_minimal_site() -> dict:
    return {
        "buildId": "build-123",
        "rootSourceHash": "root-hash",
        "rootFiles": [],
        "manifest": {},
        "rootNodeTargetMap": {},
        "rootRefs": [],
        "rootSectionRefs": {"overview": []},
        "coverage": {
            "coveredFiles": 0,
            "totalFiles": 0,
            "referencedSymbols": 0,
            "totalSymbols": 0,
            "symbolPercentage": 0.0,
            "bySystem": {},
        },
        "systems": {},
        "modules": {},
        "agents": {},
        "edges": [],
        "clusters": [],
        "clusterEdges": [],
        "stores": [],
        "bridgeStores": [],
        "behavioral": {
            "artifacts": {},
            "lifecycles": {},
            "stages": {},
            "steps": {},
            "codeBlocks": {},
        },
        "crossrefs": [],
        "views": {
            "organizational": {"available": True},
            "behavioral": {"available": False},
        },
    }


def make_minimal_workspace() -> WorkspaceModel:
    return WorkspaceModel(
        build_id="build-123",
        source_root="src",
        source_hash="workspace-hash",
        metadata={
            "coverage": {
                "coveredFiles": 0,
                "totalFiles": 0,
                "referencedSymbols": 0,
                "totalSymbols": 0,
                "symbolPercentage": 0.0,
                "bySystem": {},
            },
            "rootFiles": [],
            "rootRefs": [],
            "rootSectionRefs": {"overview": []},
            "rootSourceHash": "root-hash",
            "manifest": {},
            "rootNodeTargetMap": {},
            "clusterEdges": [],
            "clusterPositions": {},
            "bridgeStoreIds": [],
            "canvas": {},
        },
    )


def test_render_store_page_contains_expected_html() -> None:
    site = make_minimal_site()
    site["systems"] = {
        "intent": {
            "id": "intent",
            "label": "Intent",
            "description": "Problem framing and intent capture.",
            "href": "systems/intent.html",
            "hasDiagram": False,
        },
    }
    store = {
        "id": "workspace",
        "label": "Workspace",
        "description": "Shared workspace data.",
        "what": "A shared store for intermediate state.",
        "location": ".cache/workspace",
        "tables": ["plans", "runs"],
        "readers": ["intent"],
        "writers": ["intent"],
        "href": "stores/workspace.html",
        "sourceHash": "store-hash",
        "refs": [
            {
                "id": "ref-1",
                "display_path": "src/intent/store.py",
                "symbols": [],
                "all_symbols": [],
            },
        ],
        "sectionRefs": {
            "what": ["ref-1"],
            "how": ["ref-1"],
            "connections": ["ref-1"],
            "coverage": ["ref-1"],
        },
        "symbolCoverage": {"referenced": 0, "total": 0},
    }

    html = render_store_page(site | {"stores": [store]}, store)

    assert "<h1 class=\"page-title\">Workspace</h1>" in html
    assert "A shared store for intermediate state." in html
    assert "../assets/styles.css" in html
    assert "Readers" in html


def test_write_site_replaces_existing_output(tmp_path: Path) -> None:
    site = make_minimal_site()
    output_dir = tmp_path / "site"
    output_dir.mkdir()
    stale_file = output_dir / "stale.txt"
    stale_file.write_text("stale", encoding="utf-8")

    write_site(site, output_dir)

    assert not stale_file.exists()
    assert (output_dir / "index.html").exists()
    assert (output_dir / "coverage" / "index.html").exists()
    assert (output_dir / "assets" / "styles.css").exists()
    assert "Artifact Lifecycle" in (output_dir / "index.html").read_text(encoding="utf-8")


def test_generate_site_accepts_workspace_model(tmp_path: Path) -> None:
    workspace = make_minimal_workspace()
    output_dir = tmp_path / "site"

    site = generate_site(workspace, output_dir)

    assert site["buildId"] == "build-123"
    assert (output_dir / "index.html").exists()
    assert (output_dir / "coverage" / "index.html").exists()


def test_render_index_embeds_behavioral_toggle_when_available() -> None:
    site = make_minimal_site()
    site["views"]["behavioral"]["available"] = True
    site["behavioral"] = {
        "artifacts": {
            "artifact:problem": {"id": "artifact:problem", "label": "Problem", "kind": "json"},
        },
        "lifecycles": {
            "lifecycle:problem-framing": {
                "id": "lifecycle:problem-framing",
                "label": "Problem Framing",
                "description": "Test lifecycle",
                "stage_ids": ["stage:extract"],
                "entry_artifact_ids": ["artifact:problem"],
                "exit_artifact_ids": ["artifact:problem"],
                "component_ids": [],
            },
        },
        "stages": {
            "stage:extract": {
                "id": "stage:extract",
                "lifecycle_id": "lifecycle:problem-framing",
                "label": "Extract",
                "description": "Stage",
                "step_ids": ["step:extract"],
                "input_artifact_ids": ["artifact:problem"],
                "output_artifact_ids": ["artifact:problem"],
                "executor_component_ids": [],
            },
        },
        "steps": {
            "step:extract": {
                "id": "step:extract",
                "stage_id": "stage:extract",
                "label": "Extract",
                "description": "Step",
                "input_artifact_ids": ["artifact:problem"],
                "output_artifact_ids": ["artifact:problem"],
                "component_ids": [],
                "code_block_ids": [],
            },
        },
        "codeBlocks": {},
    }

    html = render_index_page(site)

    assert 'id="root-stage" data-default-view="behavioral"' in html
    assert 'id="root-cy"' in html
    assert 'data-view="organizational"' in html
    assert 'id="root-behavioral-cy"' in html
    assert 'data-view="behavioral"' in html
    assert 'id="root-behavioral-cy" class="cy-container"' in html
    assert 'data-elements="' in html
    assert 'data-view-toggle="behavioral"' in html
    assert 'data-view-toggle="organizational"' in html
    assert 'diagram-behavioral-runtime' in html
    assert "&quot;available&quot;" not in html


def test_write_codemap_writes_header(tmp_path: Path) -> None:
    site = make_minimal_site()

    codemap_text = render_codemap(site)
    codemap_path = write_codemap(site, tmp_path)

    assert codemap_text.startswith("map codemap/v1 build=build-123 root=src hash=")
    assert codemap_path == tmp_path / "codemap.map"
    assert codemap_path.read_text(encoding="utf-8") == codemap_text


def test_write_codemap_accepts_workspace_model(tmp_path: Path) -> None:
    workspace = make_minimal_workspace()

    codemap_path = write_codemap(workspace, tmp_path)

    assert codemap_path.read_text(encoding="utf-8").startswith(
        "map codemap/v1 build=build-123 root=src hash=workspace-hash"
    )
