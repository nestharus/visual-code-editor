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
/**
 * Sanitize mermaid text for v11 compatibility.
 * Strips characters and patterns that cause parse failures in newer mermaid.
 */
function sanitizeMermaidText(text: string): string {
  return text
    // Strip HTML line breaks globally so all Mermaid label syntaxes stay parseable
    .replace(/<br\s*\/?>/gi, " ")
    // Simplify node labels: keep only the first line (filename), drop symbol lists
    .replace(/\["([^"]*?)<br\s*\/?>[^"]*"\]/g, '["$1"]')
    // Replace middle dots and other problematic unicode
    .replace(/[·]/g, ".");
}

export async function computeMermaidLayout(
  mermaidText: string,
): Promise<MermaidGeometry | null> {
  if (typeof window === "undefined") return null;

  const mermaid = await import("mermaid");
  mermaid.default.initialize({ startOnLoad: false, theme: "dark" });

  const sanitized = sanitizeMermaidText(mermaidText);
  const uniqueId = `mermaid-layout-${++layoutCounter}`;

  try {
    const { svg } = await mermaid.default.render(uniqueId, sanitized);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");

    const nodes = extractNodePositions(doc);
    const edges = extractEdgePaths(doc);
    const subgraphs = extractSubgraphPositions(doc);

    // Debug: log raw SVG node IDs vs extracted
    const rawNodeIds: string[] = [];
    doc.querySelectorAll("g.node").forEach((n) => rawNodeIds.push(n.id));
    console.log(`[mermaid] raw SVG node ids:`, rawNodeIds.slice(0, 5).join(", "), rawNodeIds.length > 5 ? `... (${rawNodeIds.length} total)` : "");
    console.log(`[mermaid] extracted nodes: ${Object.keys(nodes).length}, edges: ${edges.length}, subgraphs: ${Object.keys(subgraphs).length}`);

    return { nodes, edges, subgraphs };
  } catch (err) {
    console.error("Mermaid layout failed:", err);
    return null;
  }
}

/**
 * Convert a Cytoscape node ID to the mermaid-safe format used in SVG output.
 * Must match Python's _mermaid_safe_id() and old app.js mermaidSafeNodeId().
 */
function toMermaidSafeId(nodeId: string): string {
  return String(nodeId || "").replace(/[:\s\-]/g, "_");
}

function lookupNodeGeo(
  geometry: MermaidGeometry,
  nodeId: string,
): NodeGeometry | undefined {
  return (
    geometry.nodes[nodeId] ||
    geometry.nodes[toMermaidSafeId(nodeId)] ||
    geometry.subgraphs[nodeId] ||
    geometry.subgraphs[toMermaidSafeId(nodeId)]
  );
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

  const result = elements.map((el) => {
    if (el.data?.source) {
      // Edge element — apply segment waypoints
      const pathData = geometry.edges[edgeIndex++];
      if (!pathData || !pathData.waypoints.length) return el;

      const sourcePos = lookupNodeGeo(geometry, el.data.source);
      const targetPos = lookupNodeGeo(geometry, el.data.target);
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

    // Node element — apply position (try raw ID, then mermaid-safe ID)
    const nodeGeo = lookupNodeGeo(geometry, el.data?.id || "");
    if (!nodeGeo) return el;

    return {
      ...el,
      position: { x: nodeGeo.x, y: nodeGeo.y },
    };
  });

  // Fix up unpositioned nodes: place them near their parent or a connected neighbor
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const el of result) {
    if (el.position && el.data?.id) {
      positionMap.set(el.data.id, el.position as { x: number; y: number });
    }
  }

  const positionedNodes = Array.from(positionMap.values());
  const fallbackAnchor =
    positionedNodes.length > 0
      ? {
          x:
            positionedNodes.reduce((sum, pos) => sum + pos.x, 0) /
            positionedNodes.length,
          y:
            positionedNodes.reduce((sum, pos) => sum + pos.y, 0) /
            positionedNodes.length,
        }
      : { x: 0, y: 0 };

  const parentIds = new Set(
    result.map((el) => el.data?.parent).filter(Boolean) as string[],
  );
  const groups = new Map<
    string,
    { anchor: { x: number; y: number }; indexes: number[] }
  >();
  const gap = 200;

  const addToGroup = (
    key: string,
    anchor: { x: number; y: number },
    index: number,
  ) => {
    const group = groups.get(key);
    if (group) {
      group.indexes.push(index);
      return;
    }
    groups.set(key, { anchor, indexes: [index] });
  };

  for (let i = 0; i < result.length; i++) {
    const el = result[i];
    const nodeId = el.data?.id;
    if (el.data?.source || el.position || !nodeId || parentIds.has(nodeId)) {
      continue;
    }

    const parentId = el.data?.parent;
    const parentPos = parentId ? positionMap.get(parentId) : undefined;
    if (parentId && parentPos) {
      addToGroup(`parent:${parentId}`, parentPos, i);
      continue;
    }

    let neighborId: string | undefined;
    let neighborPos: { x: number; y: number } | undefined;
    for (const other of elements) {
      if (!other.data?.source) continue;
      const candidateId =
        other.data.source === nodeId
          ? other.data.target
          : other.data.target === nodeId
            ? other.data.source
            : undefined;
      if (!candidateId) continue;
      const candidatePos = positionMap.get(candidateId);
      if (!candidatePos) continue;
      neighborId = candidateId;
      neighborPos = candidatePos;
      break;
    }

    if (neighborId && neighborPos) {
      addToGroup(`neighbor:${neighborId}`, neighborPos, i);
      continue;
    }

    addToGroup("fallback:center", fallbackAnchor, i);
  }

  for (const group of groups.values()) {
    const cols = Math.ceil(Math.sqrt(group.indexes.length));
    const rows = Math.ceil(group.indexes.length / cols);

    group.indexes.forEach((resultIndex, groupIndex) => {
      const col = groupIndex % cols;
      const row = Math.floor(groupIndex / cols);
      const position = {
        x: group.anchor.x + (col - (cols - 1) / 2) * gap,
        y: group.anchor.y + (row - (rows - 1) / 2) * gap,
      };

      result[resultIndex] = { ...result[resultIndex], position };
      positionMap.set(result[resultIndex].data!.id!, position);
    });
  }

  return result;
}
