"""Workspace assembly helpers."""

from __future__ import annotations

from typing import Any

from visual_code_editor.model import WorkspaceModel


def build_workspace_model(raw_data: dict[str, Any]) -> WorkspaceModel:
    """Build a workspace model from normalized raw data."""
    raise NotImplementedError("workspace assembly is not implemented yet")
