import { Store } from "@tanstack/solid-store";

export type HighlightState = {
  hoveredNodeId: string | null;
  neighborIds: string[];
  activeEdgeIds: string[];
};

export type DiagramRuntimeState = {
  highlight: HighlightState;
  reducedMotion: boolean;
  activeAnimationIds: string[];
};

export const diagramStore = new Store<DiagramRuntimeState>({
  highlight: {
    hoveredNodeId: null,
    neighborIds: [],
    activeEdgeIds: [],
  },
  reducedMotion:
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  activeAnimationIds: [],
});

export function setHoveredNode(
  nodeId: string | null,
  neighborIds: string[] = [],
  edgeIds: string[] = [],
) {
  diagramStore.setState((s) => ({
    ...s,
    highlight: {
      hoveredNodeId: nodeId,
      neighborIds,
      activeEdgeIds: edgeIds,
    },
  }));
}

export function clearHighlight() {
  diagramStore.setState((s) => ({
    ...s,
    highlight: {
      hoveredNodeId: null,
      neighborIds: [],
      activeEdgeIds: [],
    },
  }));
}
