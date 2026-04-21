// UNWIRED as of 2026-04-21: card drill-downs now use the CSS route
// transition path in GraphSurface.tsx. See governance/design/
// graph-surface-rfc-v2.md:111-126. Do NOT re-import without first
// addressing the non-reactive `checkActive()` / the self-target exit
// tween bugs documented in .tmp/rca/diagram-transitions-missing-
// response.md.
import { createSignal } from "solid-js";
import { produce } from "solid-js/store";

import type { PresentationStateService, ComposedRect } from "./PresentationStateService";
import type { GraphNode } from "./layout/types";

// --- Transition context (survives route changes) ---

export type TransitionContext = {
  anchorRect: ComposedRect;
  anchorNodeId: string;
  direction: "drill" | "back";
  anchorViewportRect?: DOMRect;
  nodeShape?: string;
};

const [transitionContext, setTransitionContext] = createSignal<TransitionContext | null>(null);
let lastClickedViewportRect: DOMRect | null = null;
let lastClickedNodeShape: string | undefined;

export function captureClickRect(viewportRect: DOMRect, shape?: string) {
  lastClickedViewportRect = viewportRect;
  lastClickedNodeShape = shape;
}

export function captureAnchor(
  rect: ComposedRect,
  nodeId: string,
  direction: "drill" | "back",
) {
  setTransitionContext({
    anchorRect: rect,
    anchorNodeId: nodeId,
    direction,
    anchorViewportRect: lastClickedViewportRect ?? undefined,
    nodeShape: lastClickedNodeShape,
  });
}

export function consumeTransitionContext(): TransitionContext | null {
  const ctx = transitionContext();
  setTransitionContext(null);
  lastClickedViewportRect = null;
  lastClickedNodeShape = undefined;
  return ctx;
}

// --- Lazy GSAP loader ---

type GsapModule = { gsap: typeof import("gsap").gsap };

let gsapPromise: Promise<GsapModule> | null = null;
let gsapUnavailable = false;

async function loadGsap(): Promise<GsapModule | null> {
  if (gsapUnavailable) return null;
  if (!gsapPromise) {
    gsapPromise = import("gsap").then((m) => ({ gsap: m.gsap ?? m.default ?? m })).catch(() => {
      gsapUnavailable = true;
      return null;
    }) as Promise<GsapModule>;
  }
  return gsapPromise;
}

// --- Timeline execution ---

let activeTimeline: { kill: () => void } | null = null;

export function killActiveTransition() {
  if (activeTimeline) {
    activeTimeline.kill();
    activeTimeline = null;
  }
}

function prefersReducedMotion() {
  return !!(
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function distanceFromAnchor(node: GraphNode, anchor: ComposedRect): number {
  const nx = node.position?.x ?? 0;
  const ny = node.position?.y ?? 0;
  return Math.hypot(nx - anchor.centerX, ny - anchor.centerY);
}

function staggerDelay(distance: number, maxDistance: number, maxDelay: number): number {
  if (maxDistance <= 0) return 0;
  return (distance / maxDistance) * maxDelay;
}

export async function runDrillExit(
  presentation: PresentationStateService,
  nodes: GraphNode[],
  anchor: ComposedRect,
): Promise<boolean> {
  if (prefersReducedMotion() || nodes.length === 0) return false;

  const mod = await loadGsap();
  if (!mod) return false;

  killActiveTransition();

  const { gsap } = mod;
  const maxDist = Math.max(...nodes.map((n) => distanceFromAnchor(n, anchor)), 1);

  return new Promise<boolean>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => { activeTimeline = null; resolve(true); },
    });
    activeTimeline = tl;

    for (const node of nodes) {
      const dist = distanceFromAnchor(node, anchor);
      const delay = staggerDelay(dist, maxDist, 0.15);
      const dx = (node.position?.x ?? 0) - anchor.centerX;
      const dy = (node.position?.y ?? 0) - anchor.centerY;
      const pushDist = Math.max(30, dist * 0.3);
      const pushAngle = Math.atan2(dy, dx);

      const target = {
        tx: Math.cos(pushAngle) * pushDist,
        ty: Math.sin(pushAngle) * pushDist,
        opacity: 0,
        innerScale: 0.7,
      };

      tl.to(target, {
        duration: 0.3,
        delay,
        ease: "power2.in",
        onUpdate() {
          presentation.patch(node.id, {
            tx: target.tx,
            ty: target.ty,
            opacity: target.opacity,
            innerScale: target.innerScale,
          });
        },
      }, 0);
    }
  });
}

export async function runDrillEnter(
  presentation: PresentationStateService,
  nodes: GraphNode[],
  anchor: ComposedRect,
): Promise<boolean> {
  if (prefersReducedMotion() || nodes.length === 0) return false;

  const mod = await loadGsap();
  if (!mod) return false;

  killActiveTransition();

  const { gsap } = mod;
  const maxDist = Math.max(...nodes.map((n) => distanceFromAnchor(n, anchor)), 1);

  // Seed nodes at burst center
  for (const node of nodes) {
    const dx = (node.position?.x ?? 0) - anchor.centerX;
    const dy = (node.position?.y ?? 0) - anchor.centerY;
    presentation.patch(node.id, {
      tx: -dx * 0.6,
      ty: -dy * 0.6,
      opacity: 0,
      innerScale: 0.5,
    });
  }

  return new Promise<boolean>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => { activeTimeline = null; resolve(true); },
    });
    activeTimeline = tl;

    for (const node of nodes) {
      const dist = distanceFromAnchor(node, anchor);
      const delay = staggerDelay(dist, maxDist, 0.18);

      const state = { tx: presentation.tx(node.id), ty: presentation.ty(node.id), opacity: 0, innerScale: 0.5 };

      tl.to(state, {
        tx: 0,
        ty: 0,
        opacity: 1,
        innerScale: 1,
        duration: 0.45,
        delay,
        ease: "power2.out",
        onUpdate() {
          presentation.patch(node.id, {
            tx: state.tx,
            ty: state.ty,
            opacity: state.opacity,
            innerScale: state.innerScale,
          });
        },
      }, 0);
    }
  });
}

export async function runCollapseExit(
  presentation: PresentationStateService,
  nodes: GraphNode[],
  targetCenter: { x: number; y: number },
): Promise<boolean> {
  if (prefersReducedMotion() || nodes.length === 0) return false;

  const mod = await loadGsap();
  if (!mod) return false;

  killActiveTransition();

  const { gsap } = mod;

  return new Promise<boolean>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => { activeTimeline = null; resolve(true); },
    });
    activeTimeline = tl;

    for (const node of nodes) {
      const dx = targetCenter.x - (node.position?.x ?? 0);
      const dy = targetCenter.y - (node.position?.y ?? 0);

      const target = { tx: dx * 0.6, ty: dy * 0.6, opacity: 0, innerScale: 0.5 };

      tl.to(target, {
        duration: 0.35,
        ease: "power2.in",
        onUpdate() {
          presentation.patch(node.id, {
            tx: target.tx,
            ty: target.ty,
            opacity: target.opacity,
            innerScale: target.innerScale,
          });
        },
      }, 0);
    }
  });
}

export async function runCollapseEnter(
  presentation: PresentationStateService,
  nodes: GraphNode[],
  anchorNodeId: string,
): Promise<boolean> {
  if (prefersReducedMotion() || nodes.length === 0) return false;

  const mod = await loadGsap();
  if (!mod) return false;

  killActiveTransition();

  const { gsap } = mod;

  // Seed: all nodes at normal positions but reduced opacity/scale
  for (const node of nodes) {
    presentation.patch(node.id, {
      tx: 0,
      ty: 0,
      opacity: 0,
      innerScale: 0.85,
    });
  }

  // The anchor node (cluster we're returning to) gets a brief overscale settle
  const anchorNode = nodes.find((n) => n.id === anchorNodeId);

  return new Promise<boolean>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => { activeTimeline = null; resolve(true); },
    });
    activeTimeline = tl;

    for (const node of nodes) {
      const isAnchor = node.id === anchorNodeId;
      const state = { opacity: 0, innerScale: isAnchor ? 1.08 : 0.85 };

      tl.to(state, {
        opacity: 1,
        innerScale: isAnchor ? 1 : 1,
        duration: isAnchor ? 0.5 : 0.35,
        delay: isAnchor ? 0 : 0.08,
        ease: isAnchor ? "back.out(1.4)" : "power2.out",
        onUpdate() {
          presentation.patch(node.id, {
            opacity: state.opacity,
            innerScale: state.innerScale,
          });
        },
      }, 0);
    }
  });
}
