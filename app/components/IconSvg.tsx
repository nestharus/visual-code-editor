import { Show } from "solid-js";
import { getIconSvgByKind } from "../lib/node-visuals";

export function IconSvg(props: { kind: string; size?: number; color?: string }) {
  const svgHtml = () => getIconSvgByKind(props.kind || "");

  return (
    <Show when={svgHtml()}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          width: `${props.size || 24}px`,
          height: `${props.size || 24}px`,
          color: props.color || "currentColor",
        }}
        innerHTML={svgHtml()}
      />
    </Show>
  );
}
