"""Static site generation helpers."""

from __future__ import annotations

import shutil
from pathlib import Path

from visual_code_editor.assets import APP_JS, STYLESHEET
from visual_code_editor.model import WorkspaceModel
from visual_code_editor.render.pages import (
    render_agent_page,
    render_cluster_page,
    render_coverage_page,
    render_edge_page,
    render_index_page,
    render_module_page,
    render_store_page,
    render_system_page,
)
from visual_code_editor.render.utils import write_text
from visual_code_editor.render.workspace_bridge import workspace_to_site_model


def _swap_staged_site(staging_dir: Path, output_dir: Path) -> None:
    backup_dir = output_dir.parent / ".site-backup"
    if backup_dir.exists():
        shutil.rmtree(backup_dir)
    if output_dir.exists():
        output_dir.replace(backup_dir)
    staging_dir.replace(output_dir)
    if backup_dir.exists():
        shutil.rmtree(backup_dir)


def write_site(site: dict, output_dir: Path) -> None:
    staging_dir = output_dir.parent / f".site-staging-{site['buildId']}"

    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True)

    write_text(staging_dir / "index.html", render_index_page(site))
    write_text(staging_dir / "coverage" / "index.html", render_coverage_page(site))
    for system in site["systems"].values():
        write_text(staging_dir / system["href"], render_system_page(site, system))
    for module in site["modules"].values():
        write_text(staging_dir / module["href"], render_module_page(site, module))
    for _agent_id, agent in site.get("agents", {}).items():
        write_text(staging_dir / agent["href"], render_agent_page(site, agent))
    for edge in site["edges"]:
        write_text(staging_dir / edge["href"], render_edge_page(site, edge))
    for cluster in site["clusters"]:
        write_text(staging_dir / cluster["href"], render_cluster_page(site, cluster))
    for store in site["stores"]:
        write_text(staging_dir / store["href"], render_store_page(site, store))

    write_text(staging_dir / "assets" / "styles.css", STYLESHEET + "\n")
    write_text(staging_dir / "assets" / "app.js", APP_JS + "\n")
    _swap_staged_site(staging_dir, output_dir)


def build_site(site: dict, output_dir: str | Path) -> None:
    """Build a static site for the supplied site model."""
    write_site(site, Path(output_dir))


def generate_site(workspace: WorkspaceModel, output_dir: Path, *, build_id: str = "") -> dict:
    """Generate a static site from a workspace model."""
    site = workspace_to_site_model(workspace)
    if build_id:
        site["buildId"] = build_id
    write_site(site, output_dir)
    return site
