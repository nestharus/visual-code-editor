import cytoscape from "cytoscape";
import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
import { createEffect, onCleanup, onMount } from "solid-js";

type DiagramCanvasProps = {
  elements: ElementDefinition[];
  style: Stylesheet[];
  layout?: LayoutOptions;
};

const defaultLayout: LayoutOptions = {
  name: "preset",
  fit: true,
  padding: 48,
};

export function DiagramCanvas(props: DiagramCanvasProps) {
  let container: HTMLDivElement | undefined;
  let graph: Core | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const applyGraphState = () => {
    if (!graph) {
      return;
    }

    graph.batch(() => {
      graph?.elements().remove();
      graph?.add(props.elements);
      graph?.style().fromJson(props.style).update();
    });

    graph.layout(props.layout ?? defaultLayout).run();
  };

  onMount(() => {
    if (!container) {
      return;
    }

    graph = cytoscape({
      container,
      elements: props.elements,
      style: props.style,
      layout: props.layout ?? defaultLayout,
      wheelSensitivity: 0.18,
    });

    resizeObserver = new ResizeObserver(() => {
      graph?.resize();
      graph?.fit(undefined, 48);
    });
    resizeObserver.observe(container);

    window.addEventListener("resize", handleResize);
  });

  createEffect(() => {
    props.elements;
    props.style;
    props.layout;
    applyGraphState();
  });

  const handleResize = () => {
    graph?.resize();
    graph?.fit(undefined, 48);
  };

  onCleanup(() => {
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
