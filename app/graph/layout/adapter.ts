import type { ElementDefinition } from "cytoscape";

import { DEFAULT_SIZES } from "./default-sizes";
import type { GraphDefinition, GraphEdge, GraphNode } from "./types";

function toNumericPoint(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;

  const point = value as { x?: unknown; y?: unknown };
  const x = typeof point.x === "number" ? point.x : Number(point.x);
  const y = typeof point.y === "number" ? point.y : Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function readBendPoints(data: Record<string, unknown>): GraphEdge["bendPoints"] {
  const candidates = [
    data.bendPoints,
    data.bend_points,
    data.elkBendPoints,
    data.elk_bend_points,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const bendPoints = candidate
      .map((point) => toNumericPoint(point))
      .filter((point): point is { x: number; y: number } => point !== null);

    if (bendPoints.length > 0) {
      return bendPoints;
    }
  }

  return undefined;
}

export function elementsToGraph(
  elements: ElementDefinition[],
  graphId: string,
  direction?: "DOWN" | "RIGHT",
): GraphDefinition {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const el of elements) {
    const data = el.data || {};

    if (data.source && data.target) {
      edges.push({
        id: data.id || `${data.source}-${data.target}`,
        source: data.source as string,
        target: data.target as string,
        kind: (el.classes as string) || data.kind || "edge",
        label: data.label as string | undefined,
        data: { ...data },
        bendPoints: readBendPoints(data),
      });
    } else {
      const kind = (el.classes as string)?.split(" ")[0] || data.kind || "default";
      const defaultSize = DEFAULT_SIZES[kind];

      nodes.push({
        id: data.id as string,
        kind,
        label: (data.label as string) || (data.id as string),
        data: { ...data },
        position: el.position ? { x: el.position.x, y: el.position.y } : undefined,
        size: defaultSize ? { ...defaultSize } : { width: 150, height: 60 },
        parent: data.parent as string | undefined,
      });
    }
  }

  return { id: graphId, nodes, edges, direction };
}
