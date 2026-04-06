import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { DiagramElementDefinition } from "../lib/diagram-elements";
import { DeepCardOverlay } from "./DeepCardOverlay";
import { BaseEdgeLayer, OverlayLayer } from "./EdgeLayer";
import { GraphViewport, type ViewportHandle } from "./GraphViewport";
import { ShadowboxChrome } from "./ShadowboxChrome";
import { createBehaviorPlaybackController, type CombinedData } from "./BehaviorPlayback";
import {
  consumeTransitionContext,
  killActiveTransition,
  runDrillExit,
  runDrillEnter,
  runCollapseExit,
  runCollapseEnter,
} from "./DrillTransition";
import { createInteractionService } from "./InteractionService";
import { NodeLayer } from "./NodeLayer";
import { createPresentationStateService } from "./PresentationStateService";
import { createTransportStore } from "./TransportStore";
import { createTransitionService } from "./TransitionService";
import { elementsToGraph, resolveGraphDirection } from "./layout/adapter";
import { computeElkLayout } from "./layout/elk-layout";
import type { GraphDefinition, GraphNode } from "./layout/types";
import "./styles/graph-surface.css";

type GraphSurfaceProps = {
  graphId: string;
  graph?: GraphDefinition;
  elements?: DiagramElementDefinition[];
  scenarioData?: CombinedData;
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
  const presentation = createPresentationStateService(activeGraph);
  const transport = createTransportStore(activeGraph);

  let viewportHandle: ViewportHandle | undefined;
  let savedCameraState: import("d3-zoom").ZoomTransform | undefined;

  const [deepCardActive, setDeepCardActive] = createSignal(false);
  const [deepCardRect, setDeepCardRect] = createSignal<DOMRect | null>(null);
  const [deepCardDestRect, setDeepCardDestRect] = createSignal<{ left: number; top: number; width: number; height: number } | null>(null);
  const [deepCardDirection, setDeepCardDirection] = createSignal<"forward" | "reverse">("forward");
  const [edgesHidden, setEdgesHidden] = createSignal(false);

  const playback = createBehaviorPlaybackController(
    () => props.scenarioData,
    transport,
  );

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
    killActiveTransition();
    interaction.setHoveredNodeId(null);
    interaction.setHoveredEdgeId(null);
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

    // Try deep card 3D tunnel for eligible drill-down
    const ctx = consumeTransitionContext();
    if (ctx) {
      const useDeepCard =
        ctx.direction === "drill" &&
        ctx.anchorViewportRect &&
        ctx.nodeShape !== "hexagon" &&
        ctx.nodeShape !== "octagon" &&
        typeof CSS !== "undefined" &&
        CSS.supports?.("transform-style", "preserve-3d");

      if (useDeepCard && ctx.anchorViewportRect) {
        const sequence = loadSequence;
        setDeepCardRect(ctx.anchorViewportRect);
        setDeepCardDirection("forward");
        setEdgesHidden(true);
        setDeepCardActive(true);

        // Graph swap happens mid-tunnel
        setTimeout(() => {
          if (sequence !== loadSequence) return;
          setDisplayedGraph(nextGraph);
          setFitVersion((v) => v + 1);
        }, 500);

        return;
      }

      // Try reverse deep card for eligible back navigation
      const useReverseDeepCard =
        ctx.direction === "back" &&
        ctx.nodeShape !== "hexagon" &&
        ctx.nodeShape !== "octagon" &&
        typeof CSS !== "undefined" &&
        CSS.supports?.("transform-style", "preserve-3d") &&
        viewportHandle;

      if (useReverseDeepCard) {
        // Swap graph first, then compute destination rect from data
        setDisplayedGraph(nextGraph);
        setFitVersion((v) => v + 1);
        setEdgesHidden(true);

        // Compute destination rect from graph data + viewport transform
        const t = viewportHandle!.currentTransform();
        const destNode = nextGraph.nodes.find((n) => n.id === ctx.anchorNodeId);
        let destRect: { left: number; top: number; width: number; height: number } | null = null;
        if (destNode?.position && destNode?.size) {
          const w = destNode.size.width * t.k;
          const h = destNode.size.height * t.k;
          destRect = {
            left: (destNode.position.x - destNode.size.width / 2) * t.k + t.x,
            top: (destNode.position.y - destNode.size.height / 2) * t.k + t.y,
            width: w,
            height: h,
          };
        }

        // Use entry rect as source, computed rect as destination
        setDeepCardRect(ctx.anchorViewportRect ?? null);
        setDeepCardDestRect(destRect);
        setDeepCardDirection("reverse");
        setDeepCardActive(true);

        return;
      }

      const currentGraph = activeGraph();
      const sequence = loadSequence;

      void (async () => {
        if (ctx.direction === "drill") {
          await runDrillExit(presentation, currentGraph.nodes, ctx.anchorRect);
        } else {
          await runCollapseExit(presentation, currentGraph.nodes, {
            x: ctx.anchorRect.centerX,
            y: ctx.anchorRect.centerY,
          });
        }

        if (sequence !== loadSequence) return;

        setDisplayedGraph(nextGraph);
        setFitVersion((version) => version + 1);

        if (ctx.direction === "drill") {
          await runDrillEnter(presentation, nextGraph.nodes, ctx.anchorRect);
        } else {
          await runCollapseEnter(presentation, nextGraph.nodes, ctx.anchorNodeId);
        }
      })();
      return;
    }

    // CSS fallback
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
    if (hoveredNodeId) {
      const exists = activeGraph().nodes.some((node) => node.id === hoveredNodeId);
      if (!exists) interaction.setHoveredNodeId(null);
    }

    const hoveredEdgeId = interaction.hoveredEdgeId();
    if (hoveredEdgeId) {
      const exists = activeGraph().edges.some((edge) => edge.id === hoveredEdgeId);
      if (!exists) interaction.setHoveredEdgeId(null);
    }
  });

  // Shadowbox: react to playback status changes
  createEffect(() => {
    const status = playback.status();
    if (status === "playing" && viewportHandle) {
      // Entry: save camera, lock, zoom to participants
      if (!savedCameraState) {
        savedCameraState = viewportHandle.saveCameraState();
        viewportHandle.lockCamera();
      }
      const beat = playback.currentBeat();
      if (beat && beat.kind === "path") {
        interaction.setFlowFocus(
          new Set(beat.participantNodeIds),
          new Set(beat.edgeIds),
        );
        viewportHandle.zoomToNodes(beat.participantNodeIds);
      }
    } else if (status === "idle" && viewportHandle && savedCameraState) {
      // Exit: restore camera, unlock, clear focus
      interaction.clearFlowFocus();
      viewportHandle.restoreCameraState(savedCameraState);
      viewportHandle.unlockCamera();
      savedCameraState = undefined;
    }
  });

  // Beat-to-beat: update camera + highlighting when beat changes
  createEffect(() => {
    const beat = playback.currentBeat();
    const status = playback.status();
    if (!beat || status === "idle" || !viewportHandle) return;
    if (beat.kind === "path") {
      interaction.setFlowFocus(
        new Set(beat.participantNodeIds),
        new Set(beat.edgeIds),
      );
      viewportHandle.zoomToNodes(beat.participantNodeIds);
    }
  });

  const closeShadowbox = () => {
    playback.stop();
  };

  const onDeepCardComplete = () => {
    setDeepCardActive(false);
    setDeepCardRect(null);
    setEdgesHidden(false);
  };

  onCleanup(() => {
    clearTransitionTimer();
    transition.clear();
  });

  return (
    <GraphViewport
      graph={activeGraph()}
      fitKey={`${activeGraph().id}:${fitVersion()}`}
      onZoomChange={setZoomLevel}
      onViewportReady={(h) => { viewportHandle = h; }}
    >
      <BaseEdgeLayer
        graph={activeGraph()}
        interaction={interaction}
        transition={transition}
        presentation={presentation}
      />
      <NodeLayer
        graph={activeGraph()}
        zoom={zoomLevel()}
        interaction={interaction}
        transition={transition}
        presentation={presentation}
        onNodeTap={props.onNodeTap}
      />
      <OverlayLayer
        graph={activeGraph()}
        zoom={zoomLevel()}
        interaction={interaction}
        presentation={presentation}
        transport={transport}
        onEdgeTap={props.onEdgeTap}
      />
      <DeepCardOverlay
        active={deepCardActive()}
        direction={deepCardDirection()}
        sourceRect={deepCardRect()}
        destinationRect={deepCardDestRect()}
        viewportWidth={viewportHandle?.viewportSize().width ?? 800}
        viewportHeight={viewportHandle?.viewportSize().height ?? 600}
        onComplete={onDeepCardComplete}
      />
      <ShadowboxChrome
        playback={playback}
        transport={transport}
        onClose={closeShadowbox}
      />
    </GraphViewport>
  );
}
