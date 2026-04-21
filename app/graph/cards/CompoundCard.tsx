import { Show, createMemo } from "solid-js";

import { getIconSvgByKind } from "../../lib/node-visuals";
import type { GraphCardProps } from "./CardRegistry";
import { hexToRgbTuple } from "./color";

export function CompoundCard(props: GraphCardProps) {
  const accentColor = createMemo(() => {
    const color = props.node.data.color;
    return typeof color === "string" && color.length > 0 ? color : undefined;
  });
  const accentGlow = createMemo(() => {
    const color = accentColor();
    return color ? hexToRgbTuple(color) : null;
  });
  const cardStyle = createMemo(() => {
    const color = accentColor();
    if (!color) return undefined;

    const glow = accentGlow();
    return glow
      ? {
          "--node-accent": color,
          "--node-border": color,
          "--node-accent-glow": glow,
        }
      : {
          "--node-accent": color,
          "--node-border": color,
        };
  });

  return (
    <div
      class="graph-card graph-card--compound"
      style={cardStyle()}
      title={props.node.label}
    >
      <div class="compound-card-header">
        <Show when={props.zoomTier !== "dot" && getIconSvgByKind(props.node.kind)}>
          <span
            class="graph-card-icon"
            aria-hidden="true"
            innerHTML={getIconSvgByKind(props.node.kind) ?? ""}
          />
        </Show>
        <Show when={props.zoomTier === "label" || props.zoomTier === "full"}>
          <span class="graph-card-label">{props.node.label}</span>
        </Show>
      </div>
      <div class="compound-card-children">{props.children}</div>
    </div>
  );
}
