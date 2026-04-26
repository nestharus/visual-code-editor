import type {
  OperationalOverlay,
  OverlayLayer,
  OverlayProviderId,
} from "./types";
import { makeOverlayLayer, overlayProviderIdFromString } from "./types";

export type OverlayErrorKind = "validation" | "internal" | "not-found";

export class OverlayManagerError extends Error {
  readonly errorKind: OverlayErrorKind;

  constructor(errorKind: OverlayErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OverlayManagerError";
    this.errorKind = errorKind;
  }
}

export type OverlayManager = {
  setLayer(layer: OverlayLayer): OverlayLayer;
  getOverlay(): OperationalOverlay;
  removeLayer(providerId: OverlayProviderId): boolean;
};

export function createOverlayManager(): OverlayManager {
  const layers = new Map<OverlayProviderId, OverlayLayer>();

  return {
    setLayer(layer: OverlayLayer): OverlayLayer {
      try {
        const normalized = makeOverlayLayer(layer);
        layers.set(normalized.providerId, normalized);
        return normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid overlay layer";
        throw new OverlayManagerError("validation", message, { cause: error });
      }
    },

    getOverlay(): OperationalOverlay {
      const sortedLayers = Array.from(layers.values()).sort((left, right) =>
        left.providerId.localeCompare(right.providerId),
      );
      const computedAtMs =
        sortedLayers.length === 0
          ? Date.now()
          : Math.max(...sortedLayers.map((layer) => layer.computedAtMs));

      return {
        layers: sortedLayers,
        computedAtMs,
      };
    },

    removeLayer(providerId: OverlayProviderId): boolean {
      try {
        overlayProviderIdFromString(providerId);
      } catch (error) {
        throw new OverlayManagerError("validation", "invalid provider_id", { cause: error });
      }

      return layers.delete(providerId);
    },
  };
}
