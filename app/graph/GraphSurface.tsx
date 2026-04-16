import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { DiagramElementDefinition } from "../lib/diagram-elements";
import { DeepCardOverlay } from "./DeepCardOverlay";
import {
  BaseEdgeLayer,
  EdgeHitLayer,
  HighlightedEdgeLayer,
  TransportLayer,
} from "./EdgeLayer";
import { GraphViewport, type ViewportHandle } from "./GraphViewport";
import { ShadowboxModal } from "./ShadowboxModal";
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
  onNodeInfo?: (nodeId: string, kind: string, label: string) => void;
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
  const modalTransport = createTransportStore(() => EMPTY_GRAPH, "modal");

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
    modalTransport,
  );

  let transitionTimer: number | undefined;
  let enterAnimationFrame: number | undefined;
  let loadSequence = 0;

  const clearTransitionTimer = () => {
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = undefined;
    }
    if (enterAnimationFrame) {
      window.cancelAnimationFrame(enterAnimationFrame);
      enterAnimationFrame = undefined;
    }
  };

  const replaceDisplayedGraph = (nextGraph: GraphDefinition) => {
    setDisplayedGraph(nextGraph);
    presentation.replaceGraph(nextGraph.nodes);
    setFitVersion((version) => version + 1);
  };

  const commitGraph = (nextGraph: GraphDefinition, animate: boolean) => {
    clearTransitionTimer();
    killActiveTransition();
    transition.clear();
    interaction.setHoveredNodeId(null);
    interaction.setHoveredEdgeId(null);
    const currentGraph = activeGraph();
    const previousNodeCount = currentGraph.nodes.length;

    if (transition.prefersReducedMotion()) {
      replaceDisplayedGraph(nextGraph);
      transition.clear();
      return;
    }

    // No previous nodes = initial load — skip exit, just do entry animation
    if (!animate || previousNodeCount === 0) {
      const nextNodeIds = nextGraph.nodes.map((node) => node.id);
      replaceDisplayedGraph(nextGraph);
      presentation.seedEnteringNodes(nextNodeIds);
      transition.startEnter(nextGraph.nodes);
      enterAnimationFrame = window.requestAnimationFrame(() => {
        enterAnimationFrame = undefined;
        presentation.animateToDefault(nextNodeIds);
      });
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

        // Graph swap happens mid-tunnel, with entry animation for new nodes
        setTimeout(() => {
          if (sequence !== loadSequence) return;
          const nextNodeIds = nextGraph.nodes.map((n) => n.id);
          replaceDisplayedGraph(nextGraph);
          presentation.seedEnteringNodes(nextNodeIds);
          transition.startEnter(nextGraph.nodes);
          requestAnimationFrame(() => {
            presentation.animateToDefault(nextNodeIds);
          });
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
        // Swap graph first with entry animation, then compute destination rect
        const nextNodeIds = nextGraph.nodes.map((n) => n.id);
        replaceDisplayedGraph(nextGraph);
        presentation.seedEnteringNodes(nextNodeIds);
        transition.startEnter(nextGraph.nodes);
        requestAnimationFrame(() => {
          presentation.animateToDefault(nextNodeIds);
        });
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

        replaceDisplayedGraph(nextGraph);

        if (ctx.direction === "drill") {
          await runDrillEnter(presentation, nextGraph.nodes, ctx.anchorRect);
        } else {
          await runCollapseEnter(presentation, nextGraph.nodes, ctx.anchorNodeId);
        }
      })();
      return;
    }

    // CSS fallback
    const currentNodeIds = currentGraph.nodes.map((node) => node.id);
    if (currentNodeIds.length > 0) {
      for (const nodeId of currentNodeIds) {
        presentation.patch(nodeId, { opacity: 0, innerScale: 0.82, ty: 16 });
      }
      transition.startExit(currentGraph.nodes);
    } else {
      transition.clear();
    }

    transitionTimer = window.setTimeout(() => {
      const nextNodeIds = nextGraph.nodes.map((node) => node.id);
      replaceDisplayedGraph(nextGraph);
      presentation.seedEnteringNodes(nextNodeIds);
      transition.startEnter(nextGraph.nodes);
      enterAnimationFrame = window.requestAnimationFrame(() => {
        enterAnimationFrame = undefined;
        presentation.animateToDefault(nextNodeIds);
      });
    }, currentNodeIds.length > 0 ? transition.exitTotalMs() : 0);
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

  // Graph-mode playback effects (suppressed when modal owns playback)
  createEffect(() => {
    const target = playback.playbackTarget();
    if (target !== "graph") {
      // If we had saved camera state from a previous graph-mode session, restore it
      if (savedCameraState && viewportHandle) {
        interaction.clearFlowFocus();
        viewportHandle.restoreCameraState(savedCameraState);
        viewportHandle.unlockCamera();
        savedCameraState = undefined;
      }
      return;
    }

    const status = playback.status();
    if (status === "playing" && viewportHandle) {
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
      interaction.clearFlowFocus();
      viewportHandle.restoreCameraState(savedCameraState);
      viewportHandle.unlockCamera();
      savedCameraState = undefined;
    }
  });

  const playableNodeIds = createMemo(() => {
    const data = props.scenarioData;
    if (!data?.bindings) return new Set<string>();
    return new Set(Object.keys(data.bindings));
  });

  const closeShadowbox = () => {
    playback.stop();
  };

  const onDeepCardComplete = () => {
    setDeepCardActive(false);
    setDeepCardRect(null);
    setEdgesHidden(false);
  };

  // Listen for play-scenario events from DetailPanel
  const handlePlayScenario = (e: Event) => {
    const behaviorId = (e as CustomEvent).detail?.behaviorId;
    if (behaviorId) playback.start(behaviorId);
  };
  window.addEventListener("play-scenario", handlePlayScenario);

  onCleanup(() => {
    clearTransitionTimer();
    transition.clear();
    window.removeEventListener("play-scenario", handlePlayScenario);
  });

  return (
    <div class="graph-surface-root" style={{ position: "relative", width: "100%", height: "100%" }}>
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
          zoom={zoomLevel()}
        />
        <HighlightedEdgeLayer
          graph={activeGraph()}
          zoom={zoomLevel()}
          interaction={interaction}
          presentation={presentation}
          transport={transport}
          onEdgeTap={props.onEdgeTap}
        />
        <NodeLayer
          graph={activeGraph()}
          zoom={zoomLevel()}
          interaction={interaction}
          transition={transition}
          presentation={presentation}
          onNodeTap={props.onNodeTap}
          onNodeInfo={props.onNodeInfo}
          playableNodeIds={playableNodeIds()}
        />
        <EdgeHitLayer
          graph={activeGraph()}
          zoom={zoomLevel()}
          interaction={interaction}
          presentation={presentation}
          transport={transport}
          onEdgeTap={props.onEdgeTap}
        />
        <TransportLayer
          graph={activeGraph()}
          zoom={zoomLevel()}
          interaction={interaction}
          presentation={presentation}
          transport={transport}
          onEdgeTap={props.onEdgeTap}
        />
      </GraphViewport>
      {/* These render OUTSIDE the zoom-transformed scene, in viewport space */}
      <DeepCardOverlay
        active={deepCardActive()}
        direction={deepCardDirection()}
        sourceRect={deepCardRect()}
        destinationRect={deepCardDestRect()}
        viewportWidth={viewportHandle?.viewportSize().width ?? 800}
        viewportHeight={viewportHandle?.viewportSize().height ?? 600}
        onComplete={onDeepCardComplete}
      />
      <ShadowboxModal
        playback={playback}
        transport={modalTransport}
        onClose={closeShadowbox}
      />
      {/* Edge type legend */}
      <div class="graph-legend">
        <details>
          <summary>Legend</summary>
          <div class="graph-legend-items">
            <div class="graph-legend-item">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#8b949e" stroke-width="2" /></svg>
              <span>Default</span>
            </div>
            <div class="graph-legend-item">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#d29922" stroke-width="2" stroke-dasharray="4 2" /></svg>
              <span>Store</span>
            </div>
            <div class="graph-legend-item">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#4fa9a0" stroke-width="2" /></svg>
              <span>Behavioral</span>
            </div>
            <div class="graph-legend-item">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#d29922" stroke-width="2" stroke-dasharray="6 4" /></svg>
              <span>Back-edge</span>
            </div>
            <div class="graph-legend-item">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#9D7BEE" stroke-width="2" stroke-dasharray="2 2" /></svg>
              <span>Agent</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
