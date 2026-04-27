import { classify, DEFAULT_CONFIG as DEFAULT_CLASSIFIER_CONFIG } from "../../app/lib/relevance";
import type {
  ChangeEvent as AppChangeEvent,
  UserContext as AppUserContext,
} from "../../app/lib/user-context";
import type {
  ChangeEvent,
  ChangeEventDisposition,
  ChangeEventInput,
  StoredChangeEvent,
  UserContext,
} from "./types";

export type ChangeEventStore = {
  classifyAndStore(userContextId: string, event: ChangeEventInput): StoredChangeEvent;
  list(userContextId: string, options?: { includeSuppressed?: boolean }): StoredChangeEvent[];
  dispose(
    userContextId: string,
    eventId: string,
    disposition: ChangeEventDisposition,
  ): StoredChangeEvent | null;
  getUserContext(id: string): UserContext | null;
  putUserContext(context: UserContext): UserContext;
  listUserContexts(): UserContext[];
};

export function createChangeEventStore(): ChangeEventStore {
  const userContexts = new Map<string, UserContext>();
  const eventsByContext = new Map<string, StoredChangeEvent[]>();

  function classifyAndStore(
    userContextId: string,
    eventInput: ChangeEventInput,
  ): StoredChangeEvent {
    const context = userContexts.get(userContextId);
    if (!context) {
      throw new Error(`Unknown user context: ${userContextId}`);
    }

    const provisionalEvent: ChangeEvent = {
      ...eventInput,
      tier: eventInput.blocking ? "immediate" : (eventInput.tier ?? "suppressed"),
    };
    const decision = classify(
      provisionalEvent as AppChangeEvent,
      context as AppUserContext,
      DEFAULT_CLASSIFIER_CONFIG,
      Date.now(),
    );
    const stored: StoredChangeEvent = {
      ...provisionalEvent,
      tier: decision.tier,
      userContextId,
    };

    const current = eventsByContext.get(userContextId) ?? [];
    const withoutExisting = current.filter((event) => event.id !== stored.id);
    eventsByContext.set(userContextId, [stored, ...withoutExisting]);
    return stored;
  }

  function list(
    userContextId: string,
    options: { includeSuppressed?: boolean } = {},
  ): StoredChangeEvent[] {
    const includeSuppressed = options.includeSuppressed ?? false;
    return (eventsByContext.get(userContextId) ?? [])
      .filter((event) => includeSuppressed || event.tier !== "suppressed")
      .map((event) => ({ ...event }));
  }

  function dispose(
    userContextId: string,
    eventId: string,
    disposition: ChangeEventDisposition,
  ): StoredChangeEvent | null {
    const current = eventsByContext.get(userContextId) ?? [];
    const index = current.findIndex((event) => event.id === eventId);
    if (index < 0) return null;

    const existing = current[index];
    const updated: StoredChangeEvent = {
      ...existing,
      tier:
        disposition === "disposed_to_immediate"
          ? "immediate"
          : "suppressed",
      disposition,
      disposedAtMs: Date.now(),
    };

    const next = [...current];
    next[index] = updated;
    eventsByContext.set(userContextId, next);
    return { ...updated };
  }

  function getUserContext(id: string): UserContext | null {
    const context = userContexts.get(id);
    return context ? cloneUserContext(context) : null;
  }

  function putUserContext(context: UserContext): UserContext {
    const stored = cloneUserContext(context);
    userContexts.set(stored.id, stored);
    if (!eventsByContext.has(stored.id)) {
      eventsByContext.set(stored.id, []);
    }
    return cloneUserContext(stored);
  }

  function listUserContexts(): UserContext[] {
    return [...userContexts.values()].map(cloneUserContext);
  }

  return {
    classifyAndStore,
    list,
    dispose,
    getUserContext,
    putUserContext,
    listUserContexts,
  };
}

function cloneUserContext(context: UserContext): UserContext {
  return {
    ...context,
    openedSurfaces: context.openedSurfaces.map((surface) => ({ ...surface })),
    recentPrompts: context.recentPrompts.map((prompt) => ({ ...prompt })),
    activeTaskIds: [...context.activeTaskIds],
    activeSliceIds: [...context.activeSliceIds],
  };
}
