import { For, createMemo } from "solid-js";

import type { InteractionService } from "./InteractionService";
import type { TransitionService } from "./TransitionService";
import { EdgePath, getEdgeColor, getMarkerIdForKind } from "./EdgePath";
import type { GraphDefinition } from "./layout/types";

type EdgeLayerProps = {
  graph: GraphDefinition;
  zoom: number;
  interaction: InteractionService;
  transition: TransitionService;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
};

export function EdgeLayer(props: EdgeLayerProps) {
  const nodeById = createMemo(() => {
    return new Map(props.graph.nodes.map((node) => [node.id, node]));
  });
  const markerKinds = createMemo(() => {
    return Array.from(new Set(["edge", ...props.graph.edges.map((edge) => edge.kind)]));
  });

  return (
    <svg
      classList={{
        "edge-layer": true,
        "is-entering": props.transition.phase() === "entering",
        "is-exiting": props.transition.phase() === "exiting",
      }}
      width="100%"
      height="100%"
    >
      <defs>
        <For each={markerKinds()}>
          {(kind) => (
            <marker
              id={getMarkerIdForKind(kind)}
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="10"
              markerHeight="7"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={getEdgeColor(kind)} />
            </marker>
          )}
        </For>
      </defs>

      <g>
        <For each={props.graph.edges}>
          {(edge) => {
            const source = nodeById().get(edge.source);
            const target = nodeById().get(edge.target);
            if (!source || !target) return null;

            const hoveredNodeId = props.interaction.hoveredNodeId();
            const highlighted = props.interaction.highlightedEdges().has(edge.id);
            const dimmed = !!hoveredNodeId && !highlighted;

            return (
              <EdgePath
                edge={edge}
                source={source}
                target={target}
                dimmed={dimmed}
                highlighted={highlighted}
                labelVisible={props.zoom >= 0.5}
                onEdgeTap={props.onEdgeTap}
              />
            );
          }}
        </For>
      </g>
    </svg>
  );
}
