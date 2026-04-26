import {
  createContext,
  createMemo,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

import { zoomBandForFactor, type ZoomBand } from "./zoom";

interface ZoomBandProviderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Reactive accessor for the current continuous zoom factor. */
  factor: Accessor<number>;
  children: JSX.Element;
}

const ZoomBandContext = createContext<Accessor<ZoomBand> | null>(null);

function clampZoomFactor(factor: number) {
  return Math.min(8.0, Math.max(0, factor));
}

export function ZoomBandProvider(props: ZoomBandProviderProps): JSX.Element {
  const [local, divProps] = splitProps(props, ["factor", "children"]);
  const zoomBand = createMemo(() => zoomBandForFactor(clampZoomFactor(local.factor())));

  return (
    <ZoomBandContext.Provider value={zoomBand}>
      <div {...divProps} data-zoom-band={zoomBand()}>
        {local.children}
      </div>
    </ZoomBandContext.Provider>
  );
}

export function useZoomBand(): Accessor<ZoomBand> {
  const zoomBand = useContext(ZoomBandContext);
  if (zoomBand === null) {
    throw new Error("useZoomBand must be used inside a ZoomBandProvider");
  }

  return zoomBand;
}
