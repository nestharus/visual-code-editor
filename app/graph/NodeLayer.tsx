import { For, Show, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

import { captureClickRect } from "./DrillTransition";
import { resolveNodeShape } from "./layout/shapes";
import type { InteractionService } from "./InteractionService";
import type { PresentationStateService } from "./PresentationStateService";
import type { TransitionService } from "./TransitionService";
import { CompoundCard } from "./cards/CompoundCard";
import { getCardComponent, type GraphZoomTier } from "./cards/CardRegistry";
import type { GraphDefinition, GraphNode } from "./layout/types";

const NAVIGABLE_KINDS = new Set([
  "cluster", "system", "external",
  "lifecycle", "behavioral-lifecycle",
  "stage", "behavioral-stage",
]);

type NodeLayerProps = {
  graph: GraphDefinition;
  zoom: number;
  interaction: InteractionService;
  transition: TransitionService;
  presentation: PresentationStateService;
  playableNodeIds?: Set<string>;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
  onNodeInfo?: (nodeId: string, kind: string, label: string) => void;
};

type GraphNodeItemProps = {
  node: GraphNode;
  childMap: Map<string, GraphNode[]>;
  zoom: number;
  interaction: InteractionService;
  transition: TransitionService;
  playableNodeIds?: Set<string>;
  onNodeInfo?: (nodeId: string, kind: string, label: string) => void;
  presentation: PresentationStateService;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
  parentLeft?: number;
  parentTop?: number;
};

function floatSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 100) / 100;
}

function computeZoomTier(node: GraphNode, zoom: number): GraphZoomTier {
  const renderedWidth = (node.size?.width ?? 150) * zoom;

  if (renderedWidth < 16) return "dot";
  if (renderedWidth < 30) return "icon";
  if (renderedWidth < 80) return "label";
  return "full";
}

function sortNodes(nodes: GraphNode[]) {
  return [...nodes].sort((a, b) => {
    const ay = a.position?.y ?? 0;
    const by = b.position?.y ?? 0;
    if (ay !== by) return ay - by;
    return (a.position?.x ?? 0) - (b.position?.x ?? 0);
  });
}

const DRILLABLE_KINDS = new Set([
  "cluster", "behavioral-lifecycle-group", "system", "external",
  "lifecycle", "behavioral-lifecycle", "stage", "behavioral-stage",
]);

function GraphNodeItem(props: GraphNodeItemProps) {
  const childNodes = () => props.childMap.get(props.node.id) ?? [];
  const hasChildren = () => childNodes().length > 0;
  const isDrillable = () => DRILLABLE_KINDS.has(props.node.kind);

  const rect = () => props.presentation.composedRect(props.node.id);
  const absoluteLeft = () => rect().left;
  const absoluteTop = () => rect().top;
  const width = () => rect().width;
  const height = () => rect().height;
  const relativeLeft = () => absoluteLeft() - (props.parentLeft ?? 0);
  const relativeTop = () => absoluteTop() - (props.parentTop ?? 0);

  const visual = () => props.presentation.state(props.node.id);
  const hoverPhase = () => props.presentation.hoverPhase(props.node.id);
  const isElevated = () => hoverPhase() !== "idle";
  const zoomTier = () => computeZoomTier(props.node, props.zoom);
  const Card = () =>
    hasChildren() ? CompoundCard : getCardComponent(props.node.kind);

  const isFloating = () =>
    !hasChildren() &&
    !isElevated() &&
    !props.interaction.dimmedNodes().has(props.node.id) &&
    !props.transition.enteringNodeIds().has(props.node.id) &&
    !props.transition.exitingNodeIds().has(props.node.id);

  const setHovered = (hovered: boolean) => {
    props.interaction.setHoveredNodeId(hovered ? props.node.id : null);
    props.presentation.setHoverTarget(props.node.id, hovered, hasChildren());
  };

  return (
    <div
      classList={{
        "graph-node": true,
        dimmed: props.interaction.dimmedNodes().has(props.node.id),
        entering: props.transition.enteringNodeIds().has(props.node.id),
        exiting: props.transition.exitingNodeIds().has(props.node.id),
        "is-compound": hasChildren(),
        "is-hovered": hoverPhase() === "hovered",
        "is-selected": props.interaction.selectedNodeIds().has(props.node.id),
        "is-settling": hoverPhase() === "settling",
      }}
      data-kind={props.node.kind}
      data-zoom-tier={zoomTier()}
      style={{
        left: `${relativeLeft()}px`,
        top: `${relativeTop()}px`,
        width: `${width()}px`,
        height: `${height()}px`,
        "z-index": isElevated() ? "40" : hasChildren() ? "1" : undefined,
        "--node-transition-delay": props.transition.getNodeDelay(props.node.id),
        "--float-seed": String(floatSeed(props.node.id)),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) {
          props.interaction.toggleSelection(props.node.id);
          return;
        }
        const el = event.currentTarget as HTMLElement;
        captureClickRect(
          el.getBoundingClientRect(),
          resolveNodeShape(props.node.kind, hasChildren()),
        );
        props.onNodeTap?.(props.node.id, props.node.kind, props.node.label);
      }}
    >
      <div
        class="graph-node-inner"
        style={{
          transform: `scale(${visual().innerScale})`,
          opacity: visual().opacity,
        }}
      >
        <span class="graph-node-select-check" aria-hidden="true">
          {"\u2713"}
        </span>
        <div classList={{ "graph-node-float": true, "is-floating": isFloating() }}>
          <Dynamic component={Card()} node={props.node} zoomTier={zoomTier()}>
            <For each={sortNodes(childNodes())}>
              {(child) => (
                <GraphNodeItem
                  node={child}
                  childMap={props.childMap}
                  zoom={props.zoom}
                  interaction={props.interaction}
                  transition={props.transition}
                  presentation={props.presentation}
                  onNodeTap={props.onNodeTap}
                  onNodeInfo={props.onNodeInfo}
                  playableNodeIds={props.playableNodeIds}
                  parentLeft={absoluteLeft()}
                  parentTop={absoluteTop()}
                />
              )}
            </For>
          </Dynamic>
        </div>
        <Show when={
          !hasChildren() &&
          (zoomTier() === "label" || zoomTier() === "full")
        }>
          <Show when={NAVIGABLE_KINDS.has(props.node.kind)}>
            <button
              type="button"
              class="graph-node-info-btn"
              title="View details"
              onClick={(event) => {
                event.stopPropagation();
                props.onNodeInfo?.(props.node.id, props.node.kind, props.node.label);
              }}
            >
              {"\u2139"}
            </button>
          </Show>
          <Show when={isDrillable() && !hasChildren()}>
            <span class="graph-node-drill-indicator" title="Click to explore">
              {"\u276F"}
            </span>
          </Show>
          <Show when={props.playableNodeIds?.has(props.node.id)}>
            <span class="graph-node-behavior-indicator" title="Has behaviors">
              {"\uD83C\uDFAC"}
            </span>
          </Show>
        </Show>
      </div>
    </div>
  );
}

export function NodeLayer(props: NodeLayerProps) {
  const childMap = createMemo(() => {
    const next = new Map<string, GraphNode[]>();

    for (const node of props.graph.nodes) {
      if (!node.parent) continue;
      const siblings = next.get(node.parent) ?? [];
      siblings.push(node);
      next.set(node.parent, siblings);
    }

    return next;
  });

  const nodeById = createMemo(() => {
    return new Map(props.graph.nodes.map((node) => [node.id, node]));
  });

  const rootNodes = createMemo(() => {
    return sortNodes(
      props.graph.nodes.filter(
        (node) => !node.parent || !nodeById().has(node.parent),
      ),
    );
  });

  return (
    <div class="node-layer">
      <For each={rootNodes()}>
        {(node) => (
          <GraphNodeItem
            node={node}
            childMap={childMap()}
            zoom={props.zoom}
            interaction={props.interaction}
            transition={props.transition}
            presentation={props.presentation}
            onNodeTap={props.onNodeTap}
            onNodeInfo={props.onNodeInfo}
            playableNodeIds={props.playableNodeIds}
          />
        )}
      </For>
    </div>
  );
}
