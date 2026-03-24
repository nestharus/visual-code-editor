/**
 * Mermaid-as-layout-engine — per governance mermaid-layout-engine.md
 *
 * Uses Mermaid purely as a layout computation engine:
 * 1. Render Mermaid text → SVG string (hidden, never inserted into DOM)
 * 2. Parse SVG to extract node positions, edge paths, subgraph bounds
 * 3. Apply positions to Cytoscape elements with layout: { name: "preset" }
 */

import { parseSvgPath, pathToSegments, extractIntermediatePoints } from "./svg-path";
import type { ElementDefinition } from "cytoscape";

let layoutCounter = 0;

export type NodeGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EdgePath = {
  index: number;
  d: string;
  waypoints: ReturnType<typeof parseSvgPath>;
};

export type MermaidGeometry = {
  nodes: Record<string, NodeGeometry>;
  edges: EdgePath[];
  subgraphs: Record<string, NodeGeometry>;
};

/**
 * Extract node positions from Mermaid SVG.
 */
export function extractNodePositions(
  doc: Document,
): Record<string, NodeGeometry> {
  const positions: Record<string, NodeGeometry> = {};

  doc.querySelectorAll("g.node").forEach((node) => {
    const rawId = node.id;
    const match = rawId.match(/^flowchart-(.+)-\d+$/);
    if (!match) return;
    const nodeId = match[1];

    const transform = node.getAttribute("transform");
    if (!transform) return;
    const coords = transform.match(
      /translate\(\s*([\d.e+-]+)\s*[,\s]\s*([\d.e+-]+)\s*\)/,
    );
    if (!coords) return;

    const rect = node.querySelector("rect, polygon, circle");
    let width = 0;
    let height = 0;
    if (rect && rect.tagName === "rect") {
      width = parseFloat(rect.getAttribute("width") || "0");
      height = parseFloat(rect.getAttribute("height") || "0");
    }

    positions[nodeId] = {
      x: parseFloat(coords[1]),
      y: parseFloat(coords[2]),
      width,
      height,
    };
  });

  return positions;
}

/**
 * Extract subgraph positions from Mermaid SVG.
 */
export function extractSubgraphPositions(
  doc: Document,
): Record<string, NodeGeometry> {
  const positions: Record<string, NodeGeometry> = {};

  doc.querySelectorAll("g.cluster").forEach((cluster) => {
    const id = cluster.id;
    const rect = cluster.querySelector("rect");
    if (!rect) return;

    const x = parseFloat(rect.getAttribute("x") || "0");
    const y = parseFloat(rect.getAttribute("y") || "0");
    const w = parseFloat(rect.getAttribute("width") || "0");
    const h = parseFloat(rect.getAttribute("height") || "0");

    positions[id] = {
      x: x + w / 2,
      y: y + h / 2,
      width: w,
      height: h,
    };
  });

  return positions;
}

/**
 * Extract edge paths from Mermaid SVG.
 */
export function extractEdgePaths(doc: Document): EdgePath[] {
  const paths: EdgePath[] = [];

  doc.querySelectorAll("path.flowchart-link").forEach((path, index) => {
    const d = path.getAttribute("d");
    if (!d) return;
    paths.push({
      index,
      d,
      waypoints: parseSvgPath(d),
    });
  });

  return paths;
}

/**
 * Render Mermaid text and extract layout geometry.
 * Per governance: client-side hidden render, never inserted into DOM.
 */
export async function computeMermaidLayout(
  mermaidText: string,
): Promise<MermaidGeometry | null> {
  if (typeof window === "undefined") return null;

  // Dynamic import — Mermaid is large, only load when needed
  const mermaid = await import("mermaid");
  mermaid.default.initialize({ startOnLoad: false, theme: "dark" });

  const uniqueId = `mermaid-layout-${++layoutCounter}`;

  try {
    const { svg } = await mermaid.default.render(uniqueId, mermaidText);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");

    return {
      nodes: extractNodePositions(doc),
      edges: extractEdgePaths(doc),
      subgraphs: extractSubgraphPositions(doc),
    };
  } catch (err) {
    console.error("Mermaid layout failed:", err);
    return null;
  }
}

/**
 * Apply Mermaid geometry to Cytoscape elements.
 * Per governance: use `segments` curve style, `preset` layout.
 */
export function applyMermaidPositions(
  elements: ElementDefinition[],
  geometry: MermaidGeometry,
): ElementDefinition[] {
  if (!geometry) return elements;

  let edgeIndex = 0;

  return elements.map((el) => {
    if (el.data?.source) {
      // Edge element — apply segment waypoints
      const pathData = geometry.edges[edgeIndex++];
      if (!pathData || !pathData.waypoints.length) return el;

      const sourcePos = geometry.nodes[el.data.source];
      const targetPos = geometry.nodes[el.data.target];
      if (!sourcePos || !targetPos) return el;

      const intermediatePoints = extractIntermediatePoints(pathData.waypoints);
      if (intermediatePoints.length === 0) return el;

      const segments = pathToSegments(intermediatePoints, sourcePos, targetPos);

      return {
        ...el,
        data: {
          ...el.data,
          _segmentWeights: segments["segment-weights"],
          _segmentDistances: segments["segment-distances"],
        },
      };
    }

    // Node element — apply position
    const nodeGeo = geometry.nodes[el.data?.id || ""];
    if (!nodeGeo) return el;

    return {
      ...el,
      position: { x: nodeGeo.x, y: nodeGeo.y },
    };
  });
}
