import {
  DEFAULT_CONFIG as DEFAULT_LIFECYCLE_CONFIG,
  evaluate,
  type ArtifactSnapshot,
} from "../../app/lib/lifecycle";
import type { SliceManager } from "../slices/manager";
import type { Slice, SliceLifecycleState } from "../slices/types";
import type { ChangeEventStore } from "./store";

export type LifecycleTicker = {
  stop: () => void;
  tick: () => void;
};

export function startLifecycleTicker(options: {
  sliceManager: SliceManager;
  changeEvents: ChangeEventStore;
  intervalMs?: number;
}): LifecycleTicker {
  const intervalMs = options.intervalMs ?? tickerIntervalMsFromEnv();

  const tick = () => {
    tickSlices(options.sliceManager, options.changeEvents);
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
    tick,
  };
}

export function tickerIntervalMsFromEnv(): number {
  const parsed = Number.parseInt(process.env.H_TICKER_INTERVAL_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

function tickSlices(sliceManager: SliceManager, changeEvents: ChangeEventStore): void {
  const nowMs = Date.now();
  for (const slice of sliceManager.list({ includeDismissed: true })) {
    if (slice.lifecycleState === "dismissed") continue;

    const snapshot = snapshotForSlice(slice);
    if (!snapshot) continue;

    const decision = evaluate(snapshot, nowMs, DEFAULT_LIFECYCLE_CONFIG);
    if (!decision.changed) continue;

    const toState = transitionTarget(slice.lifecycleState, decision.nextState);
    if (!toState) continue;

    try {
      const transitioned = sliceManager.transition(slice.id, {
        toState,
        actor: "product:digest-surface",
      });
      emitSliceLifecycleEvents(changeEvents, transitioned, slice.lifecycleState, toState, nowMs);
    } catch {
      // The ticker is opportunistic. Invalid lifecycle edges should not stop
      // future slices from being evaluated.
    }
  }
}

function snapshotForSlice(slice: Slice): ArtifactSnapshot | null {
  if (slice.lifecycleState === "pinned") {
    return {
      artifactId: slice.id,
      currentState: slice.lifecycleState,
      createdAtMs: slice.createdAtMs,
      ttlMs: null,
      tombstonedAtMs: null,
    };
  }

  if (slice.ttlMs === null) return null;

  return {
    artifactId: slice.id,
    currentState: slice.lifecycleState,
    createdAtMs: slice.createdAtMs,
    ttlMs: slice.ttlMs,
    tombstonedAtMs: slice.lifecycleState === "tombstoned" ? slice.ttlMs : null,
  };
}

function transitionTarget(
  currentState: SliceLifecycleState,
  requestedState: SliceLifecycleState,
): SliceLifecycleState | null {
  if (currentState === requestedState) return null;
  if (currentState === "active" && requestedState === "tombstoned") {
    return "expiring";
  }
  return requestedState;
}

function emitSliceLifecycleEvents(
  changeEvents: ChangeEventStore,
  slice: Slice,
  fromState: SliceLifecycleState,
  toState: SliceLifecycleState,
  nowMs: number,
): void {
  const contexts = changeEvents.listUserContexts();
  for (const context of contexts) {
    try {
      changeEvents.classifyAndStore(context.id, {
        id: `change:${sanitizeId(`slice-${slice.id}-${fromState}-${toState}-${nowMs}`)}`,
        kind: "entity-reshaped",
        actor: "product:digest-surface",
        affectedEntityIds: [slice.id],
        affectedKinds: ["slice"],
        blocking: false,
        timestampMs: nowMs,
        contextSummary: `Slice "${slice.query}" moved from ${fromState} to ${toState}.`,
        detailUrl: null,
      });
    } catch {
      // A malformed per-context event should not stop other contexts.
    }
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
