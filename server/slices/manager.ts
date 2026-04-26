import type {
  ConstructSliceRequest,
  Slice,
  SliceLifecycleState,
  TransitionSliceRequest,
} from "./types";
import { makeSlice } from "./types";

export type SliceErrorKind =
  | "validation"
  | "not-found"
  | "invalid-transition"
  | "internal";

export class SliceManagerError extends Error {
  readonly errorKind: SliceErrorKind;

  constructor(errorKind: SliceErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SliceManagerError";
    this.errorKind = errorKind;
  }
}

export type SliceManager = {
  add(slice: Slice, request: ConstructSliceRequest): Slice;
  list(options?: { includeDismissed?: boolean }): readonly Slice[];
  get(id: string): Slice | null;
  transition(id: string, request: TransitionSliceRequest): Slice;
};

const TRANSITIONS: Readonly<Record<SliceLifecycleState, ReadonlySet<SliceLifecycleState>>> =
  Object.freeze({
    active: new Set(["pinned", "expiring", "dismissed"]),
    expiring: new Set(["pinned", "tombstoned", "dismissed"]),
    tombstoned: new Set(["recovered", "dismissed"]),
    recovered: new Set(["active", "pinned", "dismissed"]),
    pinned: new Set(["active", "dismissed"]),
    dismissed: new Set(),
  });

export function createSliceManager(): SliceManager {
  const slices = new Map<string, Slice>();
  const defaultTtlMsBySliceId = new Map<string, number>();

  return {
    add(slice: Slice, request: ConstructSliceRequest): Slice {
      const normalized = makeSlice(slice);
      slices.set(normalized.id, normalized);
      defaultTtlMsBySliceId.set(normalized.id, request.defaultTtlMs);
      return normalized;
    },

    list(options: { includeDismissed?: boolean } = {}): readonly Slice[] {
      const includeDismissed = options.includeDismissed ?? false;
      return Array.from(slices.values()).filter((slice) => {
        return includeDismissed || slice.lifecycleState !== "dismissed";
      });
    },

    get(id: string): Slice | null {
      return slices.get(id) ?? null;
    },

    transition(id: string, request: TransitionSliceRequest): Slice {
      const slice = slices.get(id);
      if (!slice) throw new SliceManagerError("not-found", "not found");

      const allowed = TRANSITIONS[slice.lifecycleState];
      if (!allowed.has(request.toState)) {
        throw new SliceManagerError(
          "invalid-transition",
          `invalid transition from ${slice.lifecycleState} to ${request.toState}`,
        );
      }

      const now = Date.now();
      const defaultTtlMs = defaultTtlMsBySliceId.get(id);
      if (defaultTtlMs === undefined) {
        throw new SliceManagerError("internal", "missing slice default TTL");
      }

      const updated = makeSlice({
        ...slice,
        lifecycleState: request.toState,
        ttlMs: request.toState === "pinned" ? null : now + defaultTtlMs,
        pinnedAtMs: request.toState === "pinned" ? now : null,
      });

      slices.set(id, updated);
      return updated;
    },
  };
}
