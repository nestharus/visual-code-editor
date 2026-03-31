/**
 * Edge direction animation — animates dashed edges by cycling line-dash-offset.
 * Port of the old app.js startEdgeDirectionAnimation/stopEdgeDirectionAnimation.
 */

import type { Core, EdgeCollection } from "cytoscape";

type EdgeAnimation = {
  cancel: () => void;
};

const ANIMATION_KEY = "_edgeDirectionAnimation";

export function startEdgeAnimation(cy: Core, edges: EdgeCollection) {
  if (!edges || edges.length === 0) return;

  stopEdgeAnimation(cy);

  const animatable = edges.filter((edge) => edge.visible());
  if (animatable.length === 0) return;

  // Save original line-style and apply dashed if needed
  animatable.forEach((edge) => {
    const orig = edge.style("line-style") || "solid";
    (edge as any)._origLineStyle = orig;
    if (orig !== "dashed") {
      edge.style({
        "line-style": "dashed",
        "line-dash-pattern": [8, 4] as any,
        "line-dash-offset": 0,
      });
    } else {
      edge.style("line-dash-offset", 0);
    }
  });

  let offset = 0;
  let cancelled = false;
  let frameId: number | undefined;

  function tick() {
    if (cancelled) return;
    offset = (offset + 1) % 40;
    animatable.forEach((edge) => {
      if (edge.visible()) {
        edge.style("line-dash-offset", -offset);
      }
    });
    frameId = requestAnimationFrame(tick);
  }

  const animation: EdgeAnimation = {
    cancel() {
      cancelled = true;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    },
  };

  (cy as any)[ANIMATION_KEY] = animation;
  tick();
}

export function stopEdgeAnimation(cy: Core) {
  const animation = (cy as any)[ANIMATION_KEY] as EdgeAnimation | undefined;
  if (animation) {
    animation.cancel();
    delete (cy as any)[ANIMATION_KEY];
  }
}
