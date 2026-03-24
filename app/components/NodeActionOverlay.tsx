import { Show, createSignal, onCleanup } from "solid-js";
import { useNavigate } from "@tanstack/solid-router";
import type { Core, NodeSingular } from "cytoscape";

type NodeActionOverlayProps = {
  cy: Core | undefined;
  container: HTMLDivElement | undefined;
};

export function NodeActionOverlay(props: NodeActionOverlayProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = createSignal(false);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [activeNode, setActiveNode] = createSignal<NodeSingular | null>(null);

  let hideTimeout: ReturnType<typeof setTimeout> | undefined;

  const showOverlay = (node: NodeSingular) => {
    if (hideTimeout) clearTimeout(hideTimeout);
    const cy = props.cy;
    const container = props.container;
    if (!cy || !container) return;

    const pos = node.renderedPosition();
    const bb = node.renderedBoundingBox();
    const containerRect = container.getBoundingClientRect();

    setPosition({
      x: pos.x,
      y: bb.y1 - 8,
    });
    setActiveNode(node);
    setVisible(true);
  };

  const hideOverlay = () => {
    hideTimeout = setTimeout(() => {
      setVisible(false);
      setActiveNode(null);
    }, 300);
  };

  const handleInfo = () => {
    const node = activeNode();
    if (!node) return;
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        panelKind: node.data("kind") || "node",
        panelId: node.id(),
        panelLabel: node.data("label"),
      }),
    });
  };

  const handleExpand = () => {
    const node = activeNode();
    if (!node) return;
    const kind = node.data("kind");
    const id = node.id();

    if (kind === "cluster") {
      navigate({ to: `/organizational/clusters/${id}` });
    } else if (kind === "lifecycle") {
      navigate({ to: `/behavioral/lifecycles/${id}` });
    }
  };

  // Bind to Cytoscape events when cy is available
  const bindEvents = () => {
    const cy = props.cy;
    if (!cy) return;

    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      if (typeof node.isParent === "function" && node.isParent()) return;
      showOverlay(node);
    });

    cy.on("mouseout", "node", () => {
      hideOverlay();
    });
  };

  // Re-bind when cy changes
  const checkCy = setInterval(() => {
    if (props.cy) {
      bindEvents();
      clearInterval(checkCy);
    }
  }, 200);

  onCleanup(() => {
    clearInterval(checkCy);
    if (hideTimeout) clearTimeout(hideTimeout);
  });

  return (
    <Show when={visible()}>
      <div
        class="cy-node-actions"
        style={{
          position: "absolute",
          left: `${position().x}px`,
          top: `${position().y}px`,
          transform: "translate(-50%, -100%)",
          "z-index": "1000",
        }}
        onMouseEnter={() => {
          if (hideTimeout) clearTimeout(hideTimeout);
        }}
        onMouseLeave={hideOverlay}
      >
        <button
          class="cy-node-action cy-node-info"
          title="View details"
          onClick={handleInfo}
        >
          i
        </button>
        <button
          class="cy-node-action cy-node-expand"
          title="Expand"
          onClick={handleExpand}
        >
          ⛶
        </button>
      </div>
    </Show>
  );
}
