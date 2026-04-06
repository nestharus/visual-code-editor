#!/usr/bin/env python3
"""CLI: load workspace.json → export diagram JSON to stdout."""

import json
import sys
from pathlib import Path

src_dir = str(Path(__file__).resolve().parent.parent.parent)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from visual_code_editor.model.workspace import WorkspaceModel
from visual_code_editor.model.organizational import Component, OrganizationalEdge
from visual_code_editor.model.behavioral import Artifact, CodeBlock, Lifecycle, Stage, Step
from visual_code_editor.model.crossrefs import CrossReference
from visual_code_editor.render.workspace_bridge import workspace_to_site_model
from visual_code_editor.export_json import export_diagram_json
from dataclasses import fields as dc_fields


def _reconstruct(cls, data):
    """Reconstruct a dataclass from a dict, ignoring extra keys."""
    if data is None:
        return cls.__new__(cls)
    valid = {f.name for f in dc_fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in valid})


def load_workspace(path: str) -> WorkspaceModel:
    with open(path) as f:
        raw = json.load(f)

    components = {k: _reconstruct(Component, v) for k, v in raw.get("components", {}).items()}
    stores = {k: _reconstruct(Component, v) for k, v in raw.get("stores", {}).items()}
    org_edges = [_reconstruct(OrganizationalEdge, e) for e in raw.get("organizational_edges", [])]
    artifacts = {k: _reconstruct(Artifact, v) for k, v in raw.get("artifacts", {}).items()}
    lifecycles = {k: _reconstruct(Lifecycle, v) for k, v in raw.get("lifecycles", {}).items()}
    stages = {k: _reconstruct(Stage, v) for k, v in raw.get("stages", {}).items()}
    steps = {k: _reconstruct(Step, v) for k, v in raw.get("steps", {}).items()}
    code_blocks = {k: _reconstruct(CodeBlock, v) for k, v in raw.get("code_blocks", {}).items()}
    crossrefs = [_reconstruct(CrossReference, x) for x in raw.get("crossrefs", [])]

    return WorkspaceModel(
        build_id=raw.get("build_id", ""),
        source_root=raw.get("source_root", ""),
        components=components,
        organizational_edges=org_edges,
        artifacts=artifacts,
        lifecycles=lifecycles,
        stages=stages,
        steps=steps,
        code_blocks=code_blocks,
        stores=stores,
        crossrefs=crossrefs,
        source_hash=raw.get("source_hash", ""),
        metadata=raw.get("metadata", {}),
    )


def _ws_to_dict(obj):
    """Convert a dataclass to dict."""
    from dataclasses import asdict
    try:
        return asdict(obj)
    except Exception:
        return obj if isinstance(obj, dict) else {}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: export_json_cli.py <workspace.json>", file=sys.stderr)
        sys.exit(1)

    ws = load_workspace(sys.argv[1])
    site = workspace_to_site_model(ws)
    # Attach workspace behavioral data for scenario generation
    site["_workspace"] = {
        "lifecycles": {k: _ws_to_dict(v) for k, v in ws.lifecycles.items()},
        "stages": {k: _ws_to_dict(v) for k, v in ws.stages.items()},
        "steps": {k: _ws_to_dict(v) for k, v in ws.steps.items()},
    }
    data = export_diagram_json(site)
    json.dump(data, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
