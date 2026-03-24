"""Cross-reference model types linking organizational and behavioral views."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class CrossReference:
    source_id: str
    target_id: str
    source_view: str
    target_view: str
    relationship: str
