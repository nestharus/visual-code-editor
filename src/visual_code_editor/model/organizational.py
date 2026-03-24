"""Organizational view model types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Component:
    id: str
    kind: str
    label: str
    parent_id: str | None = None
    description: str = ""
    anchors: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class OrganizationalEdge:
    source_id: str
    target_id: str
    kind: str
    label: str = ""
    weight: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)
