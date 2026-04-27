"""Widget variant topology schemas."""

from dataclasses import dataclass
from enum import Enum
import re
from types import MappingProxyType
from typing import Mapping

from visual_code_editor.model.render_snapshot import RENDER_ID_PATTERN
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import WIDGET_ID_PATTERN


VARIANT_TOPOLOGY_ID_PATTERN = re.compile(r"^variant-topology:[a-zA-Z0-9._-]+$")


class VariantAxisKind(str, Enum):
    PROP = "prop"
    THEME = "theme"
    LOCALE = "locale"
    DENSITY = "density"
    A11Y_STATE = "a11y-state"
    IMPLIED_STATE = "implied-state"
    VIEWPORT = "viewport"


class VariantCellState(str, Enum):
    GROUNDED = "grounded"
    CANDIDATE = "candidate"
    MISSING = "missing"
    IMPLIED = "implied"


def variant_axis_kind_from_string(value: str) -> VariantAxisKind:
    try:
        return VariantAxisKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown variant axis kind: {value}") from exc


def variant_cell_state_from_string(value: str) -> VariantCellState:
    try:
        return VariantCellState(value)
    except ValueError as exc:
        raise ValueError(f"Unknown variant cell state: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("VariantCell trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("VariantCell trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError("VariantCell trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class VariantAxis:
    kind: VariantAxisKind
    name: str
    values: tuple[str, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.kind, VariantAxisKind):
            raise ValueError("VariantAxis kind must be a VariantAxisKind")
        _validate_non_empty_string(self.name, "VariantAxis name")

        try:
            values = tuple(self.values)
        except TypeError as exc:
            raise ValueError("VariantAxis values must be iterable") from exc
        if len(values) == 0:
            raise ValueError("VariantAxis values must contain at least one value")
        if any(not isinstance(value, str) for value in values):
            raise ValueError("VariantAxis values must contain strings")
        if len(set(values)) != len(values):
            raise ValueError("VariantAxis values must be deduped")
        object.__setattr__(self, "values", values)


@dataclass(frozen=True)
class VariantCell:
    coordinates: Mapping[str, str]
    state: VariantCellState
    evidence_render_ids: tuple[str, ...]
    trust: TrustSignal

    def __post_init__(self) -> None:
        if not isinstance(self.coordinates, Mapping):
            raise ValueError("VariantCell coordinates must be a mapping")
        coordinates = dict(self.coordinates)
        for name, value in coordinates.items():
            if not isinstance(name, str) or not isinstance(value, str):
                raise ValueError("VariantCell coordinates must map strings to strings")
        object.__setattr__(self, "coordinates", MappingProxyType(coordinates))

        if not isinstance(self.state, VariantCellState):
            raise ValueError("VariantCell state must be a VariantCellState")

        try:
            evidence_render_ids = tuple(self.evidence_render_ids)
        except TypeError as exc:
            raise ValueError("VariantCell evidence_render_ids must be iterable") from exc
        for render_id in evidence_render_ids:
            if not RENDER_ID_PATTERN.fullmatch(render_id):
                raise ValueError(
                    "VariantCell evidence_render_ids must match "
                    "^render:[a-zA-Z0-9._-]+$"
                )
        if self.state != VariantCellState.GROUNDED and len(evidence_render_ids) != 0:
            raise ValueError(
                "VariantCell evidence_render_ids may be non-empty only when "
                "state is VariantCellState.GROUNDED"
            )
        object.__setattr__(self, "evidence_render_ids", evidence_render_ids)

        _validate_trust_signal(self.trust)


@dataclass(frozen=True)
class VariantTopology:
    id: str
    widget_id: str
    axes: tuple[VariantAxis, ...]
    cells: tuple[VariantCell, ...]
    computed_at_ms: int

    def __post_init__(self) -> None:
        if not VARIANT_TOPOLOGY_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "VariantTopology id must match "
                "^variant-topology:[a-zA-Z0-9._-]+$"
            )
        if not WIDGET_ID_PATTERN.fullmatch(self.widget_id):
            raise ValueError(
                "VariantTopology widget_id must match ^widget:[a-zA-Z0-9._-]+$"
            )

        try:
            axes = tuple(self.axes)
        except TypeError as exc:
            raise ValueError("VariantTopology axes must be iterable") from exc
        if len(axes) == 0:
            raise ValueError("VariantTopology axes must contain at least one axis")
        for axis in axes:
            if not isinstance(axis, VariantAxis):
                raise ValueError("VariantTopology axes must contain VariantAxis entries")
        object.__setattr__(self, "axes", axes)

        try:
            cells = tuple(self.cells)
        except TypeError as exc:
            raise ValueError("VariantTopology cells must be iterable") from exc
        for cell in cells:
            if not isinstance(cell, VariantCell):
                raise ValueError("VariantTopology cells must contain VariantCell entries")
            self._validate_cell_coordinates(axes, cell)
        object.__setattr__(self, "cells", cells)

        if self.computed_at_ms < 0:
            raise ValueError("VariantTopology computed_at_ms must be >= 0")

    @staticmethod
    def _validate_cell_coordinates(
        axes: tuple[VariantAxis, ...],
        cell: VariantCell,
    ) -> None:
        axis_names = {axis.name for axis in axes}
        coordinate_names = set(cell.coordinates.keys())
        missing_names = axis_names - coordinate_names
        if missing_names:
            raise ValueError("VariantCell coordinates must cover every axis")

        values_by_axis = {axis.name: set(axis.values) for axis in axes}
        for axis_name, allowed_values in values_by_axis.items():
            if cell.coordinates[axis_name] not in allowed_values:
                raise ValueError(
                    "VariantCell coordinate values must exist on the matching axis"
                )
