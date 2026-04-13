import { For, createMemo } from "solid-js";

import type { InteractionService } from "./InteractionService";
import type { PresentationStateService } from "./PresentationStateService";
import type { TransitionService } from "./TransitionService";
import { EdgePath, getEdgeColor, getMarkerIdForKind } from "./EdgePath";
import type { TransportStoreType } from "./TransportStore";
import type { GraphDefinition } from "./layout/types";
import { resolveNodeShape } from "./layout/shapes";

function MarkerDefs(props: { kinds: string[] }) {
  return (
    <defs>
      <For each={props.kinds}>
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
  );
}

// --- BaseEdgeLayer: all edges behind nodes, no interaction ---

type BaseEdgeLayerProps = {
  graph: GraphDefinition;
  interaction: InteractionService;
  transition: TransitionService;
  presentation: PresentationStateService;
};

export function BaseEdgeLayer(props: BaseEdgeLayerProps) {
  const nodeIds = createMemo(() => new Set(props.graph.nodes.map((n) => n.id)));
  const compoundIds = createMemo(() => {
    const parents = new Set(props.graph.nodes.map((n) => n.parent).filter(Boolean) as string[]);
    return parents;
  });
  const nodeKind = createMemo(() => new Map(props.graph.nodes.map((n) => [n.id, n.kind])));
  const markerKinds = createMemo(() =>
    Array.from(new Set(["edge", ...props.graph.edges.map((e) => e.kind)])),
  );

  return (
    <svg
      classList={{
        "base-edge-layer": true,
        "is-entering": props.transition.phase() === "entering",
        "is-exiting": props.transition.phase() === "exiting",
      }}
      width="100%"
      height="100%"
    >
      <MarkerDefs kinds={markerKinds()} />
      <g>
        <For each={props.graph.edges}>
          {(edge) => {
            if (!nodeIds().has(edge.source) || !nodeIds().has(edge.target)) return null;

            return (
              <EdgePath
                edge={edge}
                sourceRect={props.presentation.composedRect(edge.source)}
                targetRect={props.presentation.composedRect(edge.target)}
                sourceShape={resolveNodeShape(nodeKind().get(edge.source) ?? "", compoundIds().has(edge.source))}
                targetShape={resolveNodeShape(nodeKind().get(edge.target) ?? "", compoundIds().has(edge.target))}
                sourceTx={props.presentation.tx(edge.source)}
                sourceTy={props.presentation.ty(edge.source)}
                targetTx={props.presentation.tx(edge.target)}
                targetTy={props.presentation.ty(edge.target)}
                sourceInnerScale={props.presentation.innerScale(edge.source)}
                targetInnerScale={props.presentation.innerScale(edge.target)}
                dimmed={props.interaction.dimmedEdges().has(edge.id)}
                highlighted={false}
                labelVisible={false}
              />
            );
          }}
        </For>
      </g>
    </svg>
  );
}

type OverlayLayerProps = {
  graph: GraphDefinition;
  zoom: number;
  interaction: InteractionService;
  presentation: PresentationStateService;
  transport?: TransportStoreType;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
};

function createEdgeLayerState(props: Pick<OverlayLayerProps, "graph" | "interaction">) {
  const nodeIds = createMemo(() => new Set(props.graph.nodes.map((n) => n.id)));
  const compoundIds = createMemo(() => {
    const parents = new Set(props.graph.nodes.map((n) => n.parent).filter(Boolean) as string[]);
    return parents;
  });
  const nodeKind = createMemo(() => new Map(props.graph.nodes.map((n) => [n.id, n.kind])));
  const markerKinds = createMemo(() =>
    Array.from(new Set(["edge", ...props.graph.edges.map((e) => e.kind)])),
  );
  const overlayEdges = createMemo(() =>
    props.graph.edges.filter(
      (e) => props.interaction.overlayEdgeIds().has(e.id) && nodeIds().has(e.source) && nodeIds().has(e.target),
    ),
  );

  return {
    nodeIds,
    compoundIds,
    nodeKind,
    markerKinds,
    overlayEdges,
  };
}

// --- HighlightedEdgeLayer: highlighted edges + labels behind nodes ---

export function HighlightedEdgeLayer(props: OverlayLayerProps) {
  const { compoundIds, markerKinds, nodeKind, overlayEdges } = createEdgeLayerState(props);

  return (
    <svg class="overlay-layer highlighted-edge-layer" width="100%" height="100%">
      <MarkerDefs kinds={markerKinds()} />
      <g>
        <For each={overlayEdges()}>
          {(edge) => (
            <EdgePath
              edge={edge}
              sourceRect={props.presentation.composedRect(edge.source)}
              targetRect={props.presentation.composedRect(edge.target)}
              sourceShape={resolveNodeShape(nodeKind().get(edge.source) ?? "", compoundIds().has(edge.source))}
              targetShape={resolveNodeShape(nodeKind().get(edge.target) ?? "", compoundIds().has(edge.target))}
              sourceTx={props.presentation.tx(edge.source)}
              sourceTy={props.presentation.ty(edge.source)}
              targetTx={props.presentation.tx(edge.target)}
              targetTy={props.presentation.ty(edge.target)}
              sourceInnerScale={props.presentation.innerScale(edge.source)}
              targetInnerScale={props.presentation.innerScale(edge.target)}
              dimmed={false}
              highlighted={true}
              labelVisible={props.zoom >= 0.5}
              onEdgeTap={props.onEdgeTap}
            />
          )}
        </For>
      </g>
    </svg>
  );
}

// --- EdgeHitLayer: invisible hit targets + highlighted labels above nodes ---

export function EdgeHitLayer(props: OverlayLayerProps) {
  const { compoundIds, markerKinds, nodeIds, nodeKind, overlayEdges } = createEdgeLayerState(props);

  return (
    <svg class="overlay-layer" width="100%" height="100%">
      <MarkerDefs kinds={markerKinds()} />
      {/* Highlighted edge labels rendered above nodes for readability */}
      <g>
        <For each={overlayEdges()}>
          {(edge) => (
            <EdgePath
              edge={edge}
              sourceRect={props.presentation.composedRect(edge.source)}
              targetRect={props.presentation.composedRect(edge.target)}
              sourceShape={resolveNodeShape(nodeKind().get(edge.source) ?? "", compoundIds().has(edge.source))}
              targetShape={resolveNodeShape(nodeKind().get(edge.target) ?? "", compoundIds().has(edge.target))}
              sourceTx={props.presentation.tx(edge.source)}
              sourceTy={props.presentation.ty(edge.source)}
              targetTx={props.presentation.tx(edge.target)}
              targetTy={props.presentation.ty(edge.target)}
              sourceInnerScale={props.presentation.innerScale(edge.source)}
              targetInnerScale={props.presentation.innerScale(edge.target)}
              dimmed={false}
              highlighted={true}
              labelVisible={props.zoom >= 0.5}
              labelOnly={true}
            />
          )}
        </For>
      </g>
      {/* Hit targets for all edges */}
      <g>
        <For each={props.graph.edges}>
          {(edge) => {
            if (!nodeIds().has(edge.source) || !nodeIds().has(edge.target)) return null;

            return (
              <EdgePath
                edge={edge}
                sourceRect={props.presentation.composedRect(edge.source)}
                targetRect={props.presentation.composedRect(edge.target)}
                sourceShape={resolveNodeShape(nodeKind().get(edge.source) ?? "", compoundIds().has(edge.source))}
                targetShape={resolveNodeShape(nodeKind().get(edge.target) ?? "", compoundIds().has(edge.target))}
                sourceTx={props.presentation.tx(edge.source)}
                sourceTy={props.presentation.ty(edge.source)}
                targetTx={props.presentation.tx(edge.target)}
                targetTy={props.presentation.ty(edge.target)}
                sourceInnerScale={props.presentation.innerScale(edge.source)}
                targetInnerScale={props.presentation.innerScale(edge.target)}
                dimmed={false}
                highlighted={false}
                labelVisible={false}
                hitOnly={true}
                onEdgeTap={props.onEdgeTap}
                onEdgeHover={(id) => props.interaction.setHoveredEdgeId(id)}
              />
            );
          }}
        </For>
      </g>
    </svg>
  );
}

// --- TransportLayer: transport tokens above nodes ---

export function TransportLayer(props: OverlayLayerProps) {
  return (
    <svg class="overlay-layer" width="100%" height="100%">
      {props.transport ? (
        <g class="transport-layer">
          <For each={props.transport.tokens as readonly import("./TransportStore").TransportToken[]}>
            {(token) => {
              if (token.status === "done") return null;
              const position = props.transport!.getTokenPosition(token);
              if (!position) return null;
              return (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={token.status === "pulse" ? 8 : 5}
                  classList={{
                    "transport-token": true,
                    "transport-pulse": token.status === "pulse",
                  }}
                />
              );
            }}
          </For>
        </g>
      ) : null}
    </svg>
  );
}
