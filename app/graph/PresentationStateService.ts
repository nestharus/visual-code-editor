import { createEffect, createRoot, createSignal, onCleanup, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { createDerivedSpring } from "@solid-primitives/spring";

import type { GraphDefinition, GraphNode } from "./layout/types";

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

export function createPresentationStateService(graph: Accessor<GraphDefinition>) {
  // Non-reactive map of layout positions — written once per graph commit.
  const layoutById = new Map<string, BaseLayout>();
  const [stateById, setStateById] = createStore<Record<string, PresentationState>>({});
  const hoverSprings = new Map<string, HoverSpring>();
  const reducedMotion = prefersReducedMotion();

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

    // Glow is always instant
    setStateById(nodeId, "glow", hovered ? 1 : 0);

    if (isCompound) {
      // Compounds: no lift, no scale
      setStateById(nodeId, "ty", 0);
      setStateById(nodeId, "innerScale", 1);
      return;
    }

    if (reducedMotion) {
      setStateById(nodeId, "ty", hovered ? -6 : 0);
      setStateById(nodeId, "innerScale", hovered ? 1.04 : 1);
      return;
    }

    const spring = ensureHoverSpring(nodeId);
    spring.setTarget(hovered ? -6 : 0, hovered ? 1.04 : 1);
  }

  function replaceGraph(nodes: GraphNode[]) {
    // Dispose all hover springs
    for (const spring of hoverSprings.values()) spring.dispose();
    hoverSprings.clear();

    layoutById.clear();

    const nextState: Record<string, PresentationState> = {};
    for (const node of nodes) {
      const width = node.size?.width ?? 150;
      const height = node.size?.height ?? 60;
      const x = node.position?.x ?? 0;
      const y = node.position?.y ?? 0;

      layoutById.set(node.id, { x, y, width, height });
      nextState[node.id] = { ...DEFAULT_STATE };
    }

    setStateById(reconcile(nextState));
  }

  function clear() {
    for (const spring of hoverSprings.values()) spring.dispose();
    hoverSprings.clear();
    layoutById.clear();
    setStateById(reconcile({}));
  }

  function layout(id: string): BaseLayout {
    return layoutById.get(id) ?? FALLBACK_LAYOUT;
  }

  function state(id: string): PresentationState {
    return stateById[id] ?? DEFAULT_STATE;
  }

  function tx(id: string): number {
    return stateById[id]?.tx ?? 0;
  }

  function ty(id: string): number {
    return stateById[id]?.ty ?? 0;
  }

  function composedRect(id: string): ComposedRect {
    return rectFromLayout(layout(id), tx(id), ty(id));
  }

  function patch(id: string, next: PresentationPatch) {
    if (!layoutById.has(id) || Object.keys(next).length === 0) return;
    setStateById(id, (prev) => ({ ...(prev ?? DEFAULT_STATE), ...next }));
  }

  createEffect(() => {
    replaceGraph(graph().nodes);
  });

  onCleanup(() => clear());

  return { replaceGraph, clear, tx, ty, state, composedRect, patch, setHoverTarget };
}

export type PresentationStateService = ReturnType<typeof createPresentationStateService>;
