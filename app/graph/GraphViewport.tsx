import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { createEffect, createMemo, createSignal, onCleanup, onMount, type ParentComponent } from "solid-js";

import type { GraphDefinition, GraphNode } from "./layout/types";

type GraphViewportProps = {
  graph: GraphDefinition;
  fitKey: string;
  onZoomChange?: (zoomLevel: number) => void;
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

export const GraphViewport: ParentComponent<GraphViewportProps> = (props) => {
  const [transform, setTransform] = createSignal<ZoomTransform>(zoomIdentity);

  let viewportEl: HTMLDivElement | undefined;
  let zoomBehavior: ZoomBehavior<HTMLDivElement, unknown> | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const bounds = createMemo(() => getNodeBounds(props.graph.nodes));
  const sceneSize = createMemo(() => {
    const current = bounds();
    return {
      width: Math.max(current.maxX + 96, 320),
      height: Math.max(current.maxY + 96, 240),
    };
  });

  const fitBounds = () => {
    if (!viewportEl || !zoomBehavior || props.graph.nodes.length === 0) {
      return;
    }

    const width = viewportEl.clientWidth;
    const height = viewportEl.clientHeight;
    if (!width || !height) return;

    const padding = 48;
    const current = bounds();
    const graphWidth = Math.max(current.maxX - current.minX, 1);
    const graphHeight = Math.max(current.maxY - current.minY, 1);
    const scale = Math.max(
      0.1,
      Math.min(
        4,
        Math.min(
          (width - padding * 2) / graphWidth,
          (height - padding * 2) / graphHeight,
        ),
      ),
    );

    const translateX =
      width / 2 - (current.minX + graphWidth / 2) * scale;
    const translateY =
      height / 2 - (current.minY + graphHeight / 2) * scale;

    const nextTransform = zoomIdentity.translate(translateX, translateY).scale(scale);
    select(viewportEl).call(zoomBehavior.transform, nextTransform);
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
    <div class="graph-viewport" ref={viewportEl}>
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
