"""Canonical semantic color schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


COLOR_TOKEN_ID_PATTERN = re.compile(r"^color-token:[a-zA-Z0-9._-]+$")
CONTRAST_PAIR_ID_PATTERN = re.compile(r"^contrast-pair:[a-zA-Z0-9._-]+$")
COLOR_PALETTE_ID_PATTERN = re.compile(r"^color-palette:[a-zA-Z0-9._-]+$")
HEX_VALUE_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$")


class ColorRole(str, Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    ACCENT = "accent"
    NEUTRAL = "neutral"
    SURFACE = "surface"
    BACKGROUND = "background"
    TEXT = "text"
    BORDER = "border"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    INFO = "info"
    MUTED = "muted"
    DECORATIVE = "decorative"


class ContrastLevel(str, Enum):
    PASS_AA = "pass-aa"
    PASS_AAA = "pass-aaa"
    FAIL = "fail"
    NOT_TEXT = "not-text"


def color_role_from_string(value: str) -> ColorRole:
    try:
        return ColorRole(value)
    except ValueError as exc:
        raise ValueError(f"Unknown color role: {value}") from exc


def contrast_level_from_string(value: str) -> ContrastLevel:
    try:
        return ContrastLevel(value)
    except ValueError as exc:
        raise ValueError(f"Unknown contrast level: {value}") from exc


def _validate_non_empty_string(value: str, field_name: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("ColorToken trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("ColorToken trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError("ColorToken trust grounding must be a GroundingSource or None")

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class ColorToken:
    id: str
    name: str
    role: ColorRole
    hex_value: str
    description: str | None
    trust: TrustSignal
    attribution_actor: ActorKind
    created_at_ms: int

    def __post_init__(self) -> None:
        if not COLOR_TOKEN_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "ColorToken id must match ^color-token:[a-zA-Z0-9._-]+$"
            )
        _validate_non_empty_string(self.name, "ColorToken name")
        if not isinstance(self.role, ColorRole):
            raise ValueError("ColorToken role must be a ColorRole")
        if not HEX_VALUE_PATTERN.fullmatch(self.hex_value):
            raise ValueError(
                "ColorToken hex_value must match "
                "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"
            )
        if self.description is not None and not isinstance(self.description, str):
            raise ValueError("ColorToken description must be a string or None")
        _validate_trust_signal(self.trust)
        if not isinstance(self.attribution_actor, ActorKind):
            raise ValueError("ColorToken attribution_actor must be an ActorKind")
        if self.created_at_ms < 0:
            raise ValueError("ColorToken created_at_ms must be >= 0")


@dataclass(frozen=True)
class ContrastPair:
    id: str
    foreground_token_id: str
    background_token_id: str
    ratio: float
    level_normal_text: ContrastLevel
    level_large_text: ContrastLevel
    level_ui_component: ContrastLevel
    computed_at_ms: int

    def __post_init__(self) -> None:
        if not CONTRAST_PAIR_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "ContrastPair id must match ^contrast-pair:[a-zA-Z0-9._-]+$"
            )
        if not COLOR_TOKEN_ID_PATTERN.fullmatch(self.foreground_token_id):
            raise ValueError(
                "ContrastPair foreground_token_id must match "
                "^color-token:[a-zA-Z0-9._-]+$"
            )
        if not COLOR_TOKEN_ID_PATTERN.fullmatch(self.background_token_id):
            raise ValueError(
                "ContrastPair background_token_id must match "
                "^color-token:[a-zA-Z0-9._-]+$"
            )
        if self.foreground_token_id == self.background_token_id:
            raise ValueError(
                "ContrastPair foreground_token_id and background_token_id "
                "must be different"
            )
        if self.ratio < 1.0:
            raise ValueError("ContrastPair ratio must be >= 1.0")
        if not isinstance(self.level_normal_text, ContrastLevel):
            raise ValueError("ContrastPair level_normal_text must be a ContrastLevel")
        if not isinstance(self.level_large_text, ContrastLevel):
            raise ValueError("ContrastPair level_large_text must be a ContrastLevel")
        if not isinstance(self.level_ui_component, ContrastLevel):
            raise ValueError("ContrastPair level_ui_component must be a ContrastLevel")
        if self.computed_at_ms < 0:
            raise ValueError("ContrastPair computed_at_ms must be >= 0")


@dataclass(frozen=True)
class ColorPalette:
    id: str
    workspace_id: str
    tokens: tuple[ColorToken, ...]
    contrast_pairs: tuple[ContrastPair, ...]
    computed_at_ms: int

    def __post_init__(self) -> None:
        if not COLOR_PALETTE_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "ColorPalette id must match ^color-palette:[a-zA-Z0-9._-]+$"
            )
        _validate_non_empty_string(self.workspace_id, "ColorPalette workspace_id")

        try:
            tokens = tuple(self.tokens)
        except TypeError as exc:
            raise ValueError("ColorPalette tokens must be iterable") from exc
        if len(tokens) == 0:
            raise ValueError("ColorPalette tokens must contain at least one token")

        seen_token_ids: set[str] = set()
        for token in tokens:
            if not isinstance(token, ColorToken):
                raise ValueError("ColorPalette tokens must contain ColorToken entries")
            if token.id in seen_token_ids:
                raise ValueError("ColorPalette tokens must be deduped by id")
            seen_token_ids.add(token.id)
        object.__setattr__(self, "tokens", tokens)

        try:
            contrast_pairs = tuple(self.contrast_pairs)
        except TypeError as exc:
            raise ValueError("ColorPalette contrast_pairs must be iterable") from exc
        for pair in contrast_pairs:
            if not isinstance(pair, ContrastPair):
                raise ValueError(
                    "ColorPalette contrast_pairs must contain ContrastPair entries"
                )
        object.__setattr__(self, "contrast_pairs", contrast_pairs)

        if self.computed_at_ms < 0:
            raise ValueError("ColorPalette computed_at_ms must be >= 0")
