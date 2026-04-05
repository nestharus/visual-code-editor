import type { ElementDefinition } from "cytoscape";

import { DEFAULT_SIZES } from "./default-sizes";
import type { GraphDefinition, GraphEdge, GraphNode } from "./types";

type GraphDirection = GraphDefinition["direction"];

type GraphAdapterOptions = {
  graphId: string;
  direction?: GraphDirection;
  mermaidText?: string;
};

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

function readDirectionFromMermaid(mermaidText?: string): GraphDirection {
  if (!mermaidText) return undefined;

  const match = mermaidText.match(/(?:^|\n)\s*(?:flowchart|graph)\s+([a-z]{2})\b/i);
  if (!match) return undefined;

  const token = match[1].toUpperCase();
  if (token === "LR" || token === "RL") {
    return "RIGHT";
  }
  if (token === "TD" || token === "TB" || token === "BT") {
    return "DOWN";
  }

  return undefined;
}

function inferDirectionFromGraphId(graphId: string): GraphDirection {
  if (graphId.startsWith("/organizational")) {
    return graphId.includes("/systems/") ? "DOWN" : "RIGHT";
  }

  if (graphId.startsWith("/behavioral")) {
    return graphId.includes("/lifecycles/") ? "DOWN" : "RIGHT";
  }

  return undefined;
}

function inferDirectionFromNodes(nodes: GraphNode[]): GraphDirection {
  if (
    nodes.some((node) =>
      ["module-group", "file-node", "agent-node", "behavioral-stage", "behavioral-step"].includes(
        node.kind,
      ),
    )
  ) {
    return "DOWN";
  }

  if (
    nodes.some((node) =>
      ["cluster", "system", "external", "store", "behavioral-lifecycle"].includes(
        node.kind,
      ),
    )
  ) {
    return "RIGHT";
  }

  return undefined;
}

export function resolveGraphDirection(input: {
  graphId: string;
  mermaidText?: string;
  nodes?: GraphNode[];
}): GraphDirection {
  return (
    readDirectionFromMermaid(input.mermaidText) ??
    inferDirectionFromGraphId(input.graphId) ??
    inferDirectionFromNodes(input.nodes ?? [])
  );
}

export function elementsToGraph(
  elements: ElementDefinition[],
  options: string | GraphAdapterOptions,
): GraphDefinition {
  const config: GraphAdapterOptions =
    typeof options === "string" ? { graphId: options } : options;
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

  return {
    id: config.graphId,
    nodes,
    edges,
    direction:
      config.direction ??
      resolveGraphDirection({
        graphId: config.graphId,
        mermaidText: config.mermaidText,
        nodes,
      }),
  };
}
