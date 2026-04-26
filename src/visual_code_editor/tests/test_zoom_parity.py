import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.channels import VisualChannel
from visual_code_editor.model.zoom import (
    LabelTarget,
    ZoomBand,
    channel_budget_cap,
    edge_bundling,
    hit_test_precision,
    label_visibility,
    zoom_band_for_factor,
)


PARITY_SCENARIOS = (
    {
        "name": "overview orientation",
        "factor": 0.0,
        "label": ("overview", "container-header"),
        "channel": ("overview", "border"),
        "edge": "overview",
        "hit": "overview",
    },
    {
        "name": "overview suppressed node label",
        "factor": 0.399,
        "label": ("overview", "node-label"),
        "channel": ("overview", "caption-row"),
        "edge": "overview",
        "hit": "overview",
    },
    {
        "name": "structure boundary",
        "factor": 0.4,
        "label": ("structure", "node-label"),
        "channel": ("structure", "badge-cluster"),
        "edge": "structure",
        "hit": "structure",
    },
    {
        "name": "structure chevron",
        "factor": 0.799,
        "label": ("structure", "edge-label"),
        "channel": ("structure", "chevron-slot"),
        "edge": "structure",
        "hit": "structure",
    },
    {
        "name": "detail boundary",
        "factor": 0.8,
        "label": ("detail", "edge-label"),
        "channel": ("detail", "border"),
        "edge": "detail",
        "hit": "detail",
    },
    {
        "name": "detail caption",
        "factor": 1.399,
        "label": ("detail", "node-label"),
        "channel": ("detail", "caption-row"),
        "edge": "detail",
        "hit": "detail",
    },
    {
        "name": "inspect boundary",
        "factor": 1.4,
        "label": ("inspect", "edge-artifact-chips"),
        "channel": ("inspect", "motion-channel"),
        "edge": "inspect",
        "hit": "inspect",
    },
    {
        "name": "inspect behaviour slice",
        "factor": 2.499,
        "label": ("inspect", "behaviour-card-slice"),
        "channel": ("inspect", "badge-cluster"),
        "edge": "inspect",
        "hit": "inspect",
    },
    {
        "name": "source boundary",
        "factor": 2.5,
        "label": ("source", "behaviour-card-slice"),
        "channel": ("source", "caption-row"),
        "edge": "source",
        "hit": "source",
    },
    {
        "name": "source max",
        "factor": 8.0,
        "label": ("source", "edge-label"),
        "channel": ("source", "motion-channel"),
        "edge": "source",
        "hit": "source",
    },
)


def _py_scenario_payload(scenario):
    label_band, label_target = scenario["label"]
    channel_band, channel = scenario["channel"]
    edge_band = scenario["edge"]
    hit_band = scenario["hit"]

    cap = channel_budget_cap(
        ZoomBand(channel_band),
        VisualChannel(channel),
    )
    bundling = edge_bundling(ZoomBand(edge_band))
    hit_test = hit_test_precision(ZoomBand(hit_band))

    return {
        "name": scenario["name"],
        "zoomBandForFactor": zoom_band_for_factor(scenario["factor"]).value,
        "labelVisibility": label_visibility(
            ZoomBand(label_band),
            LabelTarget(label_target),
        ).value,
        "channelBudgetCap": {
            "zoomBand": cap.zoom_band.value,
            "channel": cap.channel.value,
            "maxVisibleClaimants": cap.max_visible_claimants,
            "overflowMode": cap.overflow_mode.value,
        },
        "edgeBundling": {
            "zoomBand": bundling.zoom_band.value,
            "bundleThreshold": bundling.bundle_threshold,
            "bundlingActive": bundling.bundling_active,
        },
        "hitTestPrecision": {
            "zoomBand": hit_test.zoom_band.value,
            "edgeHitRadiusPx": hit_test.edge_hit_radius_px,
            "nodeLabelHitPaddingPx": hit_test.node_label_hit_padding_px,
        },
    }


def test_python_and_typescript_zoom_projections_match_for_representative_scenarios():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-zoom.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "scenarios": [_py_scenario_payload(scenario) for scenario in PARITY_SCENARIOS],
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript zoom projections "
        "must agree for representative factors, label rules, channel caps, edge bundling, "
        "and hit-test precision"
    )
