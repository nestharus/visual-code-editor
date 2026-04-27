import shutil
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from visual_code_editor.model.widget import WidgetKind

from src.visual_code_editor.extractor.widget_extractor import extract_widgets


FIXTURE_ROOT = Path(__file__).resolve().parent / "widget_fixtures"


@pytest.fixture
def workspace_root(tmp_path):
    workspace = tmp_path / "workspace"
    shutil.copytree(FIXTURE_ROOT, workspace)
    return workspace


def _widgets_by_id(workspace_root: Path):
    return {
        widget.id: widget
        for widget in extract_widgets(str(workspace_root))
    }


def _widget_ids(workspace_root: Path):
    return [widget.id for widget in extract_widgets(str(workspace_root))]


def test_extract_widgets_walks_tsx_files_only(workspace_root):
    ids = _widget_ids(workspace_root)

    assert "widget:app.components.FunctionButton.SaveButton" in ids
    assert "widget:app.components.SkippedButton.SkippedButton" not in ids


def test_extract_widgets_detects_export_function_component(workspace_root):
    widgets = _widgets_by_id(workspace_root)

    widget = widgets["widget:app.components.FunctionButton.SaveButton"]

    assert widget.kind is WidgetKind.BUTTON


def test_extract_widgets_detects_export_const_arrow_component(workspace_root):
    widgets = _widgets_by_id(workspace_root)

    widget = widgets["widget:app.components.ConstInput.SearchInput"]

    assert widget.kind is WidgetKind.INPUT


def test_extract_widgets_detects_export_default_function_component(workspace_root):
    widgets = _widgets_by_id(workspace_root)

    widget = widgets["widget:app.graph.cards.DefaultModal.ConfirmModal"]

    assert widget.kind is WidgetKind.MODAL


def test_extract_widgets_emits_each_component_in_a_multi_component_file(workspace_root):
    ids = _widget_ids(workspace_root)

    assert "widget:app.lib.MixedWidgets.BehaviourCard" in ids
    assert "widget:app.lib.MixedWidgets.StatusBadge" in ids
    assert "widget:app.lib.MixedWidgets.SummaryPanel" in ids


@pytest.mark.parametrize(
    ("component_name", "expected_kind"),
    (
        ("ActionButton", WidgetKind.BUTTON),
        ("LoginForm", WidgetKind.FORM),
        ("BehaviourCard", WidgetKind.CARD),
        ("MyIcon", WidgetKind.ICON),
        ("SearchInput", WidgetKind.INPUT),
        ("NotesTextarea", WidgetKind.INPUT),
        ("ProfileField", WidgetKind.INPUT),
        ("ResultList", WidgetKind.LIST),
        ("ConfirmModal", WidgetKind.MODAL),
        ("SettingsDialog", WidgetKind.MODAL),
        ("PlaybackShadowbox", WidgetKind.MODAL),
        ("SettingsTab", WidgetKind.TAB),
        ("DetailPanel", WidgetKind.PANEL),
        ("HintTooltip", WidgetKind.TOOLTIP),
        ("AlertBanner", WidgetKind.BANNER),
        ("StatusChip", WidgetKind.CHIP),
        ("InfoBadge", WidgetKind.CHIP),
        ("MetricsTable", WidgetKind.TABLE),
        ("UserAvatar", WidgetKind.AVATAR),
    ),
)
def test_extract_widgets_classifies_kind_by_component_name(
    workspace_root,
    component_name,
    expected_kind,
):
    widgets = _widgets_by_id(workspace_root)

    widget = widgets[f"widget:app.lib.KindMatrix.{component_name}"]

    assert widget.kind is expected_kind


def test_extract_widgets_uses_generic_kind_when_no_name_pattern_matches(workspace_root):
    widgets = _widgets_by_id(workspace_root)

    widget = widgets["widget:app.lib.KindMatrix.Foo"]

    assert widget.kind is WidgetKind.GENERIC


def test_extract_widgets_derives_id_from_relative_path_and_component_name(workspace_root):
    ids = _widget_ids(workspace_root)

    assert "widget:app.components.DetailPanel.DetailPanel" in ids


def test_extract_widgets_file_paths_filter_scans_only_supplied_paths(workspace_root):
    widgets = extract_widgets(
        str(workspace_root),
        file_paths=(str(workspace_root / "app/components/ConstInput.tsx"),),
    )

    assert [widget.id for widget in widgets] == [
        "widget:app.components.ConstInput.SearchInput",
    ]


def test_extract_widgets_is_deterministic_and_deduplicated(workspace_root):
    first = extract_widgets(str(workspace_root))
    second = extract_widgets(str(workspace_root))

    assert second == first
    assert [widget.id for widget in first] == sorted({widget.id for widget in first})
