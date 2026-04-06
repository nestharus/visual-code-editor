import { batch, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";

import type { GraphDefinition, GraphEdge } from "./layout/types";

// --- Types ---

export type TransportToken = {
  id: string;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  distance: number;
  status: "traveling" | "pulse" | "done";
  lineage: string;
};

type EdgeMetrics = {
  pathEl: SVGPathElement;
  totalLength: number;
  sourceNodeId: string;
  targetNodeId: string;
};

const TOKEN_CAP = 64;
const PULSE_DURATION_MS = 300;
const STEP_QUANTUM_MS = 250;
const DEFAULT_SPEED_PX_PER_MS = 0.15;

// --- Scoped path registry ---

const pathRegistries = new Map<string, Map<string, EdgeMetrics>>();

function getRegistry(scope: string): Map<string, EdgeMetrics> {
  let reg = pathRegistries.get(scope);
  if (!reg) {
    reg = new Map();
    pathRegistries.set(scope, reg);
  }
  return reg;
}

export function registerEdgePath(edgeId: string, pathEl: SVGPathElement, source: string, target: string, scope = "graph") {
  getRegistry(scope).set(edgeId, {
    pathEl,
    totalLength: pathEl.getTotalLength(),
    sourceNodeId: source,
    targetNodeId: target,
  });
}

export function clearPathRegistry(scope = "graph") {
  pathRegistries.get(scope)?.clear();
}

function lookupPath(edgeId: string, scope: string): EdgeMetrics | undefined {
  return getRegistry(scope).get(edgeId);
}

// --- Store ---

let tokenIdCounter = 0;

function prefersReducedMotion() {
  return !!(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function createTransportStore(graph: Accessor<GraphDefinition>, pathScope = "graph") {
  const [playing, setPlaying] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [timeMs, setTimeMs] = createSignal(0);
  const [tokens, setTokens] = createStore<TransportToken[]>([]);
  const [activeBehavior, setActiveBehavior] = createSignal<string | null>(null);
  const reducedMotion = prefersReducedMotion();

  let rafHandle: number | null = null;
  let lastFrameTime: number | null = null;

  const edgesBySource = createMemo(() => {
    const map = new Map<string, GraphEdge[]>();
    for (const edge of graph().edges) {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    }
    return map;
  });

  const activeNodeIds = createMemo(() => {
    const ids = new Set<string>();
    for (const token of tokens) {
      if (token.status !== "done") {
        ids.add(token.sourceNodeId);
        ids.add(token.targetNodeId);
      }
    }
    return ids;
  });

  const activeEdgeIds = createMemo(() => {
    const ids = new Set<string>();
    for (const token of tokens) {
      if (token.status !== "done") {
        ids.add(token.edgeId);
      }
    }
    return ids;
  });

  function getTokenPosition(token: TransportToken): { x: number; y: number } | null {
    if (token.status !== "traveling") return null;
    const metrics = lookupPath(token.edgeId, pathScope);
    if (!metrics) return null;
    const point = metrics.pathEl.getPointAtLength(Math.min(token.distance, metrics.totalLength));
    return { x: point.x, y: point.y };
  }

  function advanceTokens(deltaMs: number) {
    const effectiveDelta = deltaMs * speed();
    const newTokens: TransportToken[] = [];

    setTokens(produce((draft) => {
      for (let i = draft.length - 1; i >= 0; i--) {
        const token = draft[i];

        if (token.status === "done") continue;

        if (token.status === "pulse") {
          // Pulse has a fixed duration — tracked via timeMs
          token.status = "done";
          continue;
        }

        // traveling
        const metrics = lookupPath(token.edgeId, pathScope);
        if (!metrics) {
          token.status = "done";
          continue;
        }

        token.distance += effectiveDelta * DEFAULT_SPEED_PX_PER_MS;

        if (token.distance >= metrics.totalLength) {
          // Arrived at target
          token.status = "pulse";

          // Branch: find outgoing edges from target
          const outgoing = edgesBySource().get(token.targetNodeId) ?? [];
          const matching = outgoing.filter((e) => !!lookupPath(e.id, pathScope));

          if (matching.length > 0 && draft.length + newTokens.length < TOKEN_CAP) {
            for (const edge of matching) {
              newTokens.push({
                id: `t${++tokenIdCounter}`,
                edgeId: edge.id,
                sourceNodeId: edge.source,
                targetNodeId: edge.target,
                distance: 0,
                status: "traveling",
                lineage: token.lineage,
              });
            }
          }
        }
      }
    }));

    if (newTokens.length > 0) {
      setTokens(produce((draft) => {
        for (const t of newTokens) {
          if (draft.length < TOKEN_CAP) draft.push(t);
        }
      }));
    }

    setTimeMs((t) => t + effectiveDelta);

    // Check if all done
    const allDone = tokens.every((t) => t.status === "done");
    if (allDone && tokens.length > 0) {
      stopRAF();
      setPlaying(false);
    }
  }

  function rafTick(now: number) {
    if (!playing()) return;
    const delta = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
    lastFrameTime = now;
    batch(() => advanceTokens(delta));
    rafHandle = requestAnimationFrame(rafTick);
  }

  function startRAF() {
    if (rafHandle) return;
    lastFrameTime = null;
    rafHandle = requestAnimationFrame(rafTick);
  }

  function stopRAF() {
    if (rafHandle) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
      lastFrameTime = null;
    }
  }

  function load(startNodeId: string, behaviorKey?: string) {
    stopRAF();
    setActiveBehavior(behaviorKey ?? null);
    setTimeMs(0);

    const outgoing = edgesBySource().get(startNodeId) ?? [];
    const starting = outgoing.filter((e) => !!lookupPath(e.id, pathScope));

    const initialTokens: TransportToken[] = starting.slice(0, TOKEN_CAP).map((edge) => ({
      id: `t${++tokenIdCounter}`,
      edgeId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      distance: 0,
      status: "traveling" as const,
      lineage: `flow-${tokenIdCounter}`,
    }));

    setTokens(reconcile(initialTokens));
  }

  function play() {
    if (tokens.length === 0) return;
    setPlaying(true);
    startRAF();
  }

  function pause() {
    setPlaying(false);
    stopRAF();
  }

  function reset() {
    stopRAF();
    setPlaying(false);
    setTimeMs(0);
    setTokens(reconcile([]));
    setActiveBehavior(null);
  }

  function step() {
    if (tokens.length === 0) return;
    batch(() => advanceTokens(reducedMotion ? 99999 : STEP_QUANTUM_MS));
  }

  // Cleanup on graph change
  createEffect(() => {
    graph(); // track
    reset();
  });

  onCleanup(() => {
    stopRAF();
  });

  return {
    playing,
    speed,
    timeMs,
    tokens: tokens as readonly TransportToken[],
    activeNodeIds,
    activeEdgeIds,
    activeBehavior,
    reducedMotion,
    getTokenPosition,
    load,
    play,
    pause,
    reset,
    step,
    setSpeed,
  };
}

export type TransportStoreType = ReturnType<typeof createTransportStore>;
