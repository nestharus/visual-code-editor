"""Behavioral view model types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Artifact:
    id: str
    label: str
    kind: str
    location: str = ""
    schema_hint: str = ""
    producer_step_ids: list[str] = field(default_factory=list)
    consumer_step_ids: list[str] = field(default_factory=list)
    store_ids: list[str] = field(default_factory=list)
    anchors: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class Lifecycle:
    id: str
    label: str
    description: str = ""
    stage_ids: list[str] = field(default_factory=list)
    entry_artifact_ids: list[str] = field(default_factory=list)
    exit_artifact_ids: list[str] = field(default_factory=list)
    component_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Stage:
    id: str
    lifecycle_id: str
    label: str
    description: str = ""
    step_ids: list[str] = field(default_factory=list)
    input_artifact_ids: list[str] = field(default_factory=list)
    output_artifact_ids: list[str] = field(default_factory=list)
    executor_component_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Step:
    id: str
    stage_id: str
    label: str
    description: str = ""
    input_artifact_ids: list[str] = field(default_factory=list)
    output_artifact_ids: list[str] = field(default_factory=list)
    component_ids: list[str] = field(default_factory=list)
    code_block_ids: list[str] = field(default_factory=list)
    executor_kind: str = "python"


@dataclass(slots=True)
class CodeBlock:
    id: str
    path: str
    line_start: int
    line_end: int
    symbol: str = ""
    language: str = "python"
    component_id: str = ""
    step_ids: list[str] = field(default_factory=list)
