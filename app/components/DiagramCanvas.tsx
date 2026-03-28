import cytoscape from "cytoscape";
import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
import { createEffect, onCleanup, onMount } from "solid-js";
import { startEdgeAnimation, stopEdgeAnimation } from "../lib/edge-animation";
import {
  animateCytoscapeExpandOut,
  animateCytoscapeContractIn,
  animateCytoscapeRevealIn,
} from "../lib/diagram-transition";
import { computeMermaidLayout, applyMermaidPositions } from "../lib/diagram";

type DiagramCanvasProps = {
  elements: ElementDefinition[];
  style: Stylesheet[];
  layout?: LayoutOptions;
  mermaidText?: string;
  onReady?: (cy: Core, container: HTMLDivElement) => void;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
  onEdgeTap?: (edgeId: string, kind: string, label: string, source: string, target: string) => void;
};

const presetLayout: LayoutOptions = {
  name: "preset",
  fit: true,
  padding: 48,
};

const autoLayout: LayoutOptions = {
  name: "breadthfirst",
  directed: true,
  fit: true,
  padding: 48,
  spacingFactor: 1.5,
} as LayoutOptions;

function chooseLayout(elements: any[], explicit?: LayoutOptions): LayoutOptions {
  if (explicit) return explicit;
  const nodes = elements.filter((e: any) => !e.data?.source);
  if (nodes.length === 0) return autoLayout;
  const positioned = nodes.filter(
    (e: any) => e.position && (e.position.x !== undefined || e.position.y !== undefined)
  );
  // Use preset only if >70% of nodes got positions, otherwise auto
  return positioned.length / nodes.length > 0.7 ? presetLayout : autoLayout;
}

function bindHighlightBehavior(cy: Core, container: HTMLDivElement) {
  const handleNodeMouseOver = (evt: cytoscape.EventObject) => {
    const node = evt.target;
    if (typeof node.isParent === "function" && node.isParent()) return;

    // Only dim leaf nodes and edges — not parent/compound nodes (they're background)
    cy.nodes().filter((n) => !n.isParent()).addClass("dimmed");
    cy.edges().addClass("dimmed");
    node.removeClass("dimmed").addClass("highlighted");

    const connectedEdges = node.connectedEdges();
    connectedEdges.removeClass("dimmed").addClass("highlighted");
    node.neighborhood("node").filter((n) => !n.isParent()).removeClass("dimmed").addClass("neighbor-highlighted");

    startEdgeAnimation(cy, connectedEdges);
  };

  const handleEdgeMouseOver = (evt: cytoscape.EventObject) => {
    const edge = evt.target;
    cy.nodes().filter((n) => !n.isParent()).addClass("dimmed");
    cy.edges().addClass("dimmed");
    edge.removeClass("dimmed").addClass("highlighted");
    edge.source().removeClass("dimmed").addClass("neighbor-highlighted");
    edge.target().removeClass("dimmed").addClass("neighbor-highlighted");

    startEdgeAnimation(cy, cy.collection().union(edge));
  };

  const clearHighlight = () => {
    stopEdgeAnimation(cy);

    cy.edges().forEach((edge) => {
      const orig = (edge as any)._origLineStyle;
      if (orig && orig !== "dashed") {
        edge.style("line-style", orig);
      }
      delete (edge as any)._origLineStyle;
    });

    cy.elements().removeClass("dimmed highlighted neighbor-highlighted hover-hidden");
  };

  const handleCoreMouseOut = () => clearHighlight();

  cy.on("mouseover", "node", handleNodeMouseOver);
  cy.on("mouseover", "edge", handleEdgeMouseOver);
  cy.on("mouseout", "node", clearHighlight);
  cy.on("mouseout", "edge", clearHighlight);
  cy.on("mouseout", handleCoreMouseOut);
  container.addEventListener("mouseleave", clearHighlight);

  return () => {
    cy.off("mouseover", "node", handleNodeMouseOver);
    cy.off("mouseover", "edge", handleEdgeMouseOver);
    cy.off("mouseout", "node", clearHighlight);
    cy.off("mouseout", "edge", clearHighlight);
    cy.off("mouseout", handleCoreMouseOut);
    container.removeEventListener("mouseleave", clearHighlight);
  };
}

// Track the last tapped node for expand-out animation origin
let _lastTappedNodeId: string | undefined;
// Track navigation direction
let _navDirection: "forward" | "back" | undefined;

export function setNavDirection(dir: "forward" | "back") {
  _navDirection = dir;
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  let container: HTMLDivElement | undefined;
  let graph: Core | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let cleanupHighlightBehavior: (() => void) | undefined;
  let animating = false;
  let transitionSeq = 0;
  let prevElementsRef: ElementDefinition[] | undefined;

  const swapElements = async () => {
    if (!graph) return;
    let elements = props.elements;

    // Apply mermaid layout if mermaid text is available
    const mermaidText = props.mermaidText;
    console.log("[swap] elements:", elements.length, "mermaid:", mermaidText?.length || 0);
    if (mermaidText) {
      const geometry = await computeMermaidLayout(mermaidText);
      if (geometry) {
        elements = applyMermaidPositions(elements, geometry);
        const withPos = elements.filter((e: any) => e.position?.x !== undefined).length;
        const withSeg = elements.filter((e: any) => e.data?._segmentWeights).length;
        console.log("[swap] after mermaid: positioned:", withPos, "segments:", withSeg);
      } else {
        console.log("[swap] mermaid returned null");
      }
    }

    graph.batch(() => {
      graph!.elements().remove();
      graph!.add(elements);
      graph!.style().fromJson(props.style).update();
    });
    graph.layout(chooseLayout(elements, props.layout)).run();
  };

  onMount(async () => {
    if (!container) return;

    let elements = props.elements;

    // Apply mermaid layout before initial render
    if (props.mermaidText) {
      const geometry = await computeMermaidLayout(props.mermaidText);
      if (geometry) {
        elements = applyMermaidPositions(elements, geometry);
      }
    }

    graph = cytoscape({
      container,
      elements,
      style: props.style,
      layout: chooseLayout(elements, props.layout),
      minZoom: 0.3,
      maxZoom: 4,
      wheelSensitivity: 1.2,
      autoungrabify: true,
      boxSelectionEnabled: false,
    });

    // Expose for E2E test access
    (window as any).__cy = graph;

    prevElementsRef = props.elements;

    cleanupHighlightBehavior = bindHighlightBehavior(graph, container);

    graph.on("tap", "node", (evt) => {
      const node = evt.target;
      if (typeof node.isParent === "function" && node.isParent()) return;
      _lastTappedNodeId = node.id();
      props.onNodeTap?.(node.id(), node.data("kind") || "", node.data("label") || "");
    });

    graph.on("tap", "edge", (evt) => {
      const edge = evt.target;
      props.onEdgeTap?.(edge.id(), edge.data("kind") || "", edge.data("label") || "", edge.data("source") || "", edge.data("target") || "");
    });

    resizeObserver = new ResizeObserver(() => {
      graph?.resize();
      if (!animating) graph?.fit(undefined, 48);
    });
    resizeObserver.observe(container);

    window.addEventListener("resize", handleResize);

    if (props.onReady && container) {
      props.onReady(graph, container);
    }
  });

  // React to element changes — this fires when routes change
  // because the same DiagramCanvas persists in AppShell
  createEffect(() => {
    const currentElements = props.elements;
    props.style;
    props.layout;

    if (!graph || currentElements === prevElementsRef) return;
    if (prevElementsRef === undefined) {
      prevElementsRef = currentElements;
      return;
    }

    prevElementsRef = currentElements;
    const seq = ++transitionSeq;
    animating = true;

    const direction = _navDirection || "forward";
    const originId = _lastTappedNodeId;
    _navDirection = undefined;
    _lastTappedNodeId = undefined;

    (async () => {
      try {
        // Step 1: Animate OUT the current diagram
        if (direction === "forward") {
          await animateCytoscapeExpandOut(graph!, originId);
        } else {
          await animateCytoscapeContractIn(graph!);
        }
        if (seq !== transitionSeq) return; // interrupted by newer transition

        // Step 2: Swap to new elements (with mermaid layout)
        await swapElements();
        if (seq !== transitionSeq) return;

        // Step 3: Animate IN the new diagram
        await animateCytoscapeRevealIn(graph!);
      } finally {
        if (seq === transitionSeq) animating = false;
      }
    })();
  });

  const handleResize = () => {
    graph?.resize();
    if (!animating) graph?.fit(undefined, 48);
  };

  onCleanup(() => {
    if (graph) {
      stopEdgeAnimation(graph);
    }
    cleanupHighlightBehavior?.();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", handleResize);
    graph?.destroy();
  });

  return (
    <div
      ref={(element) => {
        container = element;
      }}
      class="cy-container"
    />
  );
}
