import type { Core } from "cytoscape";

type ZoomTier = "dot" | "icon" | "label" | "full";

const HYSTERESIS = 4;
const THROTTLE_MS = 100;

const tierCache = new WeakMap<object, ZoomTier>();

function computeTier(renderedWidth: number, currentTier: ZoomTier | undefined): ZoomTier {
  const h = HYSTERESIS;

  if (currentTier === "dot") {
    if (renderedWidth > 24 + h) {
      return renderedWidth > 56 + h ? (renderedWidth > 120 + h ? "full" : "label") : "icon";
    }
    return "dot";
  }

  if (currentTier === "icon") {
    if (renderedWidth < 24 - h) return "dot";
    if (renderedWidth > 56 + h) return renderedWidth > 120 + h ? "full" : "label";
    return "icon";
  }

  if (currentTier === "label") {
    if (renderedWidth < 56 - h) return renderedWidth < 24 - h ? "dot" : "icon";
    if (renderedWidth > 120 + h) return "full";
    return "label";
  }

  if (renderedWidth < 120 - h) {
    if (renderedWidth < 56 - h) return renderedWidth < 24 - h ? "dot" : "icon";
    return "label";
  }

  return "full";
}

const ZOOM_CLASSES = ["zoom-dot", "zoom-icon", "zoom-label"] as const;
const TIER_CLASS: Record<ZoomTier, (typeof ZOOM_CLASSES)[number] | null> = {
  dot: "zoom-dot",
  icon: "zoom-icon",
  label: "zoom-label",
  full: null,
};

export function setupSemanticZoom(cy: Core, isAnimating: () => boolean): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastEdgeLabelHidden = false;

  const update = () => {
    if (isAnimating()) return;

    const zoom = cy.zoom();

    cy.batch(() => {
      const nodes = cy.nodes(":visible");
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.isParent()) continue;

        const renderedWidth = node.renderedBoundingBox().w;
        const currentTier = tierCache.get(node);
        const newTier = computeTier(renderedWidth, currentTier);

        if (newTier === currentTier) continue;
        tierCache.set(node, newTier);

        for (const cls of ZOOM_CLASSES) {
          if (node.hasClass(cls)) node.removeClass(cls);
        }

        const nextClass = TIER_CLASS[newTier];
        if (nextClass) node.addClass(nextClass);
      }

      const hideEdgeLabels = zoom < 0.5;
      if (hideEdgeLabels !== lastEdgeLabelHidden) {
        lastEdgeLabelHidden = hideEdgeLabels;
        const edges = cy.edges();
        if (hideEdgeLabels) {
          edges.addClass("zoom-hide-labels");
        } else {
          edges.removeClass("zoom-hide-labels");
        }
      }
    });
  };

  const throttledUpdate = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      update();
    }, THROTTLE_MS);
  };

  cy.on("render", throttledUpdate);
  requestAnimationFrame(() => update());

  return () => {
    cy.off("render", throttledUpdate);
    if (timer) clearTimeout(timer);
  };
}
