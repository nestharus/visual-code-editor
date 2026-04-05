import { For, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { InteractionService } from "./InteractionService";
import type { TransitionService } from "./TransitionService";
import { CompoundCard } from "./cards/CompoundCard";
import { getCardComponent, type GraphZoomTier } from "./cards/CardRegistry";
import type { GraphDefinition, GraphNode } from "./layout/types";

type NodeLayerProps = {
  graph: GraphDefinition;
  zoom: number;
  interaction: InteractionService;
  transition: TransitionService;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
};

type GraphNodeItemProps = {
  node: GraphNode;
  childMap: Map<string, GraphNode[]>;
  zoom: number;
  interaction: InteractionService;
  transition: TransitionService;
  onNodeTap?: (nodeId: string, kind: string, label: string) => void;
  parentLeft?: number;
  parentTop?: number;
};

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

function GraphNodeItem(props: GraphNodeItemProps) {
  const childNodes = () => props.childMap.get(props.node.id) ?? [];
  const hasChildren = () => childNodes().length > 0;
  const width = () => props.node.size?.width ?? 150;
  const height = () => props.node.size?.height ?? 60;
  const absoluteLeft = () => (props.node.position?.x ?? 0) - width() / 2;
  const absoluteTop = () => (props.node.position?.y ?? 0) - height() / 2;
  const relativeLeft = () => absoluteLeft() - (props.parentLeft ?? 0);
  const relativeTop = () => absoluteTop() - (props.parentTop ?? 0);
  const zoomTier = () => computeZoomTier(props.node, props.zoom);
  const Card = () =>
    hasChildren() ? CompoundCard : getCardComponent(props.node.kind);

  return (
    <div
      classList={{
        "graph-node": true,
        dimmed: props.interaction.dimmedNodes().has(props.node.id),
        entering: props.transition.enteringNodeIds().has(props.node.id),
        exiting: props.transition.exitingNodeIds().has(props.node.id),
        "is-compound": hasChildren(),
        "is-hovered": props.interaction.hoveredNodeId() === props.node.id,
      }}
      data-kind={props.node.kind}
      data-zoom-tier={zoomTier()}
      style={{
        left: `${relativeLeft()}px`,
        top: `${relativeTop()}px`,
        width: `${width()}px`,
        height: `${height()}px`,
        "transition-delay": props.transition.getNodeDelay(props.node.id),
      }}
      onMouseEnter={() => props.interaction.setHoveredNodeId(props.node.id)}
      onMouseLeave={() => props.interaction.setHoveredNodeId(null)}
      onClick={(event) => {
        event.stopPropagation();
        props.onNodeTap?.(props.node.id, props.node.kind, props.node.label);
      }}
    >
      <Dynamic component={Card()} node={props.node} zoomTier={zoomTier()}>
        <For each={sortNodes(childNodes())}>
          {(child) => (
            <GraphNodeItem
              node={child}
              childMap={props.childMap}
              zoom={props.zoom}
              interaction={props.interaction}
              transition={props.transition}
              onNodeTap={props.onNodeTap}
              parentLeft={absoluteLeft()}
              parentTop={absoluteTop()}
            />
          )}
        </For>
      </Dynamic>
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
            onNodeTap={props.onNodeTap}
          />
        )}
      </For>
    </div>
  );
}
