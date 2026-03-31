/**
 * Diagram transition animations — expand-out, contract-in, reveal-in.
 * Ported from the old app.js animation system.
 */

import type { Core, NodeSingular, EdgeCollection, ElementDefinition, Stylesheet } from "cytoscape";

function prefersReducedMotion(): boolean {
  return !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function playAnimation(animation: any): Promise<void> {
  if (!animation || typeof animation.play !== "function" || typeof animation.promise !== "function") {
    return Promise.resolve();
  }
  animation.play();
  return animation.promise("completed").catch(() => null);
}

function animateCollectionOpacity(collection: EdgeCollection, opacity: number, duration: number): Promise<void>[] {
  const promises: Promise<void>[] = [];
  collection.forEach((element) => {
    if (typeof element.animation === "function") {
      promises.push(playAnimation(element.animation(
        { style: { opacity } },
        { duration, easing: "ease-in-out" }
      )));
    }
  });
  return promises;
}

export function snapshotNodePositions(cy: Core): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = {
      x: node.position("x"),
      y: node.position("y"),
    };
  });
  return positions;
}

function finalizeCytoscapeReveal(cy: Core, targetPositions: Record<string, { x: number; y: number }>) {
  cy.nodes().forEach((node) => {
    const target = targetPositions[node.id()];
    if (target) node.position(target);
    node.style({ opacity: 1 });
  });
  cy.edges().forEach((edge) => {
    edge.style({ opacity: 1 });
  });
}

/**
 * Expand out: push all elements outward from origin node, fading to 0.
 * Used when drilling DOWN into a sub-diagram.
 */
export function animateCytoscapeExpandOut(cy: Core, originNodeId?: string): Promise<void> {
  return new Promise((resolve) => {
    if (prefersReducedMotion() || cy.nodes().length === 0) {
      resolve();
      return;
    }

    const extent = cy.extent();
    const cx = (extent.x1 + extent.x2) / 2;
    const cy2 = (extent.y1 + extent.y2) / 2;

    const origin = originNodeId ? cy.getElementById(originNodeId) : null;
    const hasOrigin = !!(origin && origin.length && typeof origin.position === "function");
    const ox = hasOrigin ? (origin as NodeSingular).position("x") : cx;
    const oy = hasOrigin ? (origin as NodeSingular).position("y") : cy2;

    const animations: Promise<void>[] = [];

    cy.nodes().forEach((node) => {
      const pos = node.position();
      const dx = pos.x - ox;
      const dy = pos.y - oy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const scale = 3 + dist * 0.01;
      animations.push(playAnimation(node.animation({
        position: { x: ox + dx * scale, y: oy + dy * scale },
        style: { opacity: 0 },
      }, { duration: 400, easing: "ease-in-out" })));
    });

    Promise.all([
      ...animations,
      ...animateCollectionOpacity(cy.edges(), 0, 300),
    ]).then(() => resolve());
  });
}

/**
 * Contract in: suck all elements into center, fading to 0.
 * Used when going BACK UP from a sub-diagram.
 */
export function animateCytoscapeContractIn(cy: Core): Promise<void> {
  return new Promise((resolve) => {
    if (prefersReducedMotion() || cy.nodes().length === 0) {
      resolve();
      return;
    }

    const extent = cy.extent();
    const cx = (extent.x1 + extent.x2) / 2;
    const cy2 = (extent.y1 + extent.y2) / 2;

    const animations: Promise<void>[] = [];

    cy.nodes().forEach((node) => {
      animations.push(playAnimation(node.animation({
        position: { x: cx, y: cy2 },
        style: { opacity: 0 },
      }, { duration: 400, easing: "ease-in-out" })));
    });

    Promise.all([
      ...animations,
      ...animateCollectionOpacity(cy.edges(), 0, 300),
    ]).then(() => resolve());
  });
}

/**
 * Reveal in: start all elements at center with opacity 0,
 * then animate to their target positions with opacity 1.
 * Used after expand-out or contract-in to show the new diagram.
 */
export function animateCytoscapeRevealIn(cy: Core): Promise<void> {
  return new Promise((resolve) => {
    const targetPositions = snapshotNodePositions(cy);

    if (prefersReducedMotion() || cy.nodes().length === 0) {
      finalizeCytoscapeReveal(cy, targetPositions);
      resolve();
      return;
    }

    // Save viewport state BEFORE moving nodes — so we can restore it
    // after collapsing everything to center (prevents auto-fit zoom-in)
    const savedZoom = cy.zoom();
    const savedPan = { ...cy.pan() };

    const extent = cy.extent();
    const cx = (extent.x1 + extent.x2) / 2;
    const cy2 = (extent.y1 + extent.y2) / 2;

    // Move all nodes to center, invisible
    cy.nodes().forEach((node) => {
      node.position({ x: cx, y: cy2 });
      node.style({ opacity: 0 });
    });
    cy.edges().forEach((edge) => {
      edge.style({ opacity: 0 });
    });

    // Restore viewport so it doesn't zoom into the collapsed center point
    cy.zoom(savedZoom);
    cy.pan(savedPan);

    // Animate nodes to target positions
    const animations: Promise<void>[] = [];
    cy.nodes().forEach((node) => {
      const target = targetPositions[node.id()];
      if (!target) return;
      animations.push(playAnimation(node.animation({
        position: target,
        style: { opacity: 1 },
      }, { duration: 500, easing: "ease-out" })));
    });

    // Edges fade in with a slight delay
    const edgePromise = new Promise<void>((edgeResolve) => {
      setTimeout(() => {
        Promise.all(animateCollectionOpacity(cy.edges(), 1, 300)).then(() => edgeResolve());
      }, 200);
    });

    Promise.all(animations).then(() => {
      edgePromise.then(() => {
        finalizeCytoscapeReveal(cy, targetPositions);
        resolve();
      });
    });
  });
}

/**
 * Contract reveal in: start all elements far from center with opacity 0,
 * then animate inward to their target positions.
 * Used when going BACK UP — the reverse of expand-reveal.
 */
export function animateCytoscapeContractRevealIn(cy: Core): Promise<void> {
  return new Promise((resolve) => {
    const targetPositions = snapshotNodePositions(cy);

    if (prefersReducedMotion() || cy.nodes().length === 0) {
      finalizeCytoscapeReveal(cy, targetPositions);
      resolve();
      return;
    }

    const savedZoom = cy.zoom();
    const savedPan = { ...cy.pan() };

    const extent = cy.extent();
    const cx = (extent.x1 + extent.x2) / 2;
    const cy2 = (extent.y1 + extent.y2) / 2;

    // Move all nodes far from center, invisible
    cy.nodes().forEach((node) => {
      const target = targetPositions[node.id()];
      if (!target) return;
      const dx = target.x - cx;
      const dy = target.y - cy2;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const scale = 3 + dist * 0.01;
      node.position({ x: cx + dx * scale, y: cy2 + dy * scale });
      node.style({ opacity: 0 });
    });
    cy.edges().forEach((edge) => {
      edge.style({ opacity: 0 });
    });

    cy.zoom(savedZoom);
    cy.pan(savedPan);

    // Animate inward to target positions
    const animations: Promise<void>[] = [];
    cy.nodes().forEach((node) => {
      const target = targetPositions[node.id()];
      if (!target) return;
      animations.push(playAnimation(node.animation({
        position: target,
        style: { opacity: 1 },
      }, { duration: 500, easing: "ease-out" })));
    });

    const edgePromise = new Promise<void>((edgeResolve) => {
      setTimeout(() => {
        Promise.all(animateCollectionOpacity(cy.edges(), 1, 300)).then(() => edgeResolve());
      }, 200);
    });

    Promise.all(animations).then(() => {
      edgePromise.then(() => {
        finalizeCytoscapeReveal(cy, targetPositions);
        resolve();
      });
    });
  });
}

/**
 * Crossfade: old and new elements animate simultaneously.
 * Old elements fly out + fade while new elements fly in + fade.
 * Creates one continuous motion instead of two sequential animations.
 *
 * New element target positions are rescaled to fit the current viewport
 * so the fly-in animation is always visible (mermaid SVG coordinates
 * may be in an entirely different range).
 */
export function animateCytoscapeCrossfade(
  cy: Core,
  newElements: ElementDefinition[],
  direction: "forward" | "back",
  style: Stylesheet[],
  originNodeId?: string,
): Promise<void> {
  return new Promise((resolve) => {
    void (async () => {
      // Fast path
      if (prefersReducedMotion() || cy.nodes().length === 0) {
        cy.batch(() => {
          cy.elements().remove();
          cy.add(newElements);
          cy.style().fromJson(style).update();
        });
        resolve();
        return;
      }

      // Determine animation origin
      const extent = cy.extent();
      const centerX = (extent.x1 + extent.x2) / 2;
      const centerY = (extent.y1 + extent.y2) / 2;

      let originX = centerX;
      let originY = centerY;
      if (direction === "forward" && originNodeId) {
        const originNode = cy.getElementById(originNodeId);
        if (originNode.length && typeof originNode.position === "function") {
          originX = (originNode as NodeSingular).position("x");
          originY = (originNode as NodeSingular).position("y");
        }
      }

      if (direction === "forward" && originNodeId) {
        const originNode = cy.getElementById(originNodeId);
        if (originNode.length && !originNode.removed()) {
          await playAnimation(originNode.animation(
            { style: { "border-width": (originNode.numericStyle("border-width") || 2) + 1 } },
            { duration: 120, easing: "ease-out" }
          ));
        }
      }

      // Track old element IDs
      const oldIds = new Set<string>();
      cy.elements().forEach((e) => oldIds.add(e.id()));

      // Save viewport
      const savedZoom = cy.zoom();
      const savedPan = { ...cy.pan() };

      // --- Pass 1: classify elements and collect raw target positions ---
      const newNodeRawTargets = new Map<string, { x: number; y: number }>();
      const nodeElements: ElementDefinition[] = [];
      const edgesToAdd: ElementDefinition[] = [];

      for (const el of newElements) {
        if (el.data && "source" in el.data) {
          edgesToAdd.push(el);
          continue;
        }
        const rawPos = el.position || { x: centerX, y: centerY };
        if (el.data?.id) {
          newNodeRawTargets.set(el.data.id as string, { x: rawPos.x, y: rawPos.y });
        }
        nodeElements.push(el);
      }

      // --- Pass 2: rescale targets to fit within the current viewport ---
      const newNodeTargets = new Map<string, { x: number; y: number }>();
      if (newNodeRawTargets.size > 0) {
        const allTargets = Array.from(newNodeRawTargets.values());
        const tMinX = Math.min(...allTargets.map((t) => t.x));
        const tMaxX = Math.max(...allTargets.map((t) => t.x));
        const tMinY = Math.min(...allTargets.map((t) => t.y));
        const tMaxY = Math.max(...allTargets.map((t) => t.y));
        const tW = tMaxX - tMinX || 1;
        const tH = tMaxY - tMinY || 1;
        const tCx = (tMinX + tMaxX) / 2;
        const tCy = (tMinY + tMaxY) / 2;

        const vW = extent.x2 - extent.x1;
        const vH = extent.y2 - extent.y1;
        const pad = 80; // model-space padding
        const scale = Math.min((vW - pad * 2) / tW, (vH - pad * 2) / tH);

        for (const [id, raw] of newNodeRawTargets) {
          newNodeTargets.set(id, {
            x: centerX + (raw.x - tCx) * scale,
            y: centerY + (raw.y - tCy) * scale,
          });
        }
      }

      // --- Pass 3: compute start positions and build nodesToAdd ---
      const nodesToAdd: ElementDefinition[] = [];
      for (const el of nodeElements) {
        let startPos: { x: number; y: number };
        if (direction === "forward") {
          startPos = { x: originX, y: originY };
        } else {
          const target = (el.data?.id && newNodeTargets.get(el.data.id as string))
            || { x: centerX, y: centerY };
          const dx = target.x - centerX;
          const dy = target.y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const scl = 3 + dist * 0.01;
          startPos = { x: centerX + dx * scl, y: centerY + dy * scl };
        }
        nodesToAdd.push({ ...el, position: startPos });
      }

      // --- Handle ID collisions: remove old elements that share IDs ---
      const newIdSet = new Set(newElements.map((e) => e.data?.id).filter(Boolean) as string[]);
      const collisions = [...oldIds].filter((id) => newIdSet.has(id));
      if (collisions.length > 0) {
        cy.batch(() => {
          for (const id of collisions) {
            cy.getElementById(id).remove();
            oldIds.delete(id);
          }
        });
      }

      // Add new elements to graph, invisible
      cy.batch(() => {
        for (const node of nodesToAdd) cy.add(node);
        for (const edge of edgesToAdd) cy.add(edge);
        cy.style().fromJson(style).update();
        cy.elements().forEach((e) => {
          if (!oldIds.has(e.id())) {
            e.style({ opacity: 0 });
          }
        });
      });

      // Restore viewport (adding elements may shift it)
      cy.zoom(savedZoom);
      cy.pan(savedPan);

      // Animate both sets simultaneously
      const duration = 500;
      const animations: Promise<void>[] = [];
      let maxDist = 0;
      for (const [, target] of newNodeTargets) {
        const dx = target.x - centerX;
        const dy = target.y - centerY;
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy));
      }

      cy.nodes().forEach((node) => {
        if (oldIds.has(node.id())) {
          // OLD node: fly out + fade
          const pos = node.position();
          if (direction === "forward") {
            const dx = pos.x - originX;
            const dy = pos.y - originY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const scale = 3 + dist * 0.01;
            animations.push(playAnimation(node.animation({
              position: { x: originX + dx * scale, y: originY + dy * scale },
              style: { opacity: 0 },
            }, { duration, easing: "ease-in" })));
          } else {
            animations.push(playAnimation(node.animation({
              position: { x: centerX, y: centerY },
              style: { opacity: 0 },
            }, { duration, easing: "ease-in" })));
          }
        } else {
          // NEW node: stagger entrance by distance from center
          const target = newNodeTargets.get(node.id());
          if (target) {
            const dx = target.x - centerX;
            const dy = target.y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const delay = maxDist > 0 ? (dist / maxDist) * 150 : 0;

            animations.push(new Promise<void>((r) => {
              setTimeout(() => {
                if (node.removed()) {
                  r();
                  return;
                }
                playAnimation(node.animation({
                  position: target,
                  style: { opacity: 1 },
                }, { duration, easing: "ease-out" })).then(r);
              }, delay);
            }));
          }
        }
      });

      // Old edges: fade out
      cy.edges().forEach((edge) => {
        if (oldIds.has(edge.id())) {
          animations.push(playAnimation(edge.animation(
            { style: { opacity: 0 } },
            { duration: duration * 0.6, easing: "ease-in" },
          )));
        }
      });

      // New edges: fade in slightly delayed
      const newEdgePromise = new Promise<void>((edgeResolve) => {
        setTimeout(() => {
          const edgeAnims: Promise<void>[] = [];
          cy.edges().forEach((edge) => {
            if (!oldIds.has(edge.id())) {
              edgeAnims.push(playAnimation(edge.animation(
                { style: { opacity: 1 } },
                { duration: duration * 0.6, easing: "ease-out" },
              )));
            }
          });
          Promise.all(edgeAnims).then(() => edgeResolve());
        }, duration * 0.3);
      });

      // After all animations: remove old, finalize new
      Promise.all([...animations, newEdgePromise]).then(() => {
        cy.batch(() => {
          cy.elements().forEach((e) => {
            if (oldIds.has(e.id())) {
              e.remove();
            }
          });
          cy.nodes().forEach((node) => {
            const target = newNodeTargets.get(node.id());
            if (target) node.position(target);
            node.style({ opacity: 1 });
          });
          cy.edges().forEach((edge) => {
            edge.style({ opacity: 1 });
          });
        });
        resolve();
      });
    })();
  });
}
