import { createSignal, type Accessor } from "solid-js";

import { WATCHER_URL } from "./diagram-data";
import type {
  NeighbourhoodRule,
  Slice,
  SliceLifecycleState,
} from "./slice";

export interface SlicesStore {
  slices: Accessor<readonly Slice[]>;
  refresh: () => Promise<void>;
  construct: (query: string, rule: NeighbourhoodRule) => Promise<Slice | null>;
  transition: (sliceId: string, toState: SliceLifecycleState) => Promise<void>;
}

function extractSlices(data: unknown): Slice[] {
  if (Array.isArray(data)) return data as Slice[];
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  return Array.isArray(record.slices) ? (record.slices as Slice[]) : [];
}

function extractConstructedSlice(data: unknown): Slice | null {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  if (record.ok === false && record.error_kind === "no-matches") {
    return null;
  }

  return record.slice && typeof record.slice === "object"
    ? (record.slice as Slice)
    : null;
}

export function createSlicesStore(): SlicesStore {
  const [slices, setSlices] = createSignal<readonly Slice[]>([]);

  async function refresh(): Promise<void> {
    try {
      const response = await fetch(`${WATCHER_URL}/api/slices`);
      if (!response.ok) return;

      const data = await response.json();
      setSlices(extractSlices(data));
    } catch {
      // Slice data is a non-blocking rail enhancement.
    }
  }

  async function construct(
    query: string,
    rule: NeighbourhoodRule,
  ): Promise<Slice | null> {
    const response = await fetch(`${WATCHER_URL}/api/slices/construct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, rule }),
    });

    if (!response.ok) {
      throw new Error("Slice construction request failed");
    }

    const data = await response.json();
    const slice = extractConstructedSlice(data);
    if (!slice) {
      return null;
    }

    setSlices((current) => [
      slice,
      ...current.filter((existing) => existing.id !== slice.id),
    ]);
    return slice;
  }

  async function transition(
    sliceId: string,
    toState: SliceLifecycleState,
  ): Promise<void> {
    const response = await fetch(
      `${WATCHER_URL}/api/slices/${encodeURIComponent(sliceId)}/transition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_state: toState }),
      },
    );

    if (response.ok) {
      await refresh();
    }
  }

  return {
    slices,
    refresh,
    construct,
    transition,
  };
}
