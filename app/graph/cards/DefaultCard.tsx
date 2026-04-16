import { Show } from "solid-js";

import { getIconSvgByKind } from "../../lib/node-visuals";
import { resolveNodeShape, shapeClassName } from "../layout/shapes";
import type { GraphCardProps } from "./CardRegistry";

// Kinds that have per-kind CSS accent colors — don't override with data.color
const CSS_ACCENTED_KINDS = new Set([
  "store", "external", "agent-node", "file-node",
  "behavioral-lifecycle", "behavioral-stage", "behavioral-step",
]);

function resolveAccentColor(props: GraphCardProps) {
  if (CSS_ACCENTED_KINDS.has(props.node.kind)) return undefined;

  const color = props.node.data.color;
  if (typeof color === "string" && color.length > 0) {
    return color;
  }

  const borderColor = props.node.data.borderColor;
  if (typeof borderColor === "string" && borderColor.length > 0) {
    return borderColor;
  }

  return undefined;
}

export function DefaultCard(props: GraphCardProps) {
  const iconSvg = () => getIconSvgByKind(props.node.kind);
  const accentColor = () => resolveAccentColor(props);
  const shape = () => resolveNodeShape(props.node.kind, false);

  return (
    <div
      class={`graph-card graph-card--default ${shapeClassName(shape())}`}
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
      <Show when={props.zoomTier !== "dot" && iconSvg()}>
        <span class="graph-card-icon" aria-hidden="true" innerHTML={iconSvg() ?? ""} />
      </Show>
      <Show when={props.zoomTier === "label" || props.zoomTier === "full"}>
        <span class="graph-card-label">{props.node.label}</span>
      </Show>
    </div>
  );
}
