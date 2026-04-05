import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { DiagramElementDefinition } from "../lib/diagram-elements";
import { EdgeLayer } from "./EdgeLayer";
import { GraphViewport } from "./GraphViewport";
import { createInteractionService } from "./InteractionService";
import { NodeLayer } from "./NodeLayer";
import { createTransitionService } from "./TransitionService";
import { elementsToGraph, resolveGraphDirection } from "./layout/adapter";
import { computeElkLayout } from "./layout/elk-layout";
import type { GraphDefinition, GraphNode } from "./layout/types";
import "./styles/graph-surface.css";

type GraphSurfaceProps = {
  graphId: string;
  graph?: GraphDefinition;
  elements?: DiagramElementDefinition[];
  mermaidText?: string;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
};

const EMPTY_GRAPH: GraphDefinition = {
  id: "empty",
  nodes: [],
  edges: [],
};

function getNodeBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const width = node.size?.width ?? 150;
    const height = node.size?.height ?? 60;
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    minX = Math.min(minX, x - width / 2);
    minY = Math.min(minY, y - height / 2);
    maxX = Math.max(maxX, x + width / 2);
    maxY = Math.max(maxY, y + height / 2);
  }

  return { minX, minY, maxX, maxY };
}

function normalizeGraph(graph: GraphDefinition, padding = 80): GraphDefinition {
  if (graph.nodes.length === 0) return graph;

  const bounds = getNodeBounds(graph.nodes);
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!node.position) return node;
      return {
        ...node,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
      };
    }),
    edges: graph.edges.map((edge) => {
      if (!edge.bendPoints?.length) return edge;

      return {
        ...edge,
        bendPoints: edge.bendPoints.map((point) => ({
          x: point.x + offsetX,
          y: point.y + offsetY,
        })),
      };
    }),
  };
}

function hasPosition(node: GraphNode) {
  return (
    !!node.position &&
    Number.isFinite(node.position.x) &&
    Number.isFinite(node.position.y)
  );
}

function needsElkLayout(graph: GraphDefinition) {
  return graph.nodes.length > 0 && graph.nodes.some((node) => !hasPosition(node));
}

async function ensureElkLayout(graph: GraphDefinition): Promise<GraphDefinition> {
  if (!needsElkLayout(graph)) {
    return graph;
  }

  const layout = await computeElkLayout(graph);
  return {
    ...graph,
    nodes: layout.nodes,
    edges: layout.edges,
  };
}

async function buildGraphDefinition(props: GraphSurfaceProps): Promise<GraphDefinition> {
  if (props.graph) {
    const graph =
      props.graph.direction ||
      !props.graphId ||
      props.graph.nodes.length === 0
        ? props.graph
        : {
            ...props.graph,
            direction: resolveGraphDirection({
              graphId: props.graphId,
              mermaidText: props.mermaidText,
              nodes: props.graph.nodes,
            }),
          };

    return normalizeGraph(await ensureElkLayout(graph));
  }

  const elements = props.elements ?? [];
  const graph = elementsToGraph(elements, {
    graphId: props.graphId,
    mermaidText: props.mermaidText,
  });

  return normalizeGraph(await ensureElkLayout(graph));
}

export function GraphSurface(props: GraphSurfaceProps) {
  const [displayedGraph, setDisplayedGraph] = createSignal<GraphDefinition>(EMPTY_GRAPH);
  const [zoomLevel, setZoomLevel] = createSignal(1);
  const [fitVersion, setFitVersion] = createSignal(0);

  const activeGraph = createMemo(() => displayedGraph());
  const interaction = createInteractionService(activeGraph);
  const transition = createTransitionService();

  let transitionTimer: number | undefined;
  let loadSequence = 0;

  const clearTransitionTimer = () => {
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = undefined;
    }
  };

  const commitGraph = (nextGraph: GraphDefinition, animate: boolean) => {
    clearTransitionTimer();
    interaction.setHoveredNodeId(null);
    const previousNodeCount = activeGraph().nodes.length;

    if (!animate || transition.prefersReducedMotion()) {
      setDisplayedGraph(nextGraph);
      setFitVersion((version) => version + 1);
      transition.clear();
      if (previousNodeCount === 0) {
        transition.startEnter(nextGraph.nodes);
      }
      return;
    }

    const currentGraph = activeGraph();
    transition.startExit(currentGraph.nodes);

    transitionTimer = window.setTimeout(() => {
      setDisplayedGraph(nextGraph);
      setFitVersion((version) => version + 1);
      interaction.setHoveredNodeId(null);
      transition.startEnter(nextGraph.nodes);
    }, transition.exitDurationMs);
  };

  createEffect(() => {
    const graphId = props.graphId;
    const graph = props.graph;
    const elements = props.elements;
    const mermaidText = props.mermaidText;
    const sequence = ++loadSequence;

    void (async () => {
      const nextGraph = await buildGraphDefinition({
        graphId,
        graph,
        elements,
        mermaidText,
      });

      if (sequence !== loadSequence) return;

      const previousGraph = activeGraph();
      const shouldAnimate =
        previousGraph.nodes.length > 0 && previousGraph.id !== nextGraph.id;

      commitGraph(nextGraph, shouldAnimate);
    })();
  });

  createEffect(() => {
    const hoveredNodeId = interaction.hoveredNodeId();
    if (!hoveredNodeId) return;

    const exists = activeGraph().nodes.some((node) => node.id === hoveredNodeId);
    if (!exists) {
      interaction.setHoveredNodeId(null);
    }
  });

  onCleanup(() => {
    clearTransitionTimer();
    transition.clear();
  });

  return (
    <GraphViewport
      graph={activeGraph()}
      fitKey={`${activeGraph().id}:${fitVersion()}`}
      onZoomChange={setZoomLevel}
    >
      <EdgeLayer
        graph={activeGraph()}
        zoom={zoomLevel()}
        interaction={interaction}
        transition={transition}
        onEdgeTap={props.onEdgeTap}
      />
      <NodeLayer
        graph={activeGraph()}
        zoom={zoomLevel()}
        interaction={interaction}
        transition={transition}
        onNodeTap={props.onNodeTap}
      />
    </GraphViewport>
  );
}
