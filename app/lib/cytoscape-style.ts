import type { Stylesheet } from "cytoscape";
import { nodeVisuals } from "./node-visuals";

// ============================================================
// BASE STYLES — defined once, shared by all card/edge types
// Type-specific selectors only override what's different.
// ============================================================

/** Shadow applied to all interactive (non-parent) nodes */
const nodeShadow = {
  "shadow-blur": 10,
  "shadow-color": "#010409",
  "shadow-offset-y": 4,
  "shadow-offset-x": 0,
  "shadow-opacity": 0.5,
} as const;

/** Icon slot — small subtle type indicator in top-left corner.
 *  Uses percentage of height for both dimensions to keep square.
 *  background-fit:"contain" preserves SVG aspect ratio.
 */
const nodeIcon = (typeKey: string) => ({
  "background-image": nodeVisuals[typeKey]?.iconDataUri ?? "",
  "background-fit": "contain",
  "background-width": "20%",
  "background-height": "20%",
  "background-position-x": "2px",
  "background-position-y": "2px",
  "background-clip": "none",
  "background-image-opacity": 0.4,
});

/** Label slot — consistent across ALL node types */
const nodeLabel = {
  label: "data(label)",
  "text-valign": "center",
  "text-halign": "center",
  color: "#e6edf3",
  "text-wrap": "wrap",
  cursor: "pointer",
} as const;

/** Edge label base — consistent across ALL edge types */
const edgeLabelBase = {
  label: "data(label)",
  color: "#6e7681",
  "text-background-color": "#0d1117",
  "text-background-opacity": 0.8,
  "text-background-padding": "2px",
} as const;

/** Edge routing base */
const edgeBase = {
  "curve-style": "bezier",
  "control-point-step-size": 40,
  "target-arrow-shape": "triangle",
} as const;

// ============================================================
// NODE TYPE DEFINITIONS — only what's unique per type
// ============================================================

type NodeTypeDef = {
  selector: string;
  shape: string;
  bg: string;
  borderColor: string;
  borderWidth: number;
  width: number;
  height: number;
  fontSize: string;
  textMaxWidth: string;
  iconKey: string;
  extra?: Record<string, any>;
};

const nodeTypes: NodeTypeDef[] = [
  {
    selector: "node.cluster",
    shape: "round-rectangle",
    bg: "#161b22",
    borderColor: "data(color)",
    borderWidth: 3,
    width: 160,
    height: 80,
    fontSize: "14px",
    textMaxWidth: "140px",
    iconKey: "cluster",
    extra: { padding: "10px" },
  },
  {
    selector: "node.system",
    shape: "round-rectangle",
    bg: "#161b22",
    borderColor: "data(color)",
    borderWidth: 3,
    width: 150,
    height: 70,
    fontSize: "13px",
    textMaxWidth: "130px",
    iconKey: "system",
  },
  {
    selector: "node.external",
    shape: "round-rectangle",
    bg: "#0d1117",
    borderColor: "#30363d",
    borderWidth: 1,
    width: 130,
    height: 60,
    fontSize: "12px",
    textMaxWidth: "110px",
    iconKey: "external",
    extra: { "border-style": "dashed", opacity: 0.7, color: "#6e7681" },
  },
  {
    selector: "node.store",
    shape: "barrel",
    bg: "#1a1a10",
    borderColor: "#d29922",
    borderWidth: 2,
    width: 120,
    height: 60,
    fontSize: "12px",
    textMaxWidth: "100px",
    iconKey: "store",
  },
  {
    selector: "node.behavioral-lifecycle",
    shape: "round-rectangle",
    bg: "#18222d",
    borderColor: "#58a6ff",
    borderWidth: 3.5,
    width: 210,
    height: 92,
    fontSize: "13px",
    textMaxWidth: "180px",
    iconKey: "behavioral-lifecycle",
    extra: { padding: "10px" },
  },
  {
    selector: "node.behavioral-stage",
    shape: "round-rectangle",
    bg: "#202736",
    borderColor: "#4fa9a0",
    borderWidth: 3,
    width: 180,
    height: 74,
    fontSize: "12px",
    textMaxWidth: "160px",
    iconKey: "behavioral-stage",
  },
  {
    selector: "node.behavioral-step",
    shape: "round-rectangle",
    bg: "#251f2f",
    borderColor: "#d29922",
    borderWidth: 2,
    width: 170,
    height: 64,
    fontSize: "11px",
    textMaxWidth: "150px",
    iconKey: "behavioral-step",
  },
  {
    selector: "node.file-node",
    shape: "round-rectangle",
    bg: "#161b22",
    borderColor: "data(color)",
    borderWidth: 2,
    width: 170,
    height: 50,
    fontSize: "10px",
    textMaxWidth: "155px",
    iconKey: "file-node",
    extra: { "text-wrap": "ellipsis" },
  },
  {
    selector: "node.agent-node",
    shape: "hexagon",
    bg: "#1a1525",
    borderColor: "#9D7BEE",
    borderWidth: 2,
    width: 170,
    height: 55,
    fontSize: "10px",
    textMaxWidth: "120px",
    iconKey: "agent-node",
    extra: { "text-wrap": "ellipsis" },
  },
];

// Build node stylesheets from definitions
const nodeStylesheets: Stylesheet[] = nodeTypes.map((def) => ({
  selector: def.selector,
  style: {
    // Shape
    shape: def.shape,
    "background-color": def.bg,
    "border-color": def.borderColor,
    "border-width": def.borderWidth,
    width: def.width,
    height: def.height,
    // Icon (shared)
    ...nodeIcon(def.iconKey),
    // Label (shared)
    ...nodeLabel,
    "font-size": def.fontSize,
    "text-max-width": def.textMaxWidth,
    // Shadow (shared)
    ...nodeShadow,
    // Type-specific overrides
    ...def.extra,
  } as any,
}));

// ============================================================
// EDGE DEFINITIONS
// ============================================================

const edgeStylesheets: Stylesheet[] = [
  {
    selector: "edge.cluster-edge",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "line-color": "#30363d",
      "target-arrow-color": "#30363d",
      width: 2,
      "font-size": "10px",
      "text-background-padding": "3px",
      cursor: "pointer",
    },
  },
  {
    selector: "edge.system-edge",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "line-color": "#484f58",
      "target-arrow-color": "#484f58",
      width: 2,
      "font-size": "9px",
      cursor: "pointer",
    },
  },
  {
    selector: "edge.store-edge",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "line-color": "#d29922",
      "target-arrow-color": "#d29922",
      width: 1,
      "line-style": "dashed",
      opacity: 0.6,
      "font-size": "10px",
      color: "#d29922",
    },
  },
  {
    selector: "edge.behavioral-edge",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "control-point-step-size": 8,
      "target-arrow-fill": "filled",
      "line-color": "#4fa9a0",
      "target-arrow-color": "#4fa9a0",
      "arrow-scale": 1.25,
      width: 2.4,
      opacity: 0.92,
      "font-size": "11px",
      color: "#9aa4af",
      "text-max-width": "200px",
      "text-wrap": "wrap",
      "text-background-opacity": 0.95,
      "text-background-padding": "3px",
      "text-margin-y": "-8px",
      cursor: "pointer",
    },
  },
  {
    selector: "edge.behavioral-back-edge",
    style: {
      "curve-style": "unbundled-bezier",
      "control-point-distances": "140",
      "control-point-weights": "0.5",
      "line-style": "dashed",
      "line-color": "#d29922",
      "target-arrow-color": "#d29922",
      "target-arrow-shape": "triangle",
      width: 2,
      ...edgeLabelBase,
      "font-size": "9px",
      color: "#d29922",
      "text-max-width": "120px",
      "text-wrap": "wrap",
    },
  },
  {
    selector: "edge.file-import",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "control-point-step-size": 30,
      "line-color": "#262b33",
      "target-arrow-color": "#262b33",
      width: 1,
      "font-size": "8px",
      "text-background-opacity": 0.7,
    },
  },
  {
    selector: "edge.agent-invoke",
    style: {
      ...edgeBase,
      ...edgeLabelBase,
      "line-color": "#9D7BEE",
      "target-arrow-color": "#9D7BEE",
      width: 1.5,
      "line-style": "dotted",
      "font-size": "8px",
      "text-background-opacity": 0.7,
    },
  },
];

// ============================================================
// COMPOUND / STATE / ZOOM STYLES
// ============================================================

const stateStylesheets: Stylesheet[] = [
  // Compound parent (module groups)
  {
    selector: "node.module-group",
    style: {
      shape: "round-rectangle",
      "background-color": "rgba(22, 27, 34, 0.5)",
      "border-color": "#30363d",
      "border-width": 1,
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "center",
      color: "#9aa4af",
      "font-size": "11px",
      padding: "18px",
      "text-margin-y": "-4px",
      events: "no",
    } as any,
  },
  // Panel selection
  {
    selector: "node.panel-active",
    style: {
      "border-width": 3,
      "border-color": "#58a6ff",
      "border-style": "double",
    },
  },
  // --- Semantic zoom tiers ---
  {
    selector: "node.zoom-dot:not(:parent)",
    style: {
      label: "",
      "background-image-opacity": 0,
      "shadow-opacity": 0,
    },
  },
  {
    selector: "node.zoom-icon:not(:parent)",
    style: {
      label: "",
      "shadow-opacity": 0,
    },
  },
  {
    selector: "node.zoom-label:not(:parent)",
    style: {
      "font-size": "10px",
    },
  },
  // Edge labels hidden at low zoom
  {
    selector: "edge.zoom-hide-labels",
    style: {
      label: "",
    },
  },
  // Interaction states
  {
    selector: "node:active, node:selected",
    style: {
      "overlay-opacity": 0.1,
    },
  },
  {
    selector: ".highlighted",
    style: {
      "z-index": 999,
      "z-index-compare": "manual",
      "transition-property": "opacity",
      "transition-duration": "0.15s",
    },
  },
  {
    selector: "edge.highlighted",
    style: {
      width: 3,
      "z-index": 999,
      "z-index-compare": "manual",
      opacity: 1,
    },
  },
  {
    selector: "edge.flow-animated",
    style: {
      "line-style": "dashed",
      "line-dash-pattern": [10, 6],
      "line-dash-offset": 0,
    },
  },
  {
    selector: ".neighbor-highlighted",
    style: {
      opacity: 1,
      "z-index": 998,
      "z-index-compare": "manual",
    },
  },
  {
    selector: ".hover-hidden",
    style: {
      opacity: 0,
      "transition-property": "opacity",
      "transition-duration": "0.05s",
    },
  },
  {
    selector: ".dimmed",
    style: {
      opacity: 0.18,
      "transition-property": "opacity",
      "transition-duration": "0.3s",
    },
  },
  {
    selector: ".dimmed.highlighted, .dimmed.neighbor-highlighted",
    style: {
      opacity: 1,
    },
  },
];

// ============================================================
// EXPORT — compose all stylesheets
// ============================================================

export const cytoscapeStyle: Stylesheet[] = [
  ...nodeStylesheets,
  ...edgeStylesheets,
  ...stateStylesheets,
];
