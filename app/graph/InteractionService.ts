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
  const [hoveredEdgeId, setHoveredEdgeId] = createSignal<string | null>(null);

  const edgeById = createMemo(() => new Map(graph().edges.map((edge) => [edge.id, edge])));

  // Compound node detection: nodes that appear as a parent of other nodes.
  const compoundIds = createMemo(() => {
    const parents = new Set<string>();
    for (const node of graph().nodes) {
      if (node.parent) parents.add(node.parent);
    }
    return parents;
  });

  // Priority: non-compound node hover > edge hover > compound node hover > nothing
  const hoveredNodeIsCompound = createMemo(() => {
    const id = hoveredNodeId();
    return id ? compoundIds().has(id) : false;
  });

  const highlightedByEdgeHover = createMemo(() => {
    // Non-compound node hover takes priority over edge hover
    if (hoveredNodeId() && !hoveredNodeIsCompound()) return null;
    const edgeId = hoveredEdgeId();
    if (!edgeId) return null;
    const edge = edgeById().get(edgeId);
    if (!edge) return null;
    return {
      edgeIds: new Set([edge.id]),
      nodeIds: new Set([edge.source, edge.target]),
    };
  });

  const highlightedNodeIds = createMemo(() => {
    // Edge hover takes priority over compound node hover
    const edgeHighlight = highlightedByEdgeHover();
    if (edgeHighlight) return edgeHighlight.nodeIds;
    const hovered = hoveredNodeId();
    if (hovered) return new Set([hovered, ...getNeighborIds(hovered, graph().edges)]);
    return new Set<string>();
  });

  const highlightedEdges = createMemo(() => {
    // Edge hover takes priority over compound node hover
    const edgeHighlight = highlightedByEdgeHover();
    if (edgeHighlight) return edgeHighlight.edgeIds;
    const hovered = hoveredNodeId();
    if (hovered) {
      return new Set(
        graph()
          .edges
          .filter((edge) => edge.source === hovered || edge.target === hovered)
          .map((edge) => edge.id),
      );
    }
    return new Set<string>();
  });

  const dimmedNodes = createMemo(() => {
    const keep = highlightedNodeIds();
    if (keep.size === 0) return new Set<string>();
    return new Set(
      graph()
        .nodes
        .filter((node) => !keep.has(node.id))
        .map((node) => node.id),
    );
  });

  const dimmedEdges = createMemo(() => {
    const keep = highlightedEdges();
    if (keep.size === 0) return new Set<string>();
    return new Set(
      graph()
        .edges
        .filter((edge) => !keep.has(edge.id))
        .map((edge) => edge.id),
    );
  });

  // Flow-focus: active transport nodes/edges override hover highlighting
  const [flowNodeIds, setFlowNodeIds] = createSignal<Set<string>>(new Set());
  const [flowEdgeIds, setFlowEdgeIds] = createSignal<Set<string>>(new Set());

  function setFlowFocus(nodes: Set<string>, edges: Set<string>) {
    setFlowNodeIds(nodes);
    setFlowEdgeIds(edges);
  }

  function clearFlowFocus() {
    setFlowNodeIds(new Set());
    setFlowEdgeIds(new Set());
  }

  const [selectedNodeIds, setSelectedNodeIds] = createSignal<Set<string>>(new Set());

  function toggleSelection(nodeId: string) {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        if (next.size >= 10) return prev;
        next.add(nodeId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedNodeIds(new Set());
  }

  const isFlowActive = createMemo(() => flowNodeIds().size > 0 || flowEdgeIds().size > 0);

  const overlayEdgeIds = createMemo(() => {
    if (isFlowActive()) {
      return new Set([...highlightedEdges(), ...flowEdgeIds()]);
    }
    return highlightedEdges();
  });

  return {
    hoveredNodeId,
    setHoveredNodeId,
    hoveredEdgeId,
    setHoveredEdgeId,
    highlightedNodeIds,
    highlightedEdges,
    dimmedNodes,
    dimmedEdges,
    overlayEdgeIds,
    flowNodeIds,
    flowEdgeIds,
    setFlowFocus,
    clearFlowFocus,
    isFlowActive,
    selectedNodeIds,
    toggleSelection,
    clearSelection,
  };
}

export type InteractionService = ReturnType<typeof createInteractionService>;
