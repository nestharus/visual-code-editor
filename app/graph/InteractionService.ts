import { createMemo, createSignal, type Accessor } from "solid-js";

import type { GraphDefinition, GraphEdge } from "./layout/types";

export function getNeighborIds(nodeId: string, edges: GraphEdge[]): Set<string> {
  const neighbors = new Set<string>();

  for (const edge of edges) {
    if (edge.source === nodeId) {
      neighbors.add(edge.target);
    } else if (edge.target === nodeId) {
      neighbors.add(edge.source);
    }
  }

  return neighbors;
}

export function createInteractionService(graph: Accessor<GraphDefinition>) {
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);

  const highlightedNodeIds = createMemo(() => {
    const hovered = hoveredNodeId();
    if (!hovered) return new Set<string>();

    return new Set([hovered, ...getNeighborIds(hovered, graph().edges)]);
  });

  const dimmedNodes = createMemo(() => {
    const hovered = hoveredNodeId();
    if (!hovered) return new Set<string>();

    const keepVisible = highlightedNodeIds();
    return new Set(
      graph()
        .nodes
        .filter((node) => !keepVisible.has(node.id))
        .map((node) => node.id),
    );
  });

  const highlightedEdges = createMemo(() => {
    const hovered = hoveredNodeId();
    if (!hovered) return new Set<string>();

    return new Set(
      graph()
        .edges
        .filter((edge) => edge.source === hovered || edge.target === hovered)
        .map((edge) => edge.id),
    );
  });

  return {
    hoveredNodeId,
    setHoveredNodeId,
    highlightedNodeIds,
    dimmedNodes,
    highlightedEdges,
  };
}

export type InteractionService = ReturnType<typeof createInteractionService>;
