import { Show } from "solid-js";

import { getIconSvgByKind } from "../../lib/node-visuals";
import type { GraphCardProps } from "./CardRegistry";

export function CompoundCard(props: GraphCardProps) {
  const accentColor = () => {
    const color = props.node.data.color;
    return typeof color === "string" && color.length > 0 ? color : undefined;
  };

  return (
    <div
      class="graph-card graph-card--compound"
      style={
        accentColor()
          ? {
              "--node-accent": accentColor(),
              "--node-border": accentColor(),
            }
          : undefined
      }
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
