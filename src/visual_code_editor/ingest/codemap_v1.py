"""Compatibility layer for the codemap v1 organizational DSL."""

from __future__ import annotations

from pathlib import Path

from visual_code_editor.model import WorkspaceModel


def parse_codemap_v1(path: str | Path) -> WorkspaceModel:
    """Parse a codemap v1 artifact into a workspace model."""
    raise NotImplementedError("codemap v1 parsing is not implemented yet")
