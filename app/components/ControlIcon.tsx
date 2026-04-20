import type { JSX } from "solid-js";

// Font-independent icons for UI controls that previously relied on
// Unicode glyphs outside the bundled Inter/JetBrains Mono coverage
// (ℹ ❯ ⏸ ⏭ ⏹ ▶). Keeping the <path> set co-located with the component
// so every call site renders the same stroke/fill treatment without
// duplicating the SVG markup.
export type ControlIconKind =
  | "info"
  | "chevron-right"
  | "play"
  | "pause"
  | "step-forward"
  | "stop";

type Geometry = { d: string; fill: "currentColor" | "none" };

const GEOMETRY: Record<ControlIconKind, Geometry> = {
  // Lowercase "i": dot at top, vertical bar below.
  info: { d: "M5 1.5 L5 2.5 M5 4 L5 8.5", fill: "none" },
  "chevron-right": { d: "M3.5 1.5 L7 5 L3.5 8.5", fill: "none" },
  play: { d: "M2.5 1.5 L8 5 L2.5 8.5 Z", fill: "currentColor" },
  pause: { d: "M3 1.5 L3 8.5 M7 1.5 L7 8.5", fill: "none" },
  // Step-forward: right-pointing triangle + trailing bar.
  "step-forward": { d: "M2 2 L6 5 L2 8 Z M7 2 L7 8", fill: "currentColor" },
  stop: { d: "M2.5 2.5 L7.5 2.5 L7.5 7.5 L2.5 7.5 Z", fill: "currentColor" },
};

export function ControlIcon(props: {
  kind: ControlIconKind;
  size?: number;
  style?: JSX.CSSProperties;
}) {
  const size = () => props.size ?? 10;
  const geom = () => GEOMETRY[props.kind];
  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 10 10"
      aria-hidden="true"
      style={{ "flex-shrink": 0, ...props.style }}
    >
      <path
        d={geom().d}
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill={geom().fill}
      />
    </svg>
  );
}
