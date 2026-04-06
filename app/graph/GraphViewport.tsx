import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { createEffect, createMemo, createSignal, onCleanup, onMount, type ParentComponent } from "solid-js";

import type { GraphDefinition, GraphNode } from "./layout/types";

export type ViewportHandle = {
  zoomToNodes: (nodeIds: string[], animate?: boolean) => void;
  saveCameraState: () => ZoomTransform;
  restoreCameraState: (state: ZoomTransform, animate?: boolean) => void;
  lockCamera: () => void;
  unlockCamera: () => void;
  currentTransform: () => ZoomTransform;
  viewportSize: () => { width: number; height: number };
};

type GraphViewportProps = {
  graph: GraphDefinition;
  fitKey: string;
  onZoomChange?: (zoomLevel: number) => void;
  onViewportReady?: (handle: ViewportHandle) => void;
};

function getNodeBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 240 };
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

function computeTransformForBounds(
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  padding = 48,
): ZoomTransform {
  const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.max(
    0.1,
    Math.min(
      4,
      Math.min(
        (viewportWidth - padding * 2) / graphWidth,
        (viewportHeight - padding * 2) / graphHeight,
      ),
    ),
  );

  const translateX = viewportWidth / 2 - (bounds.minX + graphWidth / 2) * scale;
  const translateY = viewportHeight / 2 - (bounds.minY + graphHeight / 2) * scale;

  return zoomIdentity.translate(translateX, translateY).scale(scale);
}

export const GraphViewport: ParentComponent<GraphViewportProps> = (props) => {
  const [transform, setTransform] = createSignal<ZoomTransform>(zoomIdentity);
  const [locked, setLocked] = createSignal(false);

  let viewportEl: HTMLDivElement | undefined;
  let zoomBehavior: ZoomBehavior<HTMLDivElement, unknown> | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const nodeById = createMemo(() => new Map(props.graph.nodes.map((n) => [n.id, n])));
  const bounds = createMemo(() => getNodeBounds(props.graph.nodes));
  const sceneSize = createMemo(() => {
    const current = bounds();
    return {
      width: Math.max(current.maxX + 96, 320),
      height: Math.max(current.maxY + 96, 240),
    };
  });

  const applyTransform = (t: ZoomTransform, animate = false) => {
    if (!viewportEl || !zoomBehavior) return;
    const sel = select(viewportEl);
    if (animate) {
      sel.transition().duration(600).call(zoomBehavior.transform, t);
    } else {
      sel.call(zoomBehavior.transform, t);
    }
  };

  const fitBounds = () => {
    if (!viewportEl || !zoomBehavior || props.graph.nodes.length === 0) return;
    const width = viewportEl.clientWidth;
    const height = viewportEl.clientHeight;
    if (!width || !height) return;
    applyTransform(computeTransformForBounds(width, height, bounds()));
  };

  // --- Imperative camera handle ---

  const handle: ViewportHandle = {
    zoomToNodes(nodeIds, animate = true) {
      if (!viewportEl || !zoomBehavior) return;
      const nodes = nodeIds.map((id) => nodeById().get(id)).filter(Boolean) as GraphNode[];
      if (nodes.length === 0) return;

      const nodeBounds = getNodeBounds(nodes);
      const width = viewportEl.clientWidth;
      const height = viewportEl.clientHeight;
      if (!width || !height) return;

      applyTransform(computeTransformForBounds(width, height, nodeBounds, 80), animate);
    },

    saveCameraState() {
      return transform();
    },

    restoreCameraState(state, animate = true) {
      applyTransform(state, animate);
    },

    currentTransform() {
      return transform();
    },

    viewportSize() {
      return {
        width: viewportEl?.clientWidth ?? 800,
        height: viewportEl?.clientHeight ?? 600,
      };
    },

    lockCamera() {
      if (!viewportEl || !zoomBehavior) return;
      setLocked(true);
      const sel = select(viewportEl);
      sel.on(".zoom", null);
    },

    unlockCamera() {
      if (!viewportEl || !zoomBehavior) return;
      setLocked(false);
      const sel = select(viewportEl);
      sel.call(zoomBehavior);
      sel.on("dblclick.zoom", null);
    },
  };

  onMount(() => {
    if (!viewportEl) return;

    zoomBehavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        setTransform(event.transform);
        props.onZoomChange?.(event.transform.k);
      });

    const selection = select(viewportEl);
    selection.call(zoomBehavior);
    selection.on("dblclick.zoom", null);

    resizeObserver = new ResizeObserver(() => {
      fitBounds();
    });
    resizeObserver.observe(viewportEl);

    requestAnimationFrame(() => {
      fitBounds();
    });

    props.onViewportReady?.(handle);
  });

  createEffect(() => {
    props.fitKey;
    requestAnimationFrame(() => {
      fitBounds();
    });
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
  });

  return (
    <div classList={{ "graph-viewport": true, "is-camera-locked": locked() }} ref={viewportEl}>
      <div
        class="graph-scene"
        style={{
          width: `${sceneSize().width}px`,
          height: `${sceneSize().height}px`,
          transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().k})`,
        }}
      >
        {props.children}
      </div>
    </div>
  );
};
