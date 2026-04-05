import type { ElementDefinition } from "cytoscape";

import { DEFAULT_SIZES } from "./default-sizes";
import type { GraphDefinition, GraphEdge, GraphNode } from "./types";

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
