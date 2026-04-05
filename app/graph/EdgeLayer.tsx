import { For, createMemo } from "solid-js";

import type { InteractionService } from "./InteractionService";
import type { TransitionService } from "./TransitionService";
import { EdgePath } from "./EdgePath";
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
        <marker
          id="graph-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b949e" />
        </marker>
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
