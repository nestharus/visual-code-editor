import {
  createContext,
  createMemo,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

import type {
  OperationalOverlay,
  OverlayProviderId,
  OverlaySignalKind,
} from "./overlay";

const OVERLAY_PROVIDER_IDS = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
] as const satisfies readonly OverlayProviderId[];

type OverlaySignalIndex = ReadonlyMap<
  string,
  ReadonlyMap<OverlayProviderId, OverlaySignalKind>
>;

interface OverlayProviderProps {
  overlay: Accessor<OperationalOverlay>;
  children: JSX.Element;
}

export interface SignalsForEntity {
  /** Per-provider signal kind for the entity, or null if no signal. */
  byProvider: Readonly<Record<OverlayProviderId, OverlaySignalKind | null>>;
}

const OverlayContext = createContext<Accessor<OverlaySignalIndex> | null>(null);

const EMPTY_SIGNALS_FOR_ENTITY: SignalsForEntity = {
  byProvider: {
    "g:test": null,
    "g:pr-delta": null,
    "g:deploy": null,
    "g:profile": null,
    "g:task-active": null,
  },
};

function buildOverlaySignalIndex(overlay: OperationalOverlay): OverlaySignalIndex {
  const index = new Map<string, Map<OverlayProviderId, OverlaySignalKind>>();

  for (const layer of overlay.layers) {
    for (const signal of layer.signals) {
      const byProvider = index.get(signal.entityId) ?? new Map();
      byProvider.set(signal.providerId, signal.kind);
      index.set(signal.entityId, byProvider);
    }
  }

  return index;
}

function signalsForEntity(
  index: OverlaySignalIndex,
  entityId: string,
): SignalsForEntity {
  const byProvider = index.get(entityId);

  return {
    byProvider: {
      "g:test": byProvider?.get("g:test") ?? null,
      "g:pr-delta": byProvider?.get("g:pr-delta") ?? null,
      "g:deploy": byProvider?.get("g:deploy") ?? null,
      "g:profile": byProvider?.get("g:profile") ?? null,
      "g:task-active": byProvider?.get("g:task-active") ?? null,
    },
  };
}

function signalsEqual(
  previous: SignalsForEntity | undefined,
  next: SignalsForEntity | undefined,
): boolean {
  if (!previous || !next) return false;

  return OVERLAY_PROVIDER_IDS.every(
    (providerId) =>
      previous.byProvider[providerId] === next.byProvider[providerId],
  );
}

export function OverlayProvider(props: OverlayProviderProps): JSX.Element {
  const signalIndex = createMemo(() => buildOverlaySignalIndex(props.overlay()));

  return (
    <OverlayContext.Provider value={signalIndex}>
      {props.children}
    </OverlayContext.Provider>
  );
}

/** Returns reactive signals for the given entity id. Throws if used outside an OverlayProvider. */
export function useOverlaySignals(
  entityId: Accessor<string>,
): Accessor<SignalsForEntity> {
  const signalIndex = useContext(OverlayContext);
  if (signalIndex === null) {
    throw new Error("useOverlaySignals must be used inside an OverlayProvider");
  }

  return createMemo<SignalsForEntity>(
    () => signalsForEntity(signalIndex(), entityId()),
    EMPTY_SIGNALS_FOR_ENTITY,
    { equals: signalsEqual },
  );
}
