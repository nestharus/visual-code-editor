"""Print reusable UI widgets for a workspace as JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from visual_code_editor.extractor.widget_extractor import extract_widgets
from visual_code_editor.model.widget import Widget, WidgetReference


def _reference_to_payload(reference: WidgetReference) -> dict[str, str]:
    return {
        "surface": reference.surface.value,
        "identifier": reference.identifier,
        "evidenceSource": reference.evidence_source,
    }


def _widget_to_payload(widget: Widget) -> dict[str, object]:
    return {
        "id": widget.id,
        "label": widget.label,
        "kind": widget.kind.value,
        "references": [
            _reference_to_payload(reference) for reference in widget.references
        ],
        "trust": {
            "state": widget.trust.state.value,
            "grounding": (
                widget.trust.grounding.value
                if widget.trust.grounding is not None
                else None
            ),
        },
        "attributionActor": widget.attribution_actor.value,
        "createdAtMs": widget.created_at_ms,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract reusable UI widgets from a workspace."
    )
    parser.add_argument(
        "--workspace-root",
        default=".",
        help="Workspace root to scan. Defaults to the current directory.",
    )
    args = parser.parse_args()

    workspace_root = Path(args.workspace_root).resolve()
    widgets = extract_widgets(str(workspace_root))
    json.dump([_widget_to_payload(widget) for widget in widgets], sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
