import { createSignal } from "solid-js";

import type { GraphNode } from "./layout/types";

const EXIT_DURATION_MS = 220;
const ENTER_DURATION_MS = 320;
const MAX_STAGGER_MS = 180;

type TransitionAnchor = { x: number; y: number };

function prefersReducedMotion() {
  return !!(
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function getGraphCenter(nodes: GraphNode[]) {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  let sumX = 0;
  let sumY = 0;

  for (const node of nodes) {
    sumX += node.position?.x ?? 0;
    sumY += node.position?.y ?? 0;
  }

  return { x: sumX / nodes.length, y: sumY / nodes.length };
}

function buildDelayMap(nodes: GraphNode[], anchor?: TransitionAnchor) {
  const origin = anchor ?? getGraphCenter(nodes);
  const distances = nodes.map((node) => {
    const dx = (node.position?.x ?? 0) - origin.x;
    const dy = (node.position?.y ?? 0) - origin.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  const maxDistance = Math.max(...distances, 1);
  const next = new Map<string, number>();

  nodes.forEach((node, index) => {
    next.set(node.id, Math.round((distances[index] / maxDistance) * MAX_STAGGER_MS));
  });

  return next;
}

function getMaxDelay(delayMap: Map<string, number>) {
  return Math.max(...delayMap.values(), 0);
}

export function createTransitionService() {
  const [phase, setPhase] = createSignal<"idle" | "entering" | "exiting">("idle");
  const [enteringNodeIds, setEnteringNodeIds] = createSignal<Set<string>>(new Set());
  const [exitingNodeIds, setExitingNodeIds] = createSignal<Set<string>>(new Set());
  const [nodeDelayMap, setNodeDelayMap] = createSignal<Map<string, number>>(new Map());

  let clearTimer: number | undefined;

  const clear = () => {
    if (clearTimer) {
      window.clearTimeout(clearTimer);
      clearTimer = undefined;
    }

    setPhase("idle");
    setEnteringNodeIds(new Set());
    setExitingNodeIds(new Set());
    setNodeDelayMap(new Map());
  };

  const startExit = (nodes: GraphNode[], anchor?: TransitionAnchor) => {
    if (prefersReducedMotion() || nodes.length === 0) {
      clear();
      return;
    }

    if (clearTimer) {
      window.clearTimeout(clearTimer);
      clearTimer = undefined;
    }

    setPhase("exiting");
    setEnteringNodeIds(new Set());
    setExitingNodeIds(new Set(nodes.map((node) => node.id)));
    setNodeDelayMap(buildDelayMap(nodes, anchor));
  };

  const startEnter = (nodes: GraphNode[]) => {
    if (prefersReducedMotion() || nodes.length === 0) {
      clear();
      return;
    }

    if (clearTimer) {
      window.clearTimeout(clearTimer);
    }

    const delays = buildDelayMap(nodes);
    const maxDelay = getMaxDelay(delays);

    setPhase("entering");
    setExitingNodeIds(new Set());
    setEnteringNodeIds(new Set(nodes.map((node) => node.id)));
    setNodeDelayMap(delays);

    clearTimer = window.setTimeout(() => {
      clear();
    }, ENTER_DURATION_MS + maxDelay + 32);
  };

  const getNodeDelay = (nodeId: string) => `${nodeDelayMap().get(nodeId) ?? 0}ms`;
  const getNodeDelayMs = (nodeId: string) => nodeDelayMap().get(nodeId) ?? 0;
  const exitTotalMs = () => EXIT_DURATION_MS + getMaxDelay(nodeDelayMap());

  return {
    phase,
    enteringNodeIds,
    exitingNodeIds,
    getNodeDelay,
    getNodeDelayMs,
    exitTotalMs,
    clear,
    startExit,
    startEnter,
    prefersReducedMotion,
    exitDurationMs: EXIT_DURATION_MS,
    enterDurationMs: ENTER_DURATION_MS,
  };
}

export type TransitionService = ReturnType<typeof createTransitionService>;
