import type { GraphEdge, GraphNode } from "./layout/types";

type EdgePathProps = {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
  dimmed: boolean;
  highlighted: boolean;
  labelVisible: boolean;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
};

function buildPath(source: GraphNode, target: GraphNode) {
  const sourceX = source.position?.x ?? 0;
  const sourceY = source.position?.y ?? 0;
  const targetX = target.position?.x ?? 0;
  const targetY = target.position?.y ?? 0;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;

  if (Math.abs(deltaX) < 36 || Math.abs(deltaY) < 36) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  const c1x = sourceX + deltaX * 0.25;
  const c1y = sourceY;
  const c2x = sourceX + deltaX * 0.75;
  const c2y = targetY;
  return `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
}

export function EdgePath(props: EdgePathProps) {
  const sourceX = () => props.source.position?.x ?? 0;
  const sourceY = () => props.source.position?.y ?? 0;
  const targetX = () => props.target.position?.x ?? 0;
  const targetY = () => props.target.position?.y ?? 0;
  const midX = () => (sourceX() + targetX()) / 2;
  const midY = () => (sourceY() + targetY()) / 2;
  const pathData = () => buildPath(props.source, props.target);

  return (
    <g
      classList={{
        "graph-edge": true,
        dimmed: props.dimmed,
        highlighted: props.highlighted,
        "flow-active": props.highlighted,
      }}
      data-kind={props.edge.kind}
    >
      <path
        class="edge-hit-target"
        d={pathData()}
        onClick={(event) => {
          event.stopPropagation();
          props.onEdgeTap?.(props.edge.id, props.edge.kind, props.edge.label || "");
        }}
      />
      <path
        class="edge-path"
        d={pathData()}
        marker-end="url(#graph-arrowhead)"
      />
      {props.labelVisible && props.edge.label ? (
        <text
          class="edge-label"
          x={midX()}
          y={midY()}
          text-anchor="middle"
          dominant-baseline="central"
          onClick={(event) => {
            event.stopPropagation();
            props.onEdgeTap?.(props.edge.id, props.edge.kind, props.edge.label || "");
          }}
        >
          {props.edge.label}
        </text>
      ) : null}
    </g>
  );
}
