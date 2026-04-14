import { createEffect, createRoot, createSignal, onCleanup, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { createDerivedSpring } from "@solid-primitives/spring";

import type { GraphDefinition, GraphNode } from "./layout/types";

export type HoverPhase = "idle" | "hovered" | "settling";

export type PresentationState = {
  tx: number;
  ty: number;
  innerScale: number;
  opacity: number;
  glow: number;
};

export type PresentationPatch = Partial<PresentationState>;

export type ComposedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type BaseLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_STATE: PresentationState = {
  tx: 0,
  ty: 0,
  innerScale: 1,
  opacity: 1,
  glow: 0,
};

function rectFromLayout(layout: BaseLayout, tx: number, ty: number): ComposedRect {
  return {
    left: layout.x + tx - layout.width / 2,
    top: layout.y + ty - layout.height / 2,
    width: layout.width,
    height: layout.height,
    centerX: layout.x + tx,
    centerY: layout.y + ty,
  };
}

const FALLBACK_LAYOUT: BaseLayout = { x: 0, y: 0, width: 150, height: 60 };

const SPRING_CONFIG = { stiffness: 0.15, damping: 0.7 };
const SETTLE_REST_TY_EPSILON = 0.25;
const SETTLE_REST_SCALE_EPSILON = 0.005;
const MAX_SETTLE_DURATION_MS = 800;

function prefersReducedMotion() {
  return !!(
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type HoverSpring = {
  dispose: () => void;
  setTarget: (ty: number, scale: number) => void;
};

function isAtRest(ty: number, innerScale: number) {
  return (
    Math.abs(ty) <= SETTLE_REST_TY_EPSILON &&
    Math.abs(innerScale - 1) <= SETTLE_REST_SCALE_EPSILON
  );
}

export function createPresentationStateService(_graph: Accessor<GraphDefinition>) {
  // Non-reactive map of layout positions — written once per graph commit.
  const layoutById = new Map<string, BaseLayout>();
  const [stateById, setStateById] = createStore<Record<string, PresentationState>>({});
  const [hoverPhaseById, setHoverPhaseById] = createStore<Record<string, HoverPhase>>({});
  const hoverSprings = new Map<string, HoverSpring>();
  const settleTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const reducedMotion = prefersReducedMotion();

  function cancelSettleTimeout(nodeId: string) {
    const timeout = settleTimeouts.get(nodeId);
    if (timeout === undefined) return;
    clearTimeout(timeout);
    settleTimeouts.delete(nodeId);
  }

  function finishSettling(nodeId: string) {
    cancelSettleTimeout(nodeId);
    if (!layoutById.has(nodeId) || hoverPhaseById[nodeId] !== "settling") return;
    setHoverPhaseById(nodeId, "idle");
    setStateById(nodeId, "ty", 0);
    setStateById(nodeId, "innerScale", 1);
  }

  function scheduleSettleTimeout(nodeId: string) {
    cancelSettleTimeout(nodeId);
    settleTimeouts.set(
      nodeId,
      setTimeout(() => finishSettling(nodeId), MAX_SETTLE_DURATION_MS),
    );
  }

  function createHoverSpring(nodeId: string): HoverSpring {
    return createRoot((dispose) => {
      const [targetTy, setTargetTy] = createSignal(0);
      const [targetScale, setTargetScale] = createSignal(1);

      const springTy = createDerivedSpring(targetTy, SPRING_CONFIG);
      const springScale = createDerivedSpring(targetScale, SPRING_CONFIG);

      createEffect(() => {
        const currentTy = springTy();
        const currentScale = springScale();
        if (!layoutById.has(nodeId)) return;
        setStateById(nodeId, "ty", currentTy);
        setStateById(nodeId, "innerScale", currentScale);
        if (hoverPhaseById[nodeId] === "settling" && isAtRest(currentTy, currentScale)) {
          finishSettling(nodeId);
        }
      });

      return {
        dispose,
        setTarget(ty: number, scale: number) {
          setTargetTy(ty);
          setTargetScale(scale);
        },
      };
    });
  }

  function ensureHoverSpring(nodeId: string): HoverSpring {
    let spring = hoverSprings.get(nodeId);
    if (!spring) {
      spring = createHoverSpring(nodeId);
      hoverSprings.set(nodeId, spring);
    }
    return spring;
  }

  function setHoverTarget(nodeId: string, hovered: boolean, isCompound: boolean) {
    if (!layoutById.has(nodeId)) return;

    cancelSettleTimeout(nodeId);

    if (hovered) {
      setHoverPhaseById(nodeId, "hovered");
      setStateById(nodeId, "glow", 1);

      if (isCompound) {
        // Compounds: no lift, no scale.
        setStateById(nodeId, "ty", 0);
        setStateById(nodeId, "innerScale", 1);
        return;
      }

      if (reducedMotion) {
        setStateById(nodeId, "ty", -12);
        setStateById(nodeId, "innerScale", 1.08);
        return;
      }

      const spring = ensureHoverSpring(nodeId);
      spring.setTarget(-12, 1.08);
      return;
    }

    setStateById(nodeId, "glow", 0);

    if (isCompound || reducedMotion) {
      setHoverPhaseById(nodeId, "idle");
      setStateById(nodeId, "ty", 0);
      setStateById(nodeId, "innerScale", 1);
      return;
    }

    setHoverPhaseById(nodeId, "settling");
    const spring = ensureHoverSpring(nodeId);
    spring.setTarget(0, 1);
    if (isAtRest(stateById[nodeId]?.ty ?? 0, stateById[nodeId]?.innerScale ?? 1)) {
      finishSettling(nodeId);
      return;
    }
    scheduleSettleTimeout(nodeId);
  }

  function replaceGraph(nodes: GraphNode[]) {
    // Dispose all hover springs
    for (const spring of hoverSprings.values()) spring.dispose();
    hoverSprings.clear();
    for (const timeout of settleTimeouts.values()) clearTimeout(timeout);
    settleTimeouts.clear();

    layoutById.clear();

    const nextState: Record<string, PresentationState> = {};
    const nextHoverPhase: Record<string, HoverPhase> = {};
    for (const node of nodes) {
      const width = node.size?.width ?? 150;
      const height = node.size?.height ?? 60;
      const x = node.position?.x ?? 0;
      const y = node.position?.y ?? 0;

      layoutById.set(node.id, { x, y, width, height });
      nextState[node.id] = { ...DEFAULT_STATE };
      nextHoverPhase[node.id] = "idle";
    }

    setStateById(reconcile(nextState));
    setHoverPhaseById(reconcile(nextHoverPhase));
  }

  function seedEnteringNodes(nodeIds: string[]) {
    for (const nodeId of nodeIds) {
      patch(nodeId, { opacity: 0, innerScale: 0.82, ty: 16 });
    }
  }

  function animateToDefault(nodeIds: string[]) {
    for (const nodeId of nodeIds) {
      patch(nodeId, { opacity: 1, innerScale: 1, ty: 0 });
    }
  }

  function clear() {
    for (const spring of hoverSprings.values()) spring.dispose();
    hoverSprings.clear();
    for (const timeout of settleTimeouts.values()) clearTimeout(timeout);
    settleTimeouts.clear();
    layoutById.clear();
    setStateById(reconcile({}));
    setHoverPhaseById(reconcile({}));
  }

  function layout(id: string): BaseLayout {
    return layoutById.get(id) ?? FALLBACK_LAYOUT;
  }

  function state(id: string): PresentationState {
    return stateById[id] ?? DEFAULT_STATE;
  }

  function hoverPhase(id: string): HoverPhase {
    return hoverPhaseById[id] ?? "idle";
  }

  function tx(id: string): number {
    return stateById[id]?.tx ?? 0;
  }

  function ty(id: string): number {
    return stateById[id]?.ty ?? 0;
  }

  function innerScale(id: string): number {
    return stateById[id]?.innerScale ?? 1;
  }

  function composedRect(id: string): ComposedRect {
    return rectFromLayout(layout(id), tx(id), ty(id));
  }

  function patch(id: string, next: PresentationPatch) {
    if (!layoutById.has(id) || Object.keys(next).length === 0) return;
    setStateById(id, (prev) => ({ ...(prev ?? DEFAULT_STATE), ...next }));
  }

  onCleanup(() => clear());

  return {
    replaceGraph,
    seedEnteringNodes,
    animateToDefault,
    clear,
    tx,
    ty,
    innerScale,
    state,
    hoverPhase,
    composedRect,
    patch,
    setHoverTarget,
  };
}

export type PresentationStateService = ReturnType<typeof createPresentationStateService>;
