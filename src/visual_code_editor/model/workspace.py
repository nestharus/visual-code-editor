"""Canonical workspace model shared by ingest and rendering."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any

from visual_code_editor.model.behavioral import Artifact, CodeBlock, Lifecycle, Stage, Step
from visual_code_editor.model.crossrefs import CrossReference
from visual_code_editor.model.organizational import Component, OrganizationalEdge

type WorkspaceEntity = Component | Artifact | Lifecycle | Stage | Step | CodeBlock


@dataclass(slots=True)
class WorkspaceModel:
    build_id: str
    source_root: str
    components: dict[str, Component] = field(default_factory=dict)
    organizational_edges: list[OrganizationalEdge] = field(default_factory=list)
    artifacts: dict[str, Artifact] = field(default_factory=dict)
    lifecycles: dict[str, Lifecycle] = field(default_factory=dict)
    stages: dict[str, Stage] = field(default_factory=dict)
    steps: dict[str, Step] = field(default_factory=dict)
    code_blocks: dict[str, CodeBlock] = field(default_factory=dict)
    stores: dict[str, Component] = field(default_factory=dict)
    crossrefs: list[CrossReference] = field(default_factory=list)
    source_hash: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def all_components(self) -> dict[str, Component]:
        """Return structural entities, including stores, keyed by ID."""
        return {**self.components, **self.stores}

    def get_entity(self, entity_id: str) -> WorkspaceEntity | None:
        """Resolve an entity ID across the shared workspace collections."""
        collections = (
            self.components,
            self.stores,
            self.artifacts,
            self.lifecycles,
            self.stages,
            self.steps,
            self.code_blocks,
        )
        for collection in collections:
            entity = collection.get(entity_id)
            if entity is not None:
                return entity
        return None

    def has_entity(self, entity_id: str) -> bool:
        """Check whether an entity exists anywhere in the workspace."""
        return self.get_entity(entity_id) is not None

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-serializable dictionary representation."""
        return asdict(self)

    def to_json(self, **kwargs: object) -> str:
        """Serialize the workspace model to JSON."""
        return json.dumps(self.to_dict(), **kwargs)


__all__ = [
    "Artifact",
    "CodeBlock",
    "Component",
    "CrossReference",
    "Lifecycle",
    "OrganizationalEdge",
    "Stage",
    "Step",
    "WorkspaceModel",
]
