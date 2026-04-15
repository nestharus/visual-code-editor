import ELK, {
  type ElkEdgeSection,
  type ElkExtendedEdge,
  type ElkNode,
  type ElkPoint,
} from "elkjs/lib/elk.bundled";

import type { GraphDefinition, GraphEdge, GraphNode } from "./types";

const elk = new ELK();

type Point = { x: number; y: number };
type Frame = { left: number; top: number; width: number; height: number };
type ElkEdgeWithContainer = ElkExtendedEdge & { container?: string };

function getNodeSize(node: GraphNode) {
  return {
    width: node.size?.width ?? 150,
    height: node.size?.height ?? 60,
  };
}

function buildElkChildren(
  nodeId: string | undefined,
  nodes: GraphNode[],
  nodeIds: Set<string>,
): ElkNode[] {
  return nodes
    .filter((node) =>
      nodeId
        ? node.parent === nodeId
        : !node.parent || !nodeIds.has(node.parent),
    )
    .map((node) => {
      const size = getNodeSize(node);
      const children = buildElkChildren(node.id, nodes, nodeIds);
      const hasChildren = children.length > 0;

      return {
        id: node.id,
        width: size.width,
        height: size.height,
        children: hasChildren ? children : undefined,
        layoutOptions: hasChildren
          ? { "elk.padding": "[top=36,left=20,bottom=20,right=20]" }
          : undefined,
      };
    });
}

function collectNodeFrames(
  graph: ElkNode,
  frames = new Map<string, Frame>(),
  offset: Point = { x: 0, y: 0 },
) {
  for (const child of graph.children ?? []) {
    const width = child.width ?? 150;
    const height = child.height ?? 60;
    const left = offset.x + (child.x ?? 0);
    const top = offset.y + (child.y ?? 0);

    frames.set(child.id, { left, top, width, height });
    collectNodeFrames(child, frames, { x: left, y: top });
  }

  return frames;
}

function extractNodePositions(
  result: ElkNode,
  originalNodes: GraphNode[],
): { nodes: GraphNode[]; frames: Map<string, Frame> } {
  const frames = collectNodeFrames(result);

  return {
    nodes: originalNodes.map((node) => {
      const frame = frames.get(node.id);
      if (!frame) return node;

      return {
        ...node,
        position: {
          x: frame.left + frame.width / 2,
          y: frame.top + frame.height / 2,
        },
        size: {
          width: frame.width,
          height: frame.height,
        },
      };
    }),
    frames,
  };
}

function orderSections(sections: ElkEdgeSection[]) {
  if (sections.length <= 1) return sections;

  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered: ElkEdgeSection[] = [];
  const visited = new Set<string>();
  let current =
    sections.find((section) => !section.incomingSections?.length) ?? sections[0];

  while (current && !visited.has(current.id)) {
    ordered.push(current);
    visited.add(current.id);

    const nextId = current.outgoingSections?.find((id) => !visited.has(id));
    current = nextId ? byId.get(nextId) : undefined;
  }

  for (const section of sections) {
    if (!visited.has(section.id)) {
      ordered.push(section);
    }
  }

  return ordered;
}

function pushPoint(points: Point[], point: ElkPoint, offset: Point) {
  const next = {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
  const previous = points[points.length - 1];
  if (
    previous &&
    Math.abs(previous.x - next.x) < 0.001 &&
    Math.abs(previous.y - next.y) < 0.001
  ) {
    return;
  }

  points.push(next);
}

function extractSectionPoints(
  sections: ElkEdgeSection[] | undefined,
  offset: Point,
): Point[] {
  if (!sections?.length) return [];

  const points: Point[] = [];
  for (const section of orderSections(sections)) {
    pushPoint(points, section.startPoint, offset);
    for (const bendPoint of section.bendPoints ?? []) {
      pushPoint(points, bendPoint, offset);
    }
    pushPoint(points, section.endPoint, offset);
  }

  return points;
}

function collectElkEdges(graph: ElkNode, edges: ElkEdgeWithContainer[] = []) {
  edges.push(...((graph.edges as ElkEdgeWithContainer[] | undefined) ?? []));

  for (const child of graph.children ?? []) {
    collectElkEdges(child, edges);
  }

  return edges;
}

function extractEdgeRoutes(
  result: ElkNode,
  originalEdges: GraphEdge[],
  frames: Map<string, Frame>,
): GraphEdge[] {
  const originalById = new Map(originalEdges.map((edge) => [edge.id, edge]));
  const routedById = new Map<string, GraphEdge>();

  for (const edge of collectElkEdges(result)) {
    const original = originalById.get(edge.id);
    if (!original) continue;

    const containerFrame =
      edge.container && edge.container !== result.id
        ? frames.get(edge.container)
        : undefined;
    const offset = containerFrame
      ? { x: containerFrame.left, y: containerFrame.top }
      : { x: 0, y: 0 };
    const bendPoints = extractSectionPoints(edge.sections, offset);

    routedById.set(edge.id, {
      ...original,
      bendPoints: bendPoints.length > 0 ? bendPoints : original.bendPoints,
    });
  }

  return originalEdges.map((edge) => routedById.get(edge.id) ?? edge);
}

export async function computeElkLayout(
  graph: GraphDefinition,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  if (graph.nodes.length === 0) {
    return { nodes: graph.nodes, edges: graph.edges };
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const elkGraph: ElkNode = {
    id: graph.id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": graph.direction === "RIGHT" ? "RIGHT" : "DOWN",
      "elk.spacing.nodeNode": "80",
      "elk.spacing.edgeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: buildElkChildren(undefined, graph.nodes, nodeIds),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(elkGraph);
  const { nodes, frames } = extractNodePositions(result, graph.nodes);
  const edges = extractEdgeRoutes(result, graph.edges, frames);

  return { nodes, edges };
}
